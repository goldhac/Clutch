/**
 * Phase 0 prototype — Clutch Audio quality gate (issue #1).
 *
 * NOT the pipeline. A single throwaway script that answers one question:
 * can we generate a two-host episode that teaches as well as the
 * NotebookLM Audio Overviews Gold already liked?
 *
 *   one lecture PDF → ingest (text + vision) → outline → script → TTS → WAV + MP3
 *
 * Mirrors BUILD-LOG.md §B.6's NotebookLM recipe on purpose: one source PDF
 * per episode, nothing else fed in, so the output is directly comparable
 * to a NotebookLM episode generated from the same file.
 *
 * Usage:
 *   npx tsx scripts/phase0/episode.ts --pdf reference/exam-prep/21-attn.pdf
 *   npx tsx scripts/phase0/episode.ts --reuse scripts/phase0/out/<run> --tts gemini-2.5-flash-preview-tts
 *
 * Flags:
 *   --pdf       source lecture (required unless --reuse)
 *   --minutes   target length (default 10 — D5 in the PRD asks 10 vs ~23)
 *   --tts       TTS model (default gemini-3.1-flash-tts-preview)
 *   --reuse     re-voice an existing run's script.json with another TTS model
 *   --no-vision skip the diagram-reading pass
 */
import { config as loadDotenv } from "dotenv";
loadDotenv({ path: ".env.local", quiet: true });

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { generateConversation } from "@speech-sdk/core";
import { createGoogle } from "@speech-sdk/core/providers";
import { z } from "zod";
import { GeminiClient, GEMINI_PRO } from "../../src/engine/gemini-client";
import { ingestDocument } from "../../src/parse/ingest";

/* ── args ─────────────────────────────────────────────────────────── */

const argv = process.argv.slice(2);
const flag = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const PDF = flag("pdf");
const REUSE = flag("reuse");
const MINUTES = Number(flag("minutes") ?? 10);
const TTS_MODEL = flag("tts") ?? "gemini-3.1-flash-tts-preview";
const VISION = !argv.includes("--no-vision");
const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) throw new Error("GEMINI_API_KEY missing from .env.local");
if (!PDF && !REUSE) throw new Error("pass --pdf <lecture.pdf> or --reuse <run dir>");

/** Official list prices, ai.google.dev/gemini-api/docs/pricing, checked 2026-09-14. */
const TTS_OUTPUT_PRICE_PER_M: Record<string, number> = {
  "gemini-3.1-flash-tts-preview": 20,
  "gemini-2.5-flash-preview-tts": 10,
  "gemini-2.5-pro-preview-tts": 20,
};

const VOICE_A = "Kore"; // drives, explains
const VOICE_B = "Puck"; // curious, asks the listener's question
const RETRIEVAL_PAUSE_MS = 2500;
const BLOCK_GAP_MS = 250;
/** SDK packs Gemini dialogue at 2,500 chars incl. "SpeakerN: " labels; stay under it. */
const MAX_BLOCK_CHARS = 2200;
/** Measured on run 1: 782 words → 5.58 min of Gemini dialogue, pauses included. */
const WORDS_PER_MINUTE = 140;

const t0 = Date.now();
const log = (msg: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`);

/* ── contracts (Phase 0 only — the real one is issue #3) ─────────── */

const BEAT_KINDS = [
  "open", "motivation", "example", "analogy", "confusion",
  "mechanism", "retrieval", "recap", "homework",
] as const;

const OutlineSchema = z.object({
  title: z.string(),
  stake: z.string(),
  running_example: z.string(),
  beats: z
    .array(
      z.object({
        kind: z.enum(BEAT_KINDS),
        goal: z.string(),
        source_points: z.array(z.string()),
        est_seconds: z.number(),
      }),
    )
    .min(6),
  retrieval: z.object({ question: z.string(), answer: z.string(), why: z.string() }),
  homework: z.string(),
});
type Outline = z.infer<typeof OutlineSchema>;

const LineSchema = z.object({
  speaker: z.enum(["A", "B"]),
  beat: z.number().int(),
  kind: z.enum([...BEAT_KINDS, "retrieval-question", "retrieval-attempt", "retrieval-answer"]),
  text: z.string().min(1),
});
const ScriptSchema = z.object({ lines: z.array(LineSchema).min(20) });
type Line = z.infer<typeof LineSchema>;

/* ── prompts — this is the quality lever the gate is testing ─────── */

const OUTLINE_SYSTEM = `You are the producer of Clutch Audio, a two-host study podcast.
Plan ONE episode of about ${MINUTES} minutes that teaches the provided lecture to a student
roughly 48 hours before their exam.

Beat order, strictly:
  open → motivation → example → (3–6 beats mixing analogy / mechanism / confusion) → retrieval → recap → homework

- open: name what this idea unlocks and why a student needs it, in one breath. No greetings,
  no claims about what the exam will contain.
- motivation: the problem this idea exists to solve, before any mechanism.
- example: ONE concrete case from the source that the whole episode keeps returning to.
- analogy: only analogies that genuinely explain the mechanism.
- confusion: the specific thing students get wrong or find confusing here.
- mechanism: how it works AND what breaks without it.
- retrieval: an exam-style question fully answerable from the source.
- homework: a concrete ~5-minute task the student can do with their own notes.

Use ONLY facts present in the source. est_seconds across beats should sum to about ${MINUTES * 60}.

TRUST: never claim a topic "will" or "will definitely" be on the exam, or give exam weightings,
unless the source itself says so. A lecture alone is not exam evidence. State why it matters
instead (e.g. "it's the core mechanism inside the Transformer").

Return JSON exactly:
{"title":"","stake":"","running_example":"","beats":[{"kind":"","goal":"","source_points":[""],"est_seconds":0}],
 "retrieval":{"question":"","answer":"","why":""},"homework":""}`;

const SCRIPT_SYSTEM = (words: number) => `You write the dialogue for a Clutch Audio episode.

THE FEEL — it must sound like a great NotebookLM Audio Overview: two sharp, warm friends thinking out
loud together. The listener should feel they are overhearing a genuinely good conversation — never a
lecture, never a presenter, never a radio ad.

HOSTS
- A drives and explains, with quiet confidence.
- B is curious and slightly naive: asks exactly what the listener is wondering, restates ideas in
  their own words, sometimes gets it slightly wrong so A can correct it, pushes back when something
  sounds too neat.
- BALANCE: B carries at least 40% of the words. B contributes substance — restatements, guesses,
  objections, connecting back to the example — not a stream of "Okay." / "Right." A bare one-word
  acknowledgement is allowed at most once every six or so lines.

SPEECH
- Short turns. Each line at most 140 characters. A long explanation becomes several short turns,
  with B reacting in between.
- Natural back-channels ("yeah", "right", "mm", "oh — okay", "wait, so…"), occasional
  self-corrections and gentle interruptions. Sparingly: at most one filler every few turns.
- No greetings, no "welcome back", no show name, no music or sound-effect cues. Open mid-thought
  on the stake.

TEACHING
- Teach, don't recite. Always say WHY, and what breaks without each idea.
- Keep returning to the running example from the outline.
- Retrieval beat, in exactly this shape, using kinds retrieval-question / retrieval-attempt /
  retrieval-answer:
    A (retrieval-question): turns to the LISTENER and asks the exam question directly, e.g.
      "Okay, pause here and try this one yourself: …"
    B (retrieval-attempt): has a real go at it — partly right.
    A (retrieval-answer): the full answer and why it's right. B may react.
- Finish with a quick recap, then the homework framed as something to do with their notes.

RULES
- Use ONLY facts from the source and outline. Never invent numbers, names or results.
- TRUST: never say a topic "will" or "will definitely" be on the exam, and never state exam
  weightings, unless the source says so. Say why it matters instead. Clutch never fakes confidence.
- LENGTH IS A HARD REQUIREMENT: about ${words} words in total. Follow the per-beat word budgets
  given with the outline. Reach length by teaching more deeply — more worked steps on the running
  example, more of B testing their understanding — never by padding, repetition or filler.
- "beat" is the 0-based index of the outline beat the line belongs to.

Return JSON exactly: {"lines":[{"speaker":"A","beat":0,"kind":"open","text":""}]}`;

const DELIVERY = `Two friends studying together in a quiet room. Relaxed, warm and genuinely curious.
Conversational pace with natural pauses and quick reactions, like overhearing a good conversation —
not a presenter or narrator. Speaker1 explains with quiet confidence; Speaker2 is curious and
reacts quickly.`;

/* ── helpers ─────────────────────────────────────────────────────── */

function parseJson<T>(raw: string, schema: z.ZodType<T>, label: string): T {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const result = schema.safeParse(JSON.parse(cleaned));
  if (!result.success) {
    const first = result.error.issues[0];
    throw new Error(`${label} failed contract at ${first.path.join(".")}: ${first.message}`);
  }
  return result.data;
}

async function withRetry<T>(label: string, fn: () => Promise<T>, tries = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const retryable = /429|rate|quota|503|UNAVAILABLE|overloaded|timeout/i.test(msg);
      if (!retryable || i >= tries) throw e;
      const wait = 8000 * i;
      log(`${label}: ${msg.slice(0, 90)} — retry ${i}/${tries - 1} in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

/** Read a RIFF WAV into its PCM payload + format. */
function readWav(buf: Uint8Array) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let sampleRate = 24000, channels = 1, bits = 16, off = 12, pcm: Uint8Array | null = null;
  while (off + 8 <= buf.length) {
    const id = String.fromCharCode(...buf.subarray(off, off + 4));
    const size = dv.getUint32(off + 4, true);
    if (id === "fmt ") {
      channels = dv.getUint16(off + 10, true);
      sampleRate = dv.getUint32(off + 12, true);
      bits = dv.getUint16(off + 22, true);
    } else if (id === "data") {
      pcm = buf.subarray(off + 8, off + 8 + size);
      break;
    }
    off += 8 + size + (size % 2);
  }
  if (!pcm) throw new Error("WAV has no data chunk");
  return { pcm, sampleRate, channels, bits };
}

function writeWav(pcm: Uint8Array, sampleRate: number, channels: number, bits: number) {
  const out = new Uint8Array(44 + pcm.length);
  const dv = new DataView(out.buffer);
  const w = (o: number, s: string) => [...s].forEach((c, i) => (out[o + i] = c.charCodeAt(0)));
  w(0, "RIFF"); dv.setUint32(4, 36 + pcm.length, true); w(8, "WAVE");
  w(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
  dv.setUint16(22, channels, true); dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, (sampleRate * channels * bits) / 8, true);
  dv.setUint16(32, (channels * bits) / 8, true); dv.setUint16(34, bits, true);
  w(36, "data"); dv.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}

/**
 * Group lines into TTS blocks. Seams fall on beat boundaries (where a prosody
 * reset is least audible), each block stays under the SDK's dialogue budget,
 * and a seam is forced right after the retrieval question so a real silence
 * can be inserted there.
 */
function toBlocks(lines: Line[]) {
  const blocks: { lines: Line[]; pauseAfterMs: number }[] = [];
  let cur: Line[] = [];
  let chars = 0;
  const flush = (pauseAfterMs: number) => {
    if (cur.length) blocks.push({ lines: cur, pauseAfterMs });
    cur = [];
    chars = 0;
  };
  lines.forEach((line, i) => {
    const cost = line.text.length + 11; // "SpeakerN: " + newline
    const newBeat = cur.length > 0 && line.beat !== cur[cur.length - 1].beat;
    if (cur.length && (chars + cost > MAX_BLOCK_CHARS || (newBeat && chars > MAX_BLOCK_CHARS * 0.6))) {
      flush(BLOCK_GAP_MS);
    }
    cur.push(line);
    chars += cost;
    // Pause after the question is fully asked — a multi-line question must not be split by silence.
    if (line.kind === "retrieval-question" && lines[i + 1]?.kind !== "retrieval-question") {
      flush(RETRIEVAL_PAUSE_MS);
    }
    if (i === lines.length - 1) flush(0);
  });
  return blocks;
}

/** One direct API call to read billed audio tokens — the SDK doesn't surface usage. */
async function measureTokenRate(model: string) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text:
          "Speaker1: So the whole trick is that every word gets to look at every other word.\n" +
          "Speaker2: Wait, all of them? At once?\n" +
          "Speaker1: All of them, in parallel. That's exactly why it trains so fast on a GPU.\n" +
          "Speaker2: Okay, that actually makes sense. That's the part I was missing." }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { multiSpeakerVoiceConfig: { speakerVoiceConfigs: [
            { speaker: "Speaker1", voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE_A } } },
            { speaker: "Speaker2", voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE_B } } },
          ] } },
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`token probe ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { inlineData?: { data: string; mimeType: string } }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
  if (!part) throw new Error("token probe returned no audio");
  const rate = Number(/rate=(\d+)/.exec(part.mimeType)?.[1] ?? 24000);
  const seconds = Buffer.from(part.data, "base64").length / (rate * 2);
  const outTokens = json.usageMetadata?.candidatesTokenCount ?? 0;
  return { seconds, outTokens, tokensPerSecond: outTokens / seconds };
}

/* ── run ─────────────────────────────────────────────────────────── */

async function main() {
  const google = createGoogle({ apiKey: API_KEY });
  let runDir: string;
  let outline: Outline;
  let lines: Line[];
  const report: Record<string, unknown> = { ttsModel: TTS_MODEL, targetMinutes: MINUTES };

  if (REUSE) {
    runDir = REUSE;
    outline = JSON.parse(readFileSync(join(runDir, "outline.json"), "utf8"));
    lines = JSON.parse(readFileSync(join(runDir, "script.json"), "utf8")).lines;
    log(`reusing script from ${runDir} (${lines.length} lines) — re-voicing with ${TTS_MODEL}`);
  } else {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    runDir = join("scripts/phase0/out", `${basename(PDF!, ".pdf")}-${stamp}`);
    mkdirSync(runDir, { recursive: true });

    log(`ingesting ${PDF} (vision ${VISION ? "on" : "off"})`);
    const ing = await ingestDocument(basename(PDF!), readFileSync(PDF!), { vision: VISION });
    writeFileSync(join(runDir, "source.txt"), ing.text);
    log(`  ${ing.units} pages · ${ing.charCount} chars (${ing.visionChars} from diagrams)`);
    report.source = { pages: ing.units, chars: ing.charCount, visionChars: ing.visionChars };

    const llm = new GeminiClient();

    log("outline…");
    const o = await withRetry("outline", () =>
      llm.generate({
        system: OUTLINE_SYSTEM,
        user: `LECTURE SOURCE (${basename(PDF!)}):\n\n${ing.text}`,
        model: GEMINI_PRO,
        temperature: 0.5,
      }),
    );
    outline = parseJson(o.text, OutlineSchema, "outline");
    writeFileSync(join(runDir, "outline.json"), JSON.stringify(outline, null, 2));
    log(`  "${outline.title}" · ${outline.beats.length} beats`);

    const words = MINUTES * WORDS_PER_MINUTE;
    const plannedS = outline.beats.reduce((n, b) => n + b.est_seconds, 0) || MINUTES * 60;
    const budgets = outline.beats
      .map((b, i) => `  beat ${i} (${b.kind}): ~${Math.round((b.est_seconds / plannedS) * words)} words`)
      .join("\n");
    const baseUser = `OUTLINE:\n${JSON.stringify(outline, null, 2)}\n\nPER-BEAT WORD BUDGETS (total ~${words}):\n${budgets}\n\nLECTURE SOURCE:\n${ing.text}`;
    const countWords = (ls: Line[]) => ls.reduce((n, l) => n + l.text.split(/\s+/).length, 0);

    log(`script (~${words} words)…`);
    let s = await withRetry("script", () =>
      llm.generate({ system: SCRIPT_SYSTEM(words), user: baseUser, model: GEMINI_PRO, temperature: 0.8, maxOutputTokens: 32768 }),
    );
    lines = parseJson(s.text, ScriptSchema, "script").lines;
    const attempts: number[] = [countWords(lines)];

    // Same validate → feed back → retry discipline as the sheet contract, applied to length.
    for (let attempt = 1; attempt <= 2 && countWords(lines) < words * 0.85; attempt++) {
      const got = countWords(lines);
      log(`  draft ${attempt} is ${got} words (${Math.round((got / words) * 100)}% of target) — expanding`);
      const draft = JSON.stringify({ lines });
      s = await withRetry("script expand", () =>
        llm.generate({
          system: SCRIPT_SYSTEM(words),
          user: `${baseUser}\n\nYOUR PREVIOUS DRAFT was ${got} words; the requirement is ~${words}. Rewrite the FULL script to reach it by deepening the teaching (more worked steps on the running example, more of B testing understanding). Keep what works. Do not pad or repeat.\n\nPREVIOUS DRAFT:\n${draft}`,
          model: GEMINI_PRO,
          temperature: 0.8,
          maxOutputTokens: 32768,
        }),
      );
      lines = parseJson(s.text, ScriptSchema, "script").lines;
      attempts.push(countWords(lines));
    }
    writeFileSync(join(runDir, "script.json"), JSON.stringify({ lines }, null, 2));

    const transcript = lines.map((l) => `**${l.speaker === "A" ? "A" : "B"}** ${l.text}`).join("\n\n");
    writeFileSync(join(runDir, "transcript.md"), `# ${outline.title}\n\n${transcript}\n`);

    const wordCount = countWords(lines);
    const bWords = countWords(lines.filter((l) => l.speaker === "B"));
    const overclaims = lines.filter((l) => /\b(definitely|certainly|guaranteed|will be)\b.*\bexam\b|\bexam\b.*\b(definitely|guaranteed)\b/i.test(l.text)).map((l) => l.text);
    const long = lines.filter((l) => l.text.length > 140).length;
    const kinds = new Set(lines.map((l) => l.kind));
    report.script = {
      lines: lines.length,
      words: wordCount,
      linesOver140Chars: long,
      hasRetrievalTriple: ["retrieval-question", "retrieval-attempt", "retrieval-answer"].every((k) => kinds.has(k as Line["kind"])),
      hasHomework: kinds.has("homework"),
      wordAttempts: attempts,
      hostBShareOfWords: +(bWords / wordCount).toFixed(2),
      examOverclaims: overclaims,
      llmUsage: { outline: o.usage, script: s.usage },
    };
    log(`  ${lines.length} lines · ${wordCount} words · B ${Math.round((bWords / wordCount) * 100)}% · ${long} over 140 chars · ${overclaims.length} exam overclaims`);
  }

  /* TTS: beat-aligned blocks through the SDK's native Gemini dialogue path */
  const blocks = toBlocks(lines);
  log(`TTS with ${TTS_MODEL}: ${blocks.length} blocks`);
  const pcmParts: Uint8Array[] = [];
  let fmt = { sampleRate: 24000, channels: 1, bits: 16 };
  const chapters: { beat: number; kind: string; startS: number }[] = [];
  let cursorS = 0;
  let lastBeat = -1;

  for (const [i, block] of blocks.entries()) {
    const result = await withRetry(`block ${i + 1}`, () =>
      generateConversation({
        model: google(TTS_MODEL),
        instructions: DELIVERY,
        turns: block.lines.map((l) => ({ voice: l.speaker === "A" ? VOICE_A : VOICE_B, text: l.text })),
        output: { format: "wav" },
      }),
    );
    const wav = readWav(result.audio.uint8Array);
    fmt = { sampleRate: wav.sampleRate, channels: wav.channels, bits: wav.bits };
    const bytesPerSecond = (wav.sampleRate * wav.channels * wav.bits) / 8;

    if (block.lines[0].beat !== lastBeat) {
      chapters.push({ beat: block.lines[0].beat, kind: block.lines[0].kind, startS: Math.round(cursorS) });
      lastBeat = block.lines[block.lines.length - 1].beat;
    }
    pcmParts.push(wav.pcm);
    cursorS += wav.pcm.length / bytesPerSecond;

    if (block.pauseAfterMs > 0) {
      const silence = new Uint8Array(Math.round((bytesPerSecond * block.pauseAfterMs) / 1000) & ~1);
      pcmParts.push(silence);
      cursorS += block.pauseAfterMs / 1000;
    }
    log(`  block ${i + 1}/${blocks.length} · ${(wav.pcm.length / bytesPerSecond).toFixed(1)}s · ${result.metadata.latencyMs}ms`);
  }

  const total = new Uint8Array(pcmParts.reduce((n, p) => n + p.length, 0));
  let o2 = 0;
  for (const p of pcmParts) { total.set(p, o2); o2 += p.length; }

  const tag = TTS_MODEL.replace(/[^a-z0-9.]+/gi, "-");
  const wavPath = join(runDir, `episode-${tag}.wav`);
  const mp3Path = join(runDir, `episode-${tag}.mp3`);
  writeFileSync(wavPath, writeWav(total, fmt.sampleRate, fmt.channels, fmt.bits));
  const durationS = total.length / ((fmt.sampleRate * fmt.channels * fmt.bits) / 8);
  log(`episode: ${(durationS / 60).toFixed(2)} min`);

  // Local convenience for listening only — production output is the SDK's (issue #4).
  if (existsSync("/opt/homebrew/bin/ffmpeg")) {
    execFileSync("/opt/homebrew/bin/ffmpeg", ["-y", "-loglevel", "error", "-i", wavPath, "-b:a", "128k", mp3Path]);
    log(`mp3: ${mp3Path}`);
  }

  /* Measured, not assumed: the token rate docs 10/11 took on faith */
  log("measuring real billed tokens per second…");
  const probe = await withRetry("token probe", () => measureTokenRate(TTS_MODEL));
  const price = TTS_OUTPUT_PRICE_PER_M[TTS_MODEL];
  const perMin = price ? (probe.tokensPerSecond * 60 * price) / 1e6 : null;
  report.tts = {
    blocks: blocks.length,
    durationMinutes: +(durationS / 60).toFixed(2),
    chapters,
    measuredTokensPerSecond: +probe.tokensPerSecond.toFixed(2),
    listPricePerMOutput: price,
    ttsCostPerAudioMinuteUSD: perMin && +perMin.toFixed(4),
    ttsCostThisEpisodeUSD: perMin && +((perMin * durationS) / 60).toFixed(3),
    ttsCostAt23MinUSD: perMin && +(perMin * 23).toFixed(3),
  };
  writeFileSync(join(runDir, `report-${tag}.json`), JSON.stringify(report, null, 2));

  log(`done → ${runDir}`);
  console.log(JSON.stringify(report.tts, null, 2));
}

main().catch((e) => {
  console.error(`\nFAILED: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
