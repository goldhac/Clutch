/**
 * Phase 0 prototype — Clutch Audio quality gate (issue #1).
 *
 * NOT the pipeline. A throwaway script answering one question: can we generate
 * a two-host episode that teaches as well as the NotebookLM Audio Overviews
 * Gold already liked?
 *
 *   lecture PDF → ingest (text + figures) → section map + outline → script → TTS → WAV + MP3
 *
 * Mirrors BUILD-LOG.md §B.6's NotebookLM recipe: one source PDF, nothing else,
 * so the output is directly comparable to a NotebookLM episode from the same file.
 *
 * Round 3 changes (see FINDINGS.md):
 *   - COVERAGE: the outline maps the lecture's sections first and gives every
 *     major one airtime, validated — rounds 1–2 narrowed 37 pages to one idea.
 *   - FIGURES: ingest runs vision in "figures" mode, so diagrams and rendered
 *     equations on text-bearing pages are read (rounds 1–2 got 0 chars of them).
 *   - EAR: dialogue is validated for markdown / code / math symbols and rewritten,
 *     because round 2 contained `W_i` and *exact* that a voice may read literally.
 *   - LENGTH: default 24 min — NotebookLM's Default Deep Dive on this PDF is 24:00.
 *
 * Usage:
 *   npx tsx scripts/phase0/episode.ts --pdf reference/exam-prep/21-attn.pdf
 *   npx tsx scripts/phase0/episode.ts --reuse scripts/phase0/out/<run> --tts gemini-2.5-flash-preview-tts
 *
 *   npx tsx scripts/phase0/episode.ts --reuse scripts/phase0/out/<run> --intro-only
 *
 * Flags: --pdf  --minutes (default 24)  --tts (default gemini-3.1-flash-tts-preview)
 *        --reuse <run dir>  --vision sparse|figures|off (default figures)  --intro-only
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
const MINUTES = Number(flag("minutes") ?? 24);
const TTS_MODEL = flag("tts") ?? "gemini-3.1-flash-tts-preview";
const VISION = (flag("vision") ?? "figures") as "sparse" | "figures" | "off";
/** With --reuse: rewrite and voice only the intro, spliced onto the run's existing opening. */
const INTRO_ONLY = argv.includes("--intro-only");
const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) throw new Error("GEMINI_API_KEY missing from .env.local");
if (!PDF && !REUSE) throw new Error("pass --pdf <lecture.pdf> or --reuse <run dir>");
if (INTRO_ONLY && !REUSE) throw new Error("--intro-only needs --reuse <run dir>");

/** Official list prices, ai.google.dev/gemini-api/docs/pricing, checked 2026-09-14/15. */
const TTS_OUTPUT_PRICE_PER_M: Record<string, number> = {
  "gemini-3.1-flash-tts-preview": 20,
  "gemini-2.5-flash-preview-tts": 10,
  "gemini-2.5-pro-preview-tts": 20,
};
const PRO_IN = 1.25, PRO_OUT = 10, FLASH_IN = 0.3, FLASH_OUT = 2.5;

const VOICE_A = "Kore"; // drives, explains
const VOICE_B = "Puck"; // curious, asks the listener's question
const RETRIEVAL_PAUSE_MS = 2500;
const BLOCK_GAP_MS = 250;
/** SDK packs Gemini dialogue at 2,500 chars incl. "SpeakerN: " labels; stay under it. */
const MAX_BLOCK_CHARS = 2200;
/** Measured in rounds 1–2: 140 wpm of Gemini dialogue, pauses included. */
const WORDS_PER_MINUTE = 140;
/** Every section at or above this share of the lecture must get airtime. */
const MAJOR_SECTION_WEIGHT = 0.08;
/** One retrieval beat per ~8 minutes: 1 at 10 min, 3 at 24. */
const RETRIEVALS = Math.max(1, Math.min(3, Math.round(MINUTES / 8)));

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
  through_line: z.string(),
  sections: z
    .array(z.object({ name: z.string(), pages: z.string(), weight: z.number(), summary: z.string() }))
    .min(2),
  beats: z
    .array(
      z.object({
        kind: z.enum(BEAT_KINDS),
        section: z.string(),
        goal: z.string(),
        source_points: z.array(z.string()),
        est_seconds: z.number(),
      }),
    )
    .min(8),
  retrievals: z.array(z.object({ section: z.string(), question: z.string(), answer: z.string(), why: z.string() })).min(1),
  homework: z.string(),
});
type Outline = z.infer<typeof OutlineSchema>;

const LineSchema = z.object({
  speaker: z.enum(["A", "B"]),
  beat: z.number().int(),
  kind: z.enum([...BEAT_KINDS, "retrieval-question", "retrieval-attempt", "retrieval-answer"]),
  text: z.string().min(1),
});
const ScriptSchema = z.object({ lines: z.array(LineSchema).min(40) });
type Line = z.infer<typeof LineSchema>;

/* ── prompts — the quality lever the gate is testing ─────────────── */

const OUTLINE_SYSTEM = `You are the producer of Clutch Audio, a two-host study podcast.
Plan ONE episode of about ${MINUTES} minutes that walks a student through the ENTIRE provided
lecture, roughly 48 hours before their exam.

STEP 1 — MAP THE LECTURE FIRST. List its sections in lecture order: name, page range, the share
of the lecture it takes up (weights sum to ~1.0), and a one-line summary. The source includes
transcribed figures and equations; use them. Do not skip a section because another is more
interesting.

STEP 2 — ALLOCATE TIME ACROSS ALL OF IT. est_seconds per section roughly proportional to its
weight. EVERY section with weight >= ${MAJOR_SECTION_WEIGHT} MUST get at least one teaching beat.
This is a walkthrough of the lecture, not a deep dive into one favourite idea.

STEP 3 — BEATS, in lecture order:
  open → [per section: motivation / example / analogy / mechanism / confusion as it needs] → recap → homework
with exactly ${RETRIEVALS} retrieval beat(s), each placed right after the section it tests,
spread across the episode.

- open: the episode's INTRO, est_seconds 30-50. A hook taken from this lecture, a one-line welcome,
  the route through EVERY section told as one story (the through_line), and what the student will be
  able to explain by the end. It teaches nothing yet: the first section's teaching starts next beat.
- through_line: the single story connecting the sections (e.g. how each idea fixes a problem left
  open). The hosts use it to transition between sections. Only say one idea CAUSES the next problem
  when the source says so; otherwise it is simply the next problem (intro v2 claimed the copy network
  causes repetition; the lecture says encoder-decoders in general repeat).
- motivation: the problem an idea exists to solve, before any mechanism.
- example / analogy: concrete, from the source; analogies only if they genuinely explain.
- confusion: the specific thing students get wrong here.
- mechanism: how it works AND what breaks without it. Use the figures and equations.
- retrieval: an exam-style question fully answerable from the source.
- homework: a concrete ~5-minute task the student can do with their own notes.

Use ONLY facts present in the source. est_seconds across beats should sum to about ${MINUTES * 60}.

TRUST: never claim a topic "will" or "will definitely" be on the exam, or give exam weightings,
unless the source itself says so. A lecture alone is not exam evidence.

Return JSON exactly:
{"title":"","stake":"","through_line":"",
 "sections":[{"name":"","pages":"","weight":0,"summary":""}],
 "beats":[{"kind":"","section":"","goal":"","source_points":[""],"est_seconds":0}],
 "retrievals":[{"section":"","question":"","answer":"","why":""}],"homework":""}`;

/**
 * Round 3's episode opened mid-thought ("So the biggest headache…") because the
 * prompt said "no greetings, open mid-thought". Gold: "did not hear a good intro".
 * NotebookLM spends its first minute orienting the listener; so does this.
 */
const INTRO_RULES = `THE INTRO — beat 0, kind "open". About 30-50 seconds: 70-120 words. In these seconds the listener
decides whether to keep going, so it has five parts, in this order, and every line earns its place:
  1. HOOK (1 line, A): one concrete, surprising puzzle, failure or scenario taken from THIS lecture.
     Never "have you ever wondered", never a definition, never a generic claim about AI or the field.
  2. WELCOME (1 short line): "Welcome to Clutch." plus what today's episode is about, in plain words.
     The only time the show is named.
  3. MAP (2-3 short lines, both hosts): the route through the lecture as one quick story using the
     through_line, naming EVERY section in order in plain words. B reacts or guesses the next step.
     Never a list read aloud. B speaks at least 2 of the intro's lines: a conversation from the start.
  4. PROMISE (1 line): two SPECIFIC things the listener will be able to explain by the end,
     named concretely from the lecture (e.g. "why the Transformer can train in parallel"), never
     "how it all works". Plus a brief heads-up that the hosts will stop a few times to quiz them: when that
     happens, pause and actually answer.
  5. HANDOFF (1 line): launches the first section.
The intro teaches nothing yet: no mechanisms, no formulas. Warm and inviting, never salesy.
Never say one idea causes the next problem unless the source says so.`;

const SCRIPT_SYSTEM = (words: number) => `You write the dialogue for a Clutch Audio episode.

THE FEEL — it must sound like a great NotebookLM Audio Overview: two sharp, warm friends thinking out
loud together. The listener should feel they are overhearing a genuinely good conversation — never a
lecture, never a presenter, never a radio ad.

HOSTS
- A drives and explains, with quiet confidence.
- B is curious and slightly naive: asks exactly what the listener is wondering, restates ideas in
  their own words, sometimes gets it slightly wrong so A can correct it, pushes back when something
  sounds too neat.
- BALANCE: B carries at least 40% of the words, with substance — restatements, guesses, objections,
  connections back to earlier sections — not a stream of "Okay." / "Right." A bare one-word
  acknowledgement at most once every six or so lines.

WRITE FOR THE EAR — this text is spoken aloud by a voice, never read
- NO markdown, code or symbols of any kind: no backticks, asterisks, underscores, hashes, carets,
  braces, dollar signs, equals signs, or math characters like √ ∑ ⊕ × ÷ → ≤.
- Say formulas the way a good lecturer says them out loud:
    "W sub i times q", "head i is attention applied to W-i-q, U-i-k and V-i-v",
    "the softmax of Q times K-transpose, divided by the square root of d-k, all times V".
- Before saying a formula, say in plain words what it does; then say it; then say why it matters.
  Never read a long formula symbol by symbol without that framing.
- Emphasis comes from word choice and rhythm, never from asterisks.

SPEECH
- Short turns. Each line at most 140 characters. A long explanation becomes several short turns,
  with B reacting in between.
- Natural back-channels ("yeah", "right", "mm", "oh — okay", "wait, so…"), occasional
  self-corrections and gentle interruptions. Sparingly.
- No music or sound-effect cues. After the intro, never re-greet or re-introduce the show.

${INTRO_RULES}

TEACHING
- Walk the WHOLE lecture in order, following the outline's sections and through_line. Use the
  through_line to transition: each section should feel like it answers the previous one's problem.
- Teach, don't recite. Always say WHY, and what breaks without each idea.
- Use the figures and diagrams: describe what the picture shows in words a listener can see.
- Each retrieval beat, in exactly this shape (kinds retrieval-question / retrieval-attempt /
  retrieval-answer), right after the section it tests:
    A (retrieval-question): turns to the LISTENER: "Okay, pause here and try this one yourself: …"
    B (retrieval-attempt): a real go at it — partly right.
    A (retrieval-answer): the full answer and why it's right. B may react.
- Finish with a recap across all sections, then the homework framed as something to do with notes.

RULES
- Use ONLY facts from the source and outline. Never invent numbers, names or results.
- TRUST: never say a topic "will" or "will definitely" be on the exam, and never state exam
  weightings, unless the source says so. Clutch never fakes confidence.
- LENGTH IS A HARD REQUIREMENT: about ${words} words in total, following the per-beat budgets.
  Reach length by teaching more deeply — never by padding, repetition or filler.
- "beat" is the 0-based index of the outline beat the line belongs to.

Return JSON exactly: {"lines":[{"speaker":"A","beat":0,"kind":"open","text":""}]}`;

const DELIVERY = `Two friends studying together in a quiet room. Relaxed, warm and genuinely curious.
Conversational pace with natural pauses and quick reactions, like overhearing a good conversation —
not a presenter or narrator. Speaker1 explains with quiet confidence; Speaker2 is curious and
reacts quickly.`;

/** Added for the intro block only. */
const INTRO_DELIVERY = `This is the opening of the episode: a touch more energy and warmth, like two friends glad the
listener showed up, then settling into the relaxed pace.`;

/* ── validation ──────────────────────────────────────────────────── */

/** Characters that mean a line was written for the eye, not the ear. */
const EYE_ONLY = /[`*_#^$\\{}=√∑∏⊕⊗×÷≤≥≠≈∈∉→←↔∀∃∂∇∞]|\b[A-Za-z]_[A-Za-z0-9]|\b\w+\^\w/;

const countWords = (ls: Line[]) => ls.reduce((n, l) => n + l.text.split(/\s+/).length, 0);
const norm = (x: string) => x.toLowerCase().trim();

function coverageGaps(outline: Outline) {
  const covered = new Set(outline.beats.map((b) => norm(b.section)));
  return outline.sections
    .filter((s) => s.weight >= MAJOR_SECTION_WEIGHT && !covered.has(norm(s.name)))
    .map((s) => s.name);
}

/** Words too generic to prove a section was previewed ("Copy Network" → "copy"). */
const GENERIC = new Set([
  "introduction", "intro", "overview", "problem", "problems", "section", "lecture", "part", "basics",
  "summary", "conclusion", "attention", "model", "models", "network", "networks", "vector", "with",
  "from", "into", "that", "this", "their", "what", "about",
]);

/** Section names the intro never mentions, matched on a 6-letter stem of their distinctive words. */
function sectionsMissingFromIntro(introText: string, outline: Outline) {
  const text = introText.toLowerCase();
  return outline.sections
    .filter((sec) => {
      const keys = sec.name.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4 && !GENERIC.has(w));
      return keys.length > 0 && !keys.some((w) => text.includes(w.slice(0, 6)));
    })
    .map((sec) => sec.name);
}

/** The intro's shape is checked, not requested — round 3 showed requests drift. */
function introIssues(ls: Line[], outline: Outline) {
  const intro = ls.filter((l) => l.beat === 0);
  const text = intro.map((l) => l.text).join(" ");
  const words = countWords(intro);
  const problems: string[] = [];
  // v2 was 190 words / 71 s; Gold: "calm, maybe could be a bit shorter".
  if (words < 70 || words > 120) problems.push(`it is ${words} words; it must be 70-120`);
  if (!/\bwelcome\b/i.test(text)) problems.push(`it has no one-line welcome`);
  const missing = sectionsMissingFromIntro(text, outline);
  if (missing.length > 1) problems.push(`the MAP never mentions: ${missing.join("; ")}`);
  if (!/\bpause\b/i.test(text)) problems.push(`it never tells the listener to pause and answer when quizzed`);
  const bLines = intro.filter((l) => l.speaker === "B").length;
  if (bLines < 2) problems.push(`B speaks ${bLines} line(s); B needs at least 2, so it is a conversation`);
  if (/how (this|it) all works|everything you need/i.test(text)) {
    problems.push(`the PROMISE is vague; name two or three specific things the listener will be able to explain`);
  }
  if (intro.some((l) => EYE_ONLY.test(l.text) || /\bsoftmax\b.*\btimes\b/i.test(l.text))) {
    problems.push(`it teaches mechanics or formulas; save them for the sections`);
  }
  return problems.length
    ? [`INTRO (beat 0): ${problems.join("; ")}. Rewrite it following THE INTRO rules exactly.`]
    : [];
}

function scriptIssues(ls: Line[], words: number, outline: Outline) {
  const issues: string[] = [];
  const got = countWords(ls);
  if (got < words * 0.85) {
    issues.push(`LENGTH: the draft is ${got} words; the requirement is ~${words}. Deepen the teaching to reach it.`);
  }
  const eye = ls.filter((l) => EYE_ONLY.test(l.text));
  if (eye.length) {
    issues.push(
      `WRITTEN FOR THE EYE: ${eye.length} line(s) contain markdown, code or math symbols a voice would read ` +
        `literally. Rewrite each in spoken words:\n` +
        eye.slice(0, 25).map((l) => `  - "${l.text}"`).join("\n"),
    );
  }
  issues.push(...introIssues(ls, outline));
  if (!ls.some((l) => l.kind === "retrieval-question")) {
    issues.push(`RETRIEVAL: no retrieval-question lines; ${RETRIEVALS} retrieval beat(s) are required.`);
  }
  return issues;
}

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
      const retryable = /429|rate|quota|503|UNAVAILABLE|overloaded|timeout|Unexpected token|JSON/i.test(msg);
      if (!retryable || i >= tries) throw e;
      const wait = 8000 * i;
      log(`${label}: ${msg.slice(0, 90)} — retry ${i}/${tries - 1} in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

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
 * Beat-aligned TTS blocks under the SDK's dialogue budget, with a seam forced
 * after each fully-asked retrieval question so a real silence can go there.
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
    const cost = line.text.length + 11;
    const newBeat = cur.length > 0 && line.beat !== cur[cur.length - 1].beat;
    if (cur.length && (chars + cost > MAX_BLOCK_CHARS || (newBeat && (chars > MAX_BLOCK_CHARS * 0.6 || cur[cur.length - 1].beat === 0)))) {
      flush(BLOCK_GAP_MS);
    }
    cur.push(line);
    chars += cost;
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
    usageMetadata?: { candidatesTokenCount?: number };
  };
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
  if (!part) throw new Error("token probe returned no audio");
  const rate = Number(/rate=(\d+)/.exec(part.mimeType)?.[1] ?? 24000);
  const seconds = Buffer.from(part.data, "base64").length / (rate * 2);
  const outTokens = json.usageMetadata?.candidatesTokenCount ?? 0;
  return { seconds, outTokens, tokensPerSecond: outTokens / seconds };
}

/* ── intro-only preview ──────────────────────────────────────────── */

/** Seconds of the run's existing episode played after the new intro. */
const PREVIEW_TAIL_S = 80;

async function introOnly(google: ReturnType<typeof createGoogle>, runDir: string) {
  const outline: Outline = JSON.parse(readFileSync(join(runDir, "outline.json"), "utf8"));
  const oldLines: Line[] = JSON.parse(readFileSync(join(runDir, "script.json"), "utf8")).lines;
  const source = readFileSync(join(runDir, "source.txt"), "utf8");
  const firstSection = oldLines.slice(0, 12).map((l) => `${l.speaker}: ${l.text}`).join("\n");

  const llm = new GeminiClient();
  let cost = 0;
  const system = `You write the INTRO of a Clutch Audio episode: two hosts, A drives and explains, B is curious and
restates things in their own words. It must sound like a great NotebookLM Audio Overview: two sharp,
warm friends, never a presenter or a radio ad.

${INTRO_RULES}

WRITE FOR THE EAR: no markdown, symbols or math characters. Each line at most 140 characters.
TRUST: use only facts from the outline and source; never say anything "will" be on the exam.

Return JSON exactly: {"lines":[{"speaker":"A","beat":0,"kind":"open","text":""}]}`;
  const user = `OUTLINE:\n${JSON.stringify(outline, null, 2)}\n\n` +
    `THE EPISODE AFTER YOUR INTRO already exists and begins:\n${firstSection}\n\n` +
    `Your HANDOFF must lead straight into that first line. Do not use its examples (the name example, ` +
    `the UNK token) as your hook; pick a different concrete one from the source.\n\nLECTURE SOURCE:\n${source}`;

  const IntroSchema = z.object({ lines: z.array(LineSchema).min(4) });
  const attempts: { words: number; issues: string[] }[] = [];
  let lines: Line[] = [];
  for (let attempt = 0; attempt <= 2; attempt++) {
    const prevIssues = attempts.at(-1)?.issues ?? [];
    const res = await withRetry("intro", () =>
      llm.generate({
        system,
        user: attempt === 0 ? user
          : `${user}\n\nYOUR PREVIOUS INTRO failed:\n${prevIssues.join("\n")}\n\nPREVIOUS INTRO:\n${JSON.stringify({ lines })}`,
        model: GEMINI_PRO, temperature: 0.8, maxOutputTokens: 16384,
      }),
    );
    cost += ((res.usage.inputTokens ?? 0) * PRO_IN + (res.usage.outputTokens ?? 0) * PRO_OUT) / 1e6;
    lines = parseJson(res.text, IntroSchema, "intro").lines.map((l) => ({ ...l, beat: 0, kind: "open" as const }));
    const issues = introIssues(lines, outline);
    attempts.push({ words: countWords(lines), issues });
    log(`  intro draft ${attempt + 1}: ${countWords(lines)} words · ${issues.length ? issues.join(" ") : "passes"}`);
    if (!issues.length) break;
  }

  const md = lines.map((l) => `**${l.speaker}** ${l.text}`).join("\n\n");
  writeFileSync(join(runDir, "intro.json"), JSON.stringify({ lines }, null, 2));
  writeFileSync(join(runDir, "intro-transcript.md"), `# Intro — ${outline.title}\n\n${md}\n`);
  console.log(`\n${md}\n`);

  log(`voicing intro with ${TTS_MODEL}…`);
  const result = await withRetry("intro TTS", () =>
    generateConversation({
      model: google(TTS_MODEL),
      instructions: `${DELIVERY}\n${INTRO_DELIVERY}`,
      turns: lines.map((l) => ({ voice: l.speaker === "A" ? VOICE_A : VOICE_B, text: l.text })),
      output: { format: "wav" },
    }),
  );
  const intro = readWav(result.audio.uint8Array);
  const tag = TTS_MODEL.replace(/[^a-z0-9.]+/gi, "-");
  const episode = readWav(readFileSync(join(runDir, `episode-${tag}.wav`)));
  const bps = (intro.sampleRate * intro.channels * intro.bits) / 8;
  if (episode.sampleRate !== intro.sampleRate) throw new Error("intro and episode sample rates differ");
  const introS = intro.pcm.length / bps;

  const gap = new Uint8Array(Math.round(bps * 0.35) & ~1);
  const tail = episode.pcm.subarray(0, Math.round(bps * PREVIEW_TAIL_S) & ~1);
  const joined = new Uint8Array(intro.pcm.length + gap.length + tail.length);
  joined.set(intro.pcm, 0);
  joined.set(tail, intro.pcm.length + gap.length);
  const wavPath = join(runDir, "intro-preview.wav");
  const mp3Path = join(runDir, "intro-preview.mp3");
  writeFileSync(wavPath, writeWav(joined, intro.sampleRate, intro.channels, intro.bits));
  execFileSync("/opt/homebrew/bin/ffmpeg", [
    "-y", "-loglevel", "error", "-i", wavPath,
    "-af", `afade=t=out:st=${(joined.length / bps - 2.5).toFixed(2)}:d=2.5`, "-b:a", "128k", mp3Path,
  ]);

  const ttsCost = (32 * introS * (TTS_OUTPUT_PRICE_PER_M[TTS_MODEL] ?? 0)) / 1e6;
  const report = {
    introSeconds: +introS.toFixed(1), attempts, previewSeconds: +(joined.length / bps).toFixed(1),
    costUSD: { llm: +cost.toFixed(3), tts: +ttsCost.toFixed(3), total: +(cost + ttsCost).toFixed(3) },
  };
  writeFileSync(join(runDir, "intro-report.json"), JSON.stringify(report, null, 2));
  log(`intro ${introS.toFixed(1)}s → preview ${mp3Path}`);
  console.log(JSON.stringify(report, null, 2));
}

/* ── run ─────────────────────────────────────────────────────────── */

async function main() {
  const google = createGoogle({ apiKey: API_KEY });
  if (INTRO_ONLY) return introOnly(google, REUSE!);
  let runDir: string;
  let outline: Outline;
  let lines: Line[];
  const report: Record<string, unknown> = { round: 3, ttsModel: TTS_MODEL, targetMinutes: MINUTES, vision: VISION };
  let llmCost = 0;

  if (REUSE) {
    runDir = REUSE;
    outline = JSON.parse(readFileSync(join(runDir, "outline.json"), "utf8"));
    lines = JSON.parse(readFileSync(join(runDir, "script.json"), "utf8")).lines;
    log(`reusing script from ${runDir} (${lines.length} lines) — re-voicing with ${TTS_MODEL}`);
  } else {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    runDir = join("scripts/phase0/out", `${basename(PDF!, ".pdf")}-r3-${stamp}`);
    mkdirSync(runDir, { recursive: true });

    log(`ingesting ${PDF} (vision: ${VISION})`);
    const tIngest = Date.now();
    const ing = await ingestDocument(basename(PDF!), readFileSync(PDF!), {
      vision: VISION !== "off",
      visionMode: VISION === "off" ? undefined : VISION,
    });
    writeFileSync(join(runDir, "source.txt"), ing.text);
    const visionCost = ((ing.visionInputTokens ?? 0) * FLASH_IN + (ing.visionOutputTokens ?? 0) * FLASH_OUT) / 1e6;
    llmCost += visionCost;
    log(`  ${ing.units} pages · ${ing.charCount} chars · ${ing.visionImages} pages read by vision → +${ing.visionChars} chars · ${((Date.now() - tIngest) / 1000).toFixed(1)}s · $${visionCost.toFixed(4)}`);
    report.source = {
      pages: ing.units, chars: ing.charCount, visionPagesSent: ing.visionImages,
      visionChars: ing.visionChars, visionCostUSD: +visionCost.toFixed(4), warnings: ing.warnings,
    };

    const llm = new GeminiClient();
    const addCost = (u: { inputTokens?: number; outputTokens?: number }) =>
      (llmCost += ((u.inputTokens ?? 0) * PRO_IN + (u.outputTokens ?? 0) * PRO_OUT) / 1e6);

    /* outline, with coverage validated */
    const outlineUser = `LECTURE SOURCE (${basename(PDF!)}):\n\n${ing.text}`;
    log("outline (section map first)…");
    let o = await withRetry("outline", () =>
      llm.generate({ system: OUTLINE_SYSTEM, user: outlineUser, model: GEMINI_PRO, temperature: 0.5, maxOutputTokens: 32768 }),
    );
    addCost(o.usage);
    outline = parseJson(o.text, OutlineSchema, "outline");
    let gaps = coverageGaps(outline);
    if (gaps.length) {
      log(`  outline skipped major section(s): ${gaps.join(" · ")} — replanning`);
      const prev = outline;
      o = await withRetry("outline replan", () =>
        llm.generate({
          system: OUTLINE_SYSTEM,
          user: `${outlineUser}\n\nYOUR PREVIOUS OUTLINE gave no beats to these major sections: ${gaps.join("; ")}. ` +
            `Replan so EVERY section with weight >= ${MAJOR_SECTION_WEIGHT} gets at least one teaching beat.\n\n` +
            `PREVIOUS OUTLINE:\n${JSON.stringify(prev)}`,
          model: GEMINI_PRO, temperature: 0.5, maxOutputTokens: 32768,
        }),
      );
      addCost(o.usage);
      outline = parseJson(o.text, OutlineSchema, "outline");
      gaps = coverageGaps(outline);
    }
    writeFileSync(join(runDir, "outline.json"), JSON.stringify(outline, null, 2));
    log(`  "${outline.title}" · ${outline.sections.length} sections · ${outline.beats.length} beats · ${outline.retrievals.length} retrievals · uncovered major: ${gaps.length ? gaps.join(", ") : "none"}`);
    for (const sec of outline.sections) {
      const secs = outline.beats.filter((b) => norm(b.section) === norm(sec.name)).reduce((n, b) => n + b.est_seconds, 0);
      log(`    ${(sec.weight * 100).toFixed(0).padStart(3)}%  ${String(Math.round(secs)).padStart(4)}s  ${sec.name}  (pp. ${sec.pages})`);
    }

    /* script, with length / ear / retrieval validated */
    const words = MINUTES * WORDS_PER_MINUTE;
    const plannedS = outline.beats.reduce((n, b) => n + b.est_seconds, 0) || MINUTES * 60;
    const budgets = outline.beats
      .map((b, i) => `  beat ${i} (${b.kind}, ${b.section}): ~${Math.round((b.est_seconds / plannedS) * words)} words`)
      .join("\n");
    const baseUser = `OUTLINE:\n${JSON.stringify(outline, null, 2)}\n\nPER-BEAT WORD BUDGETS (total ~${words}):\n${budgets}\n\nLECTURE SOURCE:\n${ing.text}`;

    log(`script (~${words} words)…`);
    let s = await withRetry("script", () =>
      llm.generate({ system: SCRIPT_SYSTEM(words), user: baseUser, model: GEMINI_PRO, temperature: 0.8, maxOutputTokens: 65536 }),
    );
    addCost(s.usage);
    lines = parseJson(s.text, ScriptSchema, "script").lines;
    const attempts: { words: number; eyeLines: number }[] = [
      { words: countWords(lines), eyeLines: lines.filter((l) => EYE_ONLY.test(l.text)).length },
    ];

    for (let attempt = 1; attempt <= 2; attempt++) {
      const issues = scriptIssues(lines, words, outline);
      if (!issues.length) break;
      log(`  draft ${attempt}: ${issues.map((i) => i.split(":")[0]).join(" · ")} — revising`);
      const prev = lines;
      s = await withRetry("script revise", () =>
        llm.generate({
          system: SCRIPT_SYSTEM(words),
          user: `${baseUser}\n\nYOUR PREVIOUS DRAFT failed these checks:\n\n${issues.join("\n\n")}\n\n` +
            `Rewrite the FULL script fixing every issue. Keep what already works.\n\nPREVIOUS DRAFT:\n${JSON.stringify({ lines: prev })}`,
          model: GEMINI_PRO, temperature: 0.7, maxOutputTokens: 65536,
        }),
      );
      addCost(s.usage);
      lines = parseJson(s.text, ScriptSchema, "script").lines;
      attempts.push({ words: countWords(lines), eyeLines: lines.filter((l) => EYE_ONLY.test(l.text)).length });
    }
    writeFileSync(join(runDir, "script.json"), JSON.stringify({ lines }, null, 2));
    writeFileSync(
      join(runDir, "transcript.md"),
      `# ${outline.title}\n\n${lines.map((l) => `**${l.speaker}** ${l.text}`).join("\n\n")}\n`,
    );

    const wordCount = countWords(lines);
    const bWords = countWords(lines.filter((l) => l.speaker === "B"));
    const eyeLines = lines.filter((l) => EYE_ONLY.test(l.text));
    const overclaims = lines.filter((l) =>
      /\b(definitely|certainly|guaranteed|will be)\b.*\bexam\b|\bexam\b.*\b(definitely|guaranteed)\b/i.test(l.text));
    const taughtSections = new Set(
      lines.map((l) => outline.beats[l.beat]?.section).filter((x): x is string => !!x).map(norm),
    );
    report.script = {
      lines: lines.length,
      words: wordCount,
      attempts,
      hostBShareOfWords: +(bWords / wordCount).toFixed(2),
      eyeOnlyLinesRemaining: eyeLines.map((l) => l.text),
      examOverclaims: overclaims.map((l) => l.text),
      retrievalQuestions: lines.filter((l) => l.kind === "retrieval-question").length,
      sections: outline.sections.map((sec) => ({ name: sec.name, weight: sec.weight, taught: taughtSections.has(norm(sec.name)) })),
      uncoveredMajorSections: coverageGaps(outline),
    };
    log(`  ${lines.length} lines · ${wordCount} words · B ${Math.round((bWords / wordCount) * 100)}% · ${eyeLines.length} eye-only lines · ${overclaims.length} overclaims · ${outline.sections.filter((sec) => taughtSections.has(norm(sec.name))).length}/${outline.sections.length} sections taught`);
  }

  /* TTS */
  const blocks = toBlocks(lines);
  log(`TTS with ${TTS_MODEL}: ${blocks.length} blocks`);
  const pcmParts: Uint8Array[] = [];
  let fmt = { sampleRate: 24000, channels: 1, bits: 16 };
  const chapters: { section: string; startS: number }[] = [];
  let cursorS = 0;
  let lastSection = "";

  for (const [i, block] of blocks.entries()) {
    const result = await withRetry(`block ${i + 1}`, () =>
      generateConversation({
        model: google(TTS_MODEL),
        instructions: block.lines[0].beat === 0 ? `${DELIVERY}\n${INTRO_DELIVERY}` : DELIVERY,
        turns: block.lines.map((l) => ({ voice: l.speaker === "A" ? VOICE_A : VOICE_B, text: l.text })),
        output: { format: "wav" },
      }),
    );
    const wav = readWav(result.audio.uint8Array);
    fmt = { sampleRate: wav.sampleRate, channels: wav.channels, bits: wav.bits };
    const bytesPerSecond = (wav.sampleRate * wav.channels * wav.bits) / 8;

    const section = outline.beats[block.lines[0].beat]?.section ?? "";
    if (section && section !== lastSection) {
      chapters.push({ section, startS: Math.round(cursorS) });
      lastSection = section;
    }
    pcmParts.push(wav.pcm);
    cursorS += wav.pcm.length / bytesPerSecond;
    if (block.pauseAfterMs > 0) {
      pcmParts.push(new Uint8Array(Math.round((bytesPerSecond * block.pauseAfterMs) / 1000) & ~1));
      cursorS += block.pauseAfterMs / 1000;
    }
    log(`  block ${i + 1}/${blocks.length} · ${(wav.pcm.length / bytesPerSecond).toFixed(1)}s · ${result.metadata.latencyMs}ms`);
  }

  const total = new Uint8Array(pcmParts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of pcmParts) { total.set(p, off); off += p.length; }

  const tag = TTS_MODEL.replace(/[^a-z0-9.]+/gi, "-");
  const wavPath = join(runDir, `episode-${tag}.wav`);
  const mp3Path = join(runDir, `episode-${tag}.mp3`);
  writeFileSync(wavPath, writeWav(total, fmt.sampleRate, fmt.channels, fmt.bits));
  const durationS = total.length / ((fmt.sampleRate * fmt.channels * fmt.bits) / 8);
  log(`episode: ${(durationS / 60).toFixed(2)} min`);
  if (existsSync("/opt/homebrew/bin/ffmpeg")) {
    execFileSync("/opt/homebrew/bin/ffmpeg", ["-y", "-loglevel", "error", "-i", wavPath, "-b:a", "128k", mp3Path]);
    log(`mp3: ${mp3Path}`);
  }

  log("measuring real billed tokens per second…");
  const probe = await withRetry("token probe", () => measureTokenRate(TTS_MODEL));
  const price = TTS_OUTPUT_PRICE_PER_M[TTS_MODEL];
  const ttsCost = price ? (probe.tokensPerSecond * durationS * price) / 1e6 : 0;
  report.tts = {
    blocks: blocks.length,
    durationMinutes: +(durationS / 60).toFixed(2),
    chapters,
    measuredTokensPerSecond: +probe.tokensPerSecond.toFixed(2),
    ttsCostUSD: +ttsCost.toFixed(3),
  };
  report.costUSD = { llmAndVision: +llmCost.toFixed(3), tts: +ttsCost.toFixed(3), total: +(llmCost + ttsCost).toFixed(3) };
  writeFileSync(join(runDir, `report-${tag}.json`), JSON.stringify(report, null, 2));

  log(`done → ${runDir}`);
  console.log(JSON.stringify({ tts: report.tts, cost: report.costUSD }, null, 2));
}

main().catch((e) => {
  console.error(`\nFAILED: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
