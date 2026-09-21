/**
 * tts.ts — a script becomes an MP3 (#4).
 *
 * This is the ONLY file that talks to a speech provider. Everything above it deals in lines and
 * blocks; everything provider-shaped lives here, so swapping voices or vendors is one file.
 *
 * Issue #4 asked for a thin wrapper over `@speech-sdk/core`'s `generateConversation()`. Phase 0
 * measured why that is the wrong shape, and the dependency is being removed:
 *
 *   **A block that opens with speaker B comes back with the voices reversed — 3 times out of 3.**
 *
 * That is a provider bug we cannot fix, only work around, and every part of the workaround lives
 * at the layer an SDK hides:
 *
 *   1. speaker labels are FIXED (Speaker1 = A, Speaker2 = B) whoever talks first;
 *   2. blocks are built so they always OPEN with A — when the next line is B's, the preceding A
 *      line is carried into the new block rather than left behind;
 *   3. every block is transcribed back and checked line by line against who should have said it;
 *   4. a block that comes back wrong is re-voiced, and the best take is kept.
 *
 * An SDK that chunks at 2,500 characters of its own choosing cannot do any of that.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PodcastLine } from "@/contract/podcast-script";

/* ── voices and pacing, all measured in Phase 0 ─────────────────────────────────────────────── */

/** A drives and explains; B is curious and asks the listener's question. Fixed for the episode. */
export const VOICE_A = "Kore";
export const VOICE_B = "Puck";
/**
 * 2.5, not 3.1: same script, same voices, $0.296 against $0.858, 4 block re-takes against 10, and
 * Gold chose it by ear (2026-09-19). Cheaper than Fish at list, too.
 */
export const TTS_MODEL = "gemini-2.5-flash-preview-tts";
const CHECK_MODEL = "gemini-2.5-flash";
const BASE = "https://generativelanguage.googleapis.com/v1beta";

/** Real silence after a retrieval question, so the listener can actually answer it. */
const RETRIEVAL_PAUSE_MS = 2500;
const BLOCK_GAP_MS = 250;
/** Shorter than round 3's 2,200: fewer chances for the voice to drift inside one block. */
const MAX_BLOCK_CHARS = 1500;
const MAX_REVOICE = 2;
/**
 * A request that hangs is worse than one that fails: it holds a worker slot while the heartbeat
 * keeps beating, so nothing recovers it. The first full episode took 2.6 HOURS because one block
 * hung for 45 minutes across its retries. A block is ~90 seconds of speech; anything past this is
 * not coming back.
 */
const TTS_TIMEOUT_MS = 180_000;
const CHECK_TIMEOUT_MS = 120_000;
/** The preview a free listener gets (FR-18). */
export const PREVIEW_SECONDS = 90;

const DELIVERY = `Two friends studying together. Warm, quick and genuinely curious, at a brisk conversational
pace with natural reactions and gentle overlaps in energy — like overhearing a good conversation, never a
presenter. Speaker1 is always the same woman: she explains with quiet confidence. Speaker2 is always the
same man: he is curious, reacts fast, and asks the listener's question. Never swap them.`;
const INTRO_DELIVERY = `This is the opening of the episode: a touch more energy and warmth, like two friends glad the
listener showed up.`;

const VOICE_CHECK_PROMPT = `Transcribe this two-host audio VERBATIM. Label every paragraph by the VOICE, judged only by
how it sounds: WOMAN or MAN. Never infer the speaker from what is said or from turn-taking; if the
voice changes mid-sentence, split the paragraph there. One paragraph per voice change, formatted
exactly as "WOMAN: …" or "MAN: …". No timestamps, no commentary.`;

/* ── WAV plumbing ───────────────────────────────────────────────────────────────────────────── */

export function writeWav(pcm: Uint8Array, sampleRate: number, channels = 1, bits = 16): Uint8Array {
  const blockAlign = (channels * bits) / 8;
  const buf = Buffer.alloc(44 + pcm.length);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + pcm.length, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * blockAlign, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(bits, 34);
  buf.write("data", 36);
  Buffer.from(pcm).copy(buf, 44);
  return new Uint8Array(buf);
}

/**
 * Retry what is worth retrying. Phase 0 wrapped every TTS and voice-check call in this; the port
 * dropped it, and the first full episode died at block 14 of 24 on a single empty response —
 * throwing away thirteen good blocks and the money they cost. A provider hiccup on one block must
 * never lose an episode.
 */
async function withRetry<T>(label: string, fn: () => Promise<T>, tries = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const retryable = /no audio|429|rate|quota|503|500|UNAVAILABLE|overloaded|timeout|timed out|aborted|AbortError|fetch failed|ECONNRESET|socket/i.test(msg);
      if (!retryable || i >= tries) throw new Error(`${label}: ${msg}`);
      await new Promise((r) => setTimeout(r, 4000 * i));
    }
  }
}

/** Silence of a given length, in the same format as the speech around it. */
const silence = (ms: number, sampleRate: number) => new Uint8Array(Math.round((sampleRate * ms) / 1000) * 2);

/* ── Blocks ─────────────────────────────────────────────────────────────────────────────────── */

export interface Block {
  lines: PodcastLine[];
  pauseAfterMs: number;
}

/**
 * Cut the script into blocks that the provider can voice in one call — and that always OPEN with
 * A, because a block opening with B comes back with the voices swapped.
 */
export function toBlocks(lines: PodcastLine[]): Block[] {
  const blocks: Block[] = [];
  let cur: PodcastLine[] = [];
  let chars = 0;
  const flush = (pauseAfterMs: number) => {
    if (cur.length) blocks.push({ lines: cur, pauseAfterMs });
    cur = [];
    chars = 0;
  };
  lines.forEach((line, i) => {
    const cost = line.text.length + 11;
    const newBeat = cur.length > 0 && line.beat !== cur[cur.length - 1].beat;
    const questionStarts =
      cur.length > 0 && line.kind === "retrieval-question" && cur[cur.length - 1].kind !== "retrieval-question";
    if (cur.length && (questionStarts || chars + cost > MAX_BLOCK_CHARS || (newBeat && (chars > MAX_BLOCK_CHARS * 0.6 || cur[cur.length - 1].beat === 0)))) {
      // The carry: if the next line is B's, move the A line before it into the new block, so the
      // new block still opens with A.
      const carry = line.speaker === "B" && cur.length > 1 && cur[cur.length - 1].speaker === "A" ? cur.pop()! : null;
      flush(BLOCK_GAP_MS);
      if (carry) {
        cur.push(carry);
        chars += carry.text.length + 11;
      }
    }
    cur.push(line);
    chars += cost;
    if (line.kind === "retrieval-question" && lines[i + 1]?.kind !== "retrieval-question") flush(RETRIEVAL_PAUSE_MS);
    if (i === lines.length - 1) flush(0);
  });
  return blocks;
}

/* ── One block of speech ────────────────────────────────────────────────────────────────────── */

export interface BlockAudio {
  pcm: Uint8Array;
  sampleRate: number;
  /** Billed audio tokens for this take. */
  audioTokens: number;
}

async function ttsBlock(lines: PodcastLine[], instructions: string, apiKey: string, model: string): Promise<BlockAudio> {
  // Labels are positional and fixed: Speaker1 is A even when B speaks first.
  const transcript = lines.map((l) => `${l.speaker === "A" ? "Speaker1" : "Speaker2"}: ${l.text}`).join("\n");
  const res = await fetch(`${BASE}/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `Delivery instructions:\n${instructions}\n\nTranscript:\n${transcript}` }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: [
              { speaker: "Speaker1", voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE_A } } },
              { speaker: "Speaker2", voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE_B } } },
            ],
          },
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`tts ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[];
    usageMetadata?: { candidatesTokenCount?: number };
  };
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) throw new Error("tts returned no audio");
  const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType ?? "")?.[1] ?? 24000);
  return {
    pcm: new Uint8Array(Buffer.from(part.inlineData.data, "base64")),
    sampleRate: rate,
    audioTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

/* ── Did the right host say it? ─────────────────────────────────────────────────────────────── */

export interface VoiceCheck {
  matched: number;
  total: number;
  /** Lines that came out in the other host's voice. */
  wrong: string[];
  inputTokens: number;
  outputTokens: number;
}

/**
 * Transcribe the block back, labelled by how each voice SOUNDS, and compare with who was supposed
 * to say each line. Two bugs Phase 0 found are baked in here:
 *   - several keys per line, because a name the transcriber spells differently ("Ouyang" → "Oyang")
 *     made a first-words key miss, and an unmatched line is an UNCHECKED line;
 *   - sequential matching, because B often restates A's words and a global search matched B's line
 *     inside A's paragraph — three identical false flags on every take of the Fish run.
 */
export async function voiceCheck(
  lines: PodcastLine[],
  pcm: Uint8Array,
  sampleRate: number,
  apiKey: string,
): Promise<VoiceCheck> {
  const wav = writeWav(pcm, sampleRate);
  const res = await fetch(`${BASE}/models/${CHECK_MODEL}:generateContent?key=${apiKey}`, {
    method: "POST",
    signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { inline_data: { mime_type: "audio/wav", data: Buffer.from(wav).toString("base64") } },
            { text: VOICE_CHECK_PROMPT },
          ],
        },
      ],
      generationConfig: { temperature: 0, maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 0 } },
    }),
  });
  if (!res.ok) throw new Error(`voice check ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const paras = [...text.matchAll(/^(WOMAN|MAN):\s*(.*)$/gim)].map((m) => ({
    voice: m[1].toUpperCase(),
    text: m[2].toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " "),
  }));
  let matched = 0;
  let cursor = 0;
  const wrong: string[] = [];
  for (const l of lines) {
    const w = l.text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
    const keys = [w.slice(0, 5), w.slice(-4), w.slice(1, 5), w.slice(Math.max(0, w.length - 5), -1)]
      .filter((k) => k.length >= Math.min(3, w.length))
      .map((k) => k.join(" "));
    const idx = paras.findIndex((p, i) => i >= cursor && i <= cursor + 3 && keys.some((k) => p.text.includes(k)));
    if (idx < 0) continue;
    cursor = idx;
    matched++;
    if (paras[idx].voice !== (l.speaker === "A" ? "WOMAN" : "MAN")) wrong.push(`${l.speaker}: ${l.text.slice(0, 60)}`);
  }
  return {
    matched,
    total: lines.length,
    wrong,
    inputTokens: json.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

/* ── The whole episode ──────────────────────────────────────────────────────────────────────── */

export interface SpeakOptions {
  apiKey?: string;
  model?: string;
  /** Called per block so the worker can move its `stage` along. */
  onProgress?: (done: number, total: number, note: string) => void;
  /** Every take, INCLUDING re-takes that were discarded — they were paid for. */
  onAudioUsage?: (u: { audioTokens: number; discarded: boolean }) => void;
  onCheckUsage?: (u: { inputTokens: number; outputTokens: number }) => void;
  maxRevoice?: number;
}

export interface SpokenEpisode {
  mp3: Uint8Array;
  /** The first PREVIEW_SECONDS, as its own object — the full file is never sent to make it. */
  previewMp3: Uint8Array;
  durationSeconds: number;
  chapters: { section: string; startS: number }[];
  blocks: number;
  retakes: number;
  /** Lines still in the wrong voice after every re-take. Empty is the goal. */
  wrongVoiceLines: string[];
  audioTokens: number;
  discardedTakes: number;
}

/**
 * The free listener's clip (FR-18): the first PREVIEW_SECONDS, cut from the PCM before anything is
 * encoded. Cutting it from the finished MP3 would mean handling the whole episode to make the
 * sample — the one thing a preview exists to avoid. A shorter episode previews as itself.
 */
export function cutPreview(pcm: Uint8Array, sampleRate: number): Uint8Array {
  return pcm.subarray(0, Math.min(pcm.length, PREVIEW_SECONDS * sampleRate * 2));
}

/** WAV → MP3. ffmpeg, the way poppler already is: a system dep declared in the Dockerfile. */
function toMp3(wav: Uint8Array, fadeOutFrom?: number): Uint8Array {
  const dir = mkdtempSync(join(tmpdir(), "clutch-tts-"));
  const wavPath = join(dir, "in.wav");
  const mp3Path = join(dir, "out.mp3");
  writeFileSync(wavPath, wav);
  const args = ["-y", "-loglevel", "error", "-i", wavPath];
  if (fadeOutFrom !== undefined && fadeOutFrom > 0) args.push("-af", `afade=t=out:st=${fadeOutFrom.toFixed(2)}:d=2.5`);
  args.push("-b:a", "128k", mp3Path);
  execFileSync(ffmpegPath(), args);
  return new Uint8Array(readFileSync(mp3Path));
}

function ffmpegPath(): string {
  // Local dev on a Mac keeps it in Homebrew; the container has it on PATH.
  for (const p of ["/opt/homebrew/bin/ffmpeg", "/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg"]) {
    if (existsSync(p)) return p;
  }
  return "ffmpeg";
}

export async function speak(
  lines: PodcastLine[],
  sectionOf: (line: PodcastLine) => string,
  opts: SpeakOptions = {},
): Promise<SpokenEpisode> {
  const apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");
  const model = opts.model ?? TTS_MODEL;
  const maxRevoice = opts.maxRevoice ?? MAX_REVOICE;

  const blocks = toBlocks(lines);
  const parts: Uint8Array[] = [];
  const chapters: { section: string; startS: number }[] = [];
  let sampleRate = 24000;
  let bytes = 0;
  let retakes = 0;
  let discarded = 0;
  let audioTokens = 0;
  const wrongVoiceLines: string[] = [];
  let lastSection = "";

  for (const [i, block] of blocks.entries()) {
    const instructions = block.lines[0].beat === 0 ? `${DELIVERY}\n${INTRO_DELIVERY}` : DELIVERY;
    let best: (BlockAudio & { wrong: string[]; matched: number }) | null = null;

    for (let attempt = 0; attempt <= maxRevoice; attempt++) {
      const label = `block ${i + 1}/${blocks.length}`;
      const take = await withRetry(`${label} tts`, () => ttsBlock(block.lines, instructions, apiKey, model));
      const check = await withRetry(`${label} voice check`, () => voiceCheck(block.lines, take.pcm, take.sampleRate, apiKey));
      opts.onCheckUsage?.({ inputTokens: check.inputTokens, outputTokens: check.outputTokens });
      const cand = { ...take, wrong: check.wrong, matched: check.matched };
      const better =
        !best || cand.wrong.length < best.wrong.length || (cand.wrong.length === best.wrong.length && cand.matched > best.matched);
      if (best) {
        // Whichever take we drop was still generated and billed.
        discarded++;
        opts.onAudioUsage?.({ audioTokens: (better ? best : cand).audioTokens, discarded: true });
      }
      if (better) best = cand;
      const unmatched = block.lines.length - check.matched;
      if (check.wrong.length === 0 && unmatched === 0) break;
      if (check.wrong.length === 0 && attempt >= 1) break; // unmatched only: one extra take, then accept
      retakes++;
    }

    const chosen = best!;
    audioTokens += chosen.audioTokens;
    opts.onAudioUsage?.({ audioTokens: chosen.audioTokens, discarded: false });
    wrongVoiceLines.push(...chosen.wrong);
    sampleRate = chosen.sampleRate;

    const section = sectionOf(block.lines[0]);
    if (section && section !== lastSection) {
      chapters.push({ section, startS: Math.round(bytes / (sampleRate * 2)) });
      lastSection = section;
    }

    parts.push(chosen.pcm);
    bytes += chosen.pcm.length;
    if (block.pauseAfterMs) {
      const gap = silence(block.pauseAfterMs, sampleRate);
      parts.push(gap);
      bytes += gap.length;
    }
    opts.onProgress?.(i + 1, blocks.length, `${chosen.wrong.length ? `${chosen.wrong.length} wrong-voice line(s)` : "clean"}`);
  }

  const pcm = Buffer.concat(parts.map((p) => Buffer.from(p)));
  const durationSeconds = pcm.length / (sampleRate * 2);
  const full = toMp3(writeWav(new Uint8Array(pcm), sampleRate), Math.max(0, durationSeconds - 2.5));
  const previewPcm = cutPreview(new Uint8Array(pcm), sampleRate);
  const preview = toMp3(writeWav(previewPcm, sampleRate), Math.max(0, previewPcm.length / (sampleRate * 2) - 2.5));

  return {
    mp3: full,
    previewMp3: preview,
    durationSeconds: Math.round(durationSeconds),
    chapters,
    blocks: blocks.length,
    retakes,
    wrongVoiceLines,
    audioTokens,
    discardedTakes: discarded,
  };
}
