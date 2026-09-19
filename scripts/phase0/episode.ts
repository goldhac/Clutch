/**
 * Phase 0 prototype — Clutch Audio quality gate (issue #1). Round 4.
 *
 * NOT the pipeline. A throwaway script answering one question: can we generate
 * a two-host episode that teaches as well as the NotebookLM Audio Overviews
 * Gold already liked?
 *
 *   lecture PDF → ingest (text + figures) → outline → script → claims check → TTS → voice check → MP3
 *
 * Round 4 (see FINDINGS.md §8 — the transcript comparison against NotebookLM):
 * every quality rule that mattered is now a CHECK that fails the outline, the
 * script or the audio, because round 3 proved that requests drift.
 *   1. VOICES   — Gemini TTS is called directly with fixed speaker labels
 *                 (Speaker1 = A = Kore, Speaker2 = B = Puck); the SDK relabelled
 *                 by first appearance per block. Measured with --smoke: a block
 *                 that OPENS with Speaker2 comes out swapped 3 times out of 3,
 *                 a block that opens with Speaker1 is clean 3/3 — so every block
 *                 starts with an A line (after a retrieval pause, A's short
 *                 pickup). Every block is then transcribed by voice and
 *                 re-voiced if any line came out wrong.
 *   2. RHYTHM   — hosts alternate; median turn ≤ 16 words, ≥ 15% of turns ≤ 6
 *                 words, no turn > 45 words.
 *   3. SPINE    — one image per section, one running example that returns ≥ 3×
 *                 including in the ending.
 *   4. CURIOSITY— every section after the first opens with B's question; ≥ 3
 *                 pushbacks; announcer transitions rejected.
 *   5. WRAPPER  — intro, midpoint recap before the biggest section, relevance,
 *                 recap, homework, outro (teaser + sign-off) are required beats.
 *   6. MUST-SAY — every formula and limitation in the source gets a spoken cue
 *                 that must appear in the script.
 *   7. AIRTIME  — each major section within ±40% of its lecture share, in the
 *                 outline (seconds) and the script (words).
 *   8. CLAIMS   — a separate pass traces every number and causal claim to the
 *                 source; unsupported ones are rewritten.
 *
 * Usage:
 *   npx tsx scripts/phase0/episode.ts --pdf reference/exam-prep/21-attn.pdf
 *   npx tsx scripts/phase0/episode.ts --reuse scripts/phase0/out/<run>            (re-voice all)
 *   npx tsx scripts/phase0/episode.ts --reuse scripts/phase0/out/<run> --revoice 7,18   (splice blocks)
 *   npx tsx scripts/phase0/episode.ts --reuse scripts/phase0/out/<run> --intro-only
 *
 * Flags: --pdf  --minutes (default 24)  --tts (default gemini-2.5-flash-preview-tts)  --fish-cues
 *        --reuse <run dir>  --vision sparse|figures|off (default figures)  --intro-only
 */
import { config as loadDotenv } from "dotenv";
loadDotenv({ path: ".env.local", quiet: true });

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { z } from "zod";
import { checkClaims } from "@/engine/claims-check";
import { selectClaimLines } from "./check-claims";
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
/**
 * 2.5, not 3.1: same script, same voices, measured 2026-09-19 — $0.296 against $0.858 (it bills
 * fewer tokens per second of speech as well as costing less per token), 4 block re-takes against
 * 10, and Gold picked it by ear against the 3.1 take. Override with --tts.
 */
const TTS_MODEL = flag("tts") ?? "gemini-2.5-flash-preview-tts";
/** "fish:<model>" routes voicing to Fish Audio's dialogue endpoint (A/B against Gemini, 2026-09-17). */
const FISH = TTS_MODEL.startsWith("fish:");
const FISH_MODEL = FISH ? TTS_MODEL.slice(5) : "";
const FISH_API_KEY = process.env.FISH_API_KEY;
const VISION = (flag("vision") ?? "figures") as "sparse" | "figures" | "off";
/** With --reuse: rewrite and voice only the intro, spliced onto the run's existing opening. */
const INTRO_ONLY = argv.includes("--intro-only");
/** Voice one tiny block and run the voice check — proves the TTS path before a $1 run. */
const SMOKE = argv.includes("--smoke");
/** Fish only: per-line [delivery] tags, so it gets the same direction Gemini always had. */
const FISH_CUES = argv.includes("--fish-cues");
/** With --reuse: re-voice only these 1-based blocks (more takes) and splice them into the existing WAV. */
const REVOICE = (flag("revoice") ?? "").split(",").map(Number).filter((n) => n > 0);
const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) throw new Error("GEMINI_API_KEY missing from .env.local");
if (FISH && !FISH_API_KEY) throw new Error("FISH_API_KEY missing from .env.local");
if (!PDF && !REUSE && !SMOKE) throw new Error("pass --pdf <lecture.pdf> or --reuse <run dir>");
if (INTRO_ONLY && !REUSE) throw new Error("--intro-only needs --reuse <run dir>");

/** Official list prices, ai.google.dev/gemini-api/docs/pricing, checked 2026-09-14/15. */
const TTS_OUTPUT_PRICE_PER_M: Record<string, number> = {
  "gemini-3.1-flash-tts-preview": 20,
  "gemini-2.5-flash-preview-tts": 10,
  "gemini-2.5-pro-preview-tts": 20,
};
const PRO_IN = 1.25, PRO_OUT = 10, FLASH_IN = 0.3, FLASH_OUT = 2.5, FLASH_AUDIO_IN = 1.0;
/** Fish Audio bills text, not audio: $15 / M UTF-8 bytes on every paid model; s2.1-pro-free is $0 (fair use). */
const FISH_PRICE_PER_M_BYTES = 15;
/**
 * Fish voice library ids (api.fish.audio/model, sorted by use). Chosen for the role and for NOT
 * being a clone of a named real person — most of the top of that library is celebrity clones.
 *   A: "Sarah" — female, young, conversational/narration, 8.5k likes.
 *   B: "Verity" — male, young, energetic and friendly, conversational.
 */
const FISH_VOICE_A = "933563129e564b19a115bedd57b7406a";
const FISH_VOICE_B = "711cf3ed00ab441a8f54a45058047b7a";
const BASE = "https://generativelanguage.googleapis.com/v1beta";
const CHECK_MODEL = "gemini-2.5-flash";

/** Fixed for the whole episode. Speaker1 is always A, Speaker2 always B — see round 4 note 1. */
const VOICE_A = "Kore"; // A drives and explains — a woman's voice
const VOICE_B = "Puck"; // B is curious — a man's voice
const RETRIEVAL_PAUSE_MS = 2500;
const BLOCK_GAP_MS = 250;
/** Shorter than round 3's 2,200: fewer chances for the voice model to drift inside a block. */
const MAX_BLOCK_CHARS = 1500;
/** Round 3 measured 150 wpm; NotebookLM runs 179. Brisker delivery + shorter turns aim between. */
const WORDS_PER_MINUTE = 160;
/** Every section at or above this share of the lecture must get airtime. */
const MAJOR_SECTION_WEIGHT = 0.08;
/** Allowed relative drift between a section's lecture share and its airtime. */
const AIRTIME_TOLERANCE = 0.4;
/** One retrieval beat per ~8 minutes: 1 at 10 min, 3 at 24. */
const RETRIEVALS = Math.max(1, Math.min(3, Math.round(MINUTES / 8)));
const TTS_CONCURRENCY = 3;
const MAX_REVOICE = 2;
/** Targeted re-voicing gets more dice. */
const MAX_REVOICE_TARGETED = 5;

const t0 = Date.now();
const log = (msg: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`);

/* ── contracts (Phase 0 only — the real one is issue #3) ─────────── */

const TEACHING_KINDS = ["motivation", "example", "analogy", "confusion", "mechanism"] as const;
const WRAPPER_KINDS = ["open", "midpoint-recap", "relevance", "recap", "homework", "outro"] as const;
const BEAT_KINDS = [...WRAPPER_KINDS, ...TEACHING_KINDS, "retrieval"] as const;

const OutlineSchema = z.object({
  title: z.string(),
  stake: z.string(),
  through_line: z.string(),
  sections: z
    .array(z.object({ name: z.string(), pages: z.string(), weight: z.number(), summary: z.string() }))
    .min(2),
  /** One concrete image per section, reused inside it. */
  analogies: z.array(z.object({ section: z.string(), image: z.string() })).min(2),
  /** The one example that runs through the whole episode and returns in the ending. */
  spine: z.object({ example: z.string(), keyword: z.string().min(3) }),
  /** Everything the script must say out loud, each with words any spoken version contains. */
  must_say: z
    .array(z.object({ kind: z.enum(["formula", "limitation", "result", "other"]), item: z.string(), spoken_cue: z.string().min(3) }))
    .min(3),
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
    .min(10),
  retrievals: z.array(z.object({ section: z.string(), question: z.string(), answer: z.string(), why: z.string() })).min(1),
  homework: z.string(),
  /** From the source's own "next time" / preview, or "" when it has none. */
  next_time: z.string(),
});
type Outline = z.infer<typeof OutlineSchema>;

const LineSchema = z.object({
  speaker: z.enum(["A", "B"]),
  beat: z.number().int(),
  kind: z.enum([...BEAT_KINDS, "retrieval-question", "retrieval-pickup", "retrieval-attempt", "retrieval-answer"]),
  text: z.string().min(1),
});
const ScriptSchema = z.object({ lines: z.array(LineSchema).min(60) });
type Line = z.infer<typeof LineSchema>;

/* ── prompts ─────────────────────────────────────────────────────── */

const OUTLINE_SYSTEM = `You are the producer of Clutch Audio, a two-host study podcast.
Plan ONE episode of about ${MINUTES} minutes that walks a student through the ENTIRE provided
lecture, roughly 48 hours before their exam.

STEP 1 — MAP THE LECTURE. List its sections in lecture order: name, page range, the share of the
lecture it takes up (weights sum to ~1.0), and a one-line summary. The source includes transcribed
figures and equations ("VISION TRANSCRIPTION"); use them. Do not skip a section because another is
more interesting.

STEP 2 — ALLOCATE TIME LIKE THE LECTURE DOES. Teaching est_seconds per section must be within
±${AIRTIME_TOLERANCE * 100}% of its weight share of the teaching time. The biggest section gets the
most time. EVERY section with weight >= ${MAJOR_SECTION_WEIGHT} gets at least one teaching beat.

STEP 3 — THE SPINE. Pick ONE concrete example from the source that can run through the whole
episode (a sentence, a name, a failure case) and give a "keyword": one distinctive word from it that
any mention will contain. Then pick one concrete image (analogy) per section, from everyday life,
that genuinely explains that section's idea. The hosts return to these; they are not decoration.

STEP 4 — MUST-SAY. List everything a student could be tested on that must be said out loud:
  - EVERY formula in the source, including every "Formula:" line in the VISION TRANSCRIPTION
    (kind "formula"), e.g. scaled dot-product attention with its square root;
  - EVERY limitation / trade-off / "however" bullet (kind "limitation");
  - headline results (kind "result").
  Each with a "spoken_cue": two to four words any spoken rendering of it must contain
  (e.g. "square root", "hyperparameter", "slower", "p-gen").

STEP 5 — BEATS, in lecture order. "kind" must be EXACTLY one of:
  open, motivation, example, analogy, confusion, mechanism, retrieval, midpoint-recap, relevance,
  recap, homework, outro. (Teaching beats use motivation/example/analogy/confusion/mechanism.)
Order:
  open → [section 1 beats] → … → midpoint-recap → [biggest section's beats] → … → relevance → recap → homework → outro
- open: the intro (30-50 s). Hook from this lecture, welcome, the route through EVERY section as
  one story, what the listener will be able to explain. Teaches nothing yet.
- teaching beats per section: motivation / example / analogy / mechanism / confusion as needed.
  Each section after the first begins from a QUESTION or OBJECTION the curious host raises.
- exactly ${RETRIEVALS} retrieval beat(s), each right after the section it tests, spread out.
- midpoint-recap (30-45 s): placed immediately BEFORE the biggest section: "here's what we've built".
- relevance (30-45 s): near the end, what this means for the listener outside the exam room.
- recap (45-60 s): the whole story again in one breath, with the spine example.
- homework: a concrete ~5-minute task the student can do with their own notes.
- outro (30-45 s): if the source previews a next lecture, tease it; then a warm sign-off that
  returns to the spine example.
- through_line: the single story connecting the sections. Only say one idea CAUSES the next
  problem when the source says so; otherwise it is simply the next problem the lecture takes up.

Use ONLY facts present in the source. est_seconds across beats should sum to about ${MINUTES * 60}.

TRUST: never claim a topic "will" or "will definitely" be on the exam, or give exam weightings,
unless the source itself says so. A lecture alone is not exam evidence.

Return JSON exactly:
{"title":"","stake":"","through_line":"",
 "sections":[{"name":"","pages":"","weight":0,"summary":""}],
 "analogies":[{"section":"","image":""}],
 "spine":{"example":"","keyword":""},
 "must_say":[{"kind":"formula","item":"","spoken_cue":""}],
 "beats":[{"kind":"","section":"","goal":"","source_points":[""],"est_seconds":0}],
 "retrievals":[{"section":"","question":"","answer":"","why":""}],
 "homework":"","next_time":""}`;

/**
 * Round 3's episode opened mid-thought because the prompt said "open mid-thought".
 * Gold: "did not hear a good intro", then "calm, maybe a bit shorter" → 70-120 words.
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
loud together, fast and alive. The listener should feel they are overhearing a genuinely good
conversation — never a lecture, never a presenter, never a radio ad.

HOSTS
- A drives and explains, with quiet confidence. A never asks A's own questions.
- B is curious and slightly naive: asks exactly what the listener is wondering, restates ideas in
  their own words, guesses (sometimes wrong, so A can correct), pushes back when something sounds
  too neat or too expensive.
- STRICT ALTERNATION: A and B take turns. Never two consecutive lines from the same host. If A has
  more to say, B reacts, restates or asks in between — even three words ("Which is?", "Six times?",
  "Wait, all of them?"). The only exceptions: A may ask a retrieval question right after A's own line,
  and A's retrieval pickup follows A's question (a silence sits between them).
- BALANCE: B carries at least 40% of the words, with substance.

RHYTHM — this is what makes it a conversation (measured against the benchmark)
- Median turn about 14 words. At least one turn in six is 6 words or fewer. No turn over 45 words.
- Quick reactions are real content: a guess, a half-answer, a "so it's like…", an objection.
  A bare "Okay." / "Right." at most once every eight lines.
- Natural speech: contractions, occasional "I mean", "wait, so", a self-correction now and then.

THE SPINE AND THE IMAGES
- The outline's spine example runs through the WHOLE episode: it appears in at least three
  sections and again in the outro. Use its keyword each time.
- Each section uses its outline analogy, and a host may call an earlier one back.

CURIOSITY DRIVES THE TRANSITIONS
- Every section after the first OPENS with B asking a question or raising an objection that the
  section then answers ("But wait — if it can copy, what stops it copying the same word twice?").
- At least three genuine pushbacks from B across the episode ("hold on", "I have to push back",
  "that sounds too expensive", "isn't that just…").
- NEVER announce a transition: no "now let's move on", "let's step back and", "next, we".

WRITE FOR THE EAR — this text is spoken aloud by a voice, never read
- NO markdown, code or symbols of any kind: no backticks, asterisks, underscores, hashes, carets,
  braces, dollar signs, equals signs, or math characters like √ ∑ ⊕ × ÷ → ≤.
- Say formulas the way a good lecturer says them out loud:
    "W sub i times q", "head i is attention applied to W-i-q, U-i-k and V-i-v",
    "the softmax of Q times K-transpose, divided by the square root of d-k, all times V".
- Before saying a formula, say in plain words what it does; then say it; then say why it matters.

TEACHING
- Walk the WHOLE lecture in order, following the outline's beats and airtime. Say EVERY must_say
  item out loud using its spoken cue words.
- Teach, don't recite. Always say WHY, and what breaks without each idea.
- Use the figures and diagrams: describe what the picture shows in words a listener can see.
- Each retrieval beat, in exactly this shape and order (kinds retrieval-question / retrieval-pickup /
  retrieval-attempt / retrieval-answer), right after the section it tests:
    A (retrieval-question): turns to the LISTENER: "Okay, pause here and try this one yourself: …"
    A (retrieval-pickup): 4-10 words, after the listener's pause, turning to B: "Okay, what did you get?"
      (this is the ONE place A speaks twice in a row — a silence sits between the two lines)
    B (retrieval-attempt): a real go at it — partly right.
    A (retrieval-answer): the answer and why, with B reacting in between if it runs long.
- Wrapper beats are required and use their kinds: open, midpoint-recap, relevance, recap,
  homework, outro. The outro is the LAST beat: tease the next lecture only if the outline has
  next_time, then sign off warmly, returning to the spine example.

RULES
- Use ONLY facts from the source and outline. Never invent numbers, names, sizes or results —
  if the source gives no number, say none.
- Never say one idea caused the next problem unless the source says so.
- TRUST: never say a topic "will" or "will definitely" be on the exam, and never state exam
  weightings, unless the source says so. Clutch never fakes confidence.
- LENGTH IS A HARD REQUIREMENT: about ${words} words in total, following the per-beat budgets.
  Reach length by teaching more deeply and reacting more — never by padding or filler.
- "beat" is the 0-based index of the outline beat the line belongs to. "kind" is that beat's kind
  (or retrieval-question / retrieval-pickup / retrieval-attempt / retrieval-answer inside a retrieval beat).

${INTRO_RULES}

Return JSON exactly: {"lines":[{"speaker":"A","beat":0,"kind":"open","text":""}]}`;


const PATCH_SYSTEM = (words: number) => `You are editing an existing Clutch Audio script with SURGICAL patches. You get the full numbered
script and a list of failed checks. Return only the edits needed to fix them; every other line stays
exactly as it is.

Each edit replaces ONE existing line (by its number) with 1 to 3 new lines. Use that to:
- split a long turn into A's line + B's quick reaction + A's continuation;
- fix two same-host lines in a row by replacing the second with [other host's reaction, original line];
- rewrite a line written for the eye into spoken words;
- make a section opener B's question;
- add a must-say item: replace a nearby line with [line saying it with the cue words, B's reaction, original];
- fix a claim the source does not support.
Keep each new line's "kind" the same as the line it replaces unless the checks say otherwise. Never break
a rule to fix another: after your edits the hosts still strictly alternate, every section after the first
still opens with B's question, every retrieval keeps its question → A's short pickup → B's attempt →
A's answer shape, and no line announces a transition. Use only facts from the source.

ALL THE SCRIPT RULES STILL APPLY:
${SCRIPT_SYSTEM(words).split("Return JSON exactly")[0]}

Return JSON exactly: {"edits":[{"at":0,"lines":[{"speaker":"A","kind":"mechanism","text":""}]}]}`;

const PatchSchema = z.object({
  edits: z.array(z.object({
    at: z.number().int(),
    lines: z.array(z.object({ speaker: z.enum(["A", "B"]), kind: LineSchema.shape.kind, text: z.string().min(1) })).min(1).max(3),
  })),
});

/** Checks whose fix needs a whole-script rewrite rather than line patches. */
const GLOBAL_ISSUE = /^(LENGTH|INTRO|SPINE|AIRTIME|WRAPPER|BALANCE)\b/;


/** Speaker labels are fixed for the whole episode, so the instructions can name them safely. */
const DELIVERY = `Two friends studying together. Warm, quick and genuinely curious, at a brisk conversational
pace with natural reactions and gentle overlaps in energy — like overhearing a good conversation, never a
presenter. Speaker1 is always the same woman: she explains with quiet confidence. Speaker2 is always the
same man: he is curious, reacts fast, and asks the listener's question. Never swap them.`;
const INTRO_DELIVERY = `This is the opening of the episode: a touch more energy and warmth, like two friends glad the
listener showed up.`;

/* ── validation ──────────────────────────────────────────────────── */

/** Characters that mean a line was written for the eye, not the ear. */
const EYE_ONLY = /[`*_#^$\\{}=√∑∏⊕⊗×÷≤≥≠≈∈∉→←↔∀∃∂∇∞]|\b[A-Za-z]_[A-Za-z0-9]|\b\w+\^\w/;
const ANNOUNCER = /\b(now,? let'?s (?:move|step|turn|go|talk|look)|let'?s (?:move on|step back|turn to)|next,? (?:let'?s|we'?ll)|moving on)\b/i;
const PUSHBACK = /\b(wait|hold on|hang on|push back|too (?:expensive|neat|easy|good)|isn'?t that just|but (?:doesn'?t|isn'?t|wouldn'?t|how|why|that|then|what|if))\b/i;
const OVERCLAIM = /\b(definitely|certainly|guaranteed|will be)\b.*\bexam\b|\bexam\b.*\b(definitely|guaranteed)\b/i;

const wordsOf = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
const countWords = (ls: Line[]) => ls.reduce((n, l) => n + wordsOf(l.text), 0);
const norm = (x: string) => x.toLowerCase().trim();
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

function biggestSection(outline: Outline) {
  return outline.sections.reduce((best, s) => (s.weight > best.weight ? s : best), outline.sections[0]);
}

function outlineIssues(outline: Outline) {
  const issues: string[] = [];
  const beatsOf = (name: string) => outline.beats.filter((b) => norm(b.section) === norm(name));
  const covered = outline.sections.filter((s) => s.weight >= MAJOR_SECTION_WEIGHT && beatsOf(s.name).length === 0);
  if (covered.length) issues.push(`COVERAGE: no beats for major section(s): ${covered.map((s) => s.name).join("; ")}.`);

  // Airtime: teaching seconds per section vs lecture weight.
  const teaching = outline.beats.filter((b) => !(WRAPPER_KINDS as readonly string[]).includes(b.kind));
  const teachingS = teaching.reduce((n, b) => n + b.est_seconds, 0) || 1;
  const wSum = outline.sections.reduce((n, s) => n + s.weight, 0) || 1;
  for (const s of outline.sections) {
    if (s.weight < MAJOR_SECTION_WEIGHT) continue;
    const share = teaching.filter((b) => norm(b.section) === norm(s.name)).reduce((n, b) => n + b.est_seconds, 0) / teachingS;
    const want = s.weight / wSum;
    if (Math.abs(share - want) > want * AIRTIME_TOLERANCE) {
      issues.push(`AIRTIME: "${s.name}" is ${(want * 100).toFixed(0)}% of the lecture but gets ${(share * 100).toFixed(0)}% of teaching time (allowed ±${AIRTIME_TOLERANCE * 100}%).`);
    }
  }

  // Wrapper beats present, in order, and the midpoint recap before the biggest section.
  const kinds = outline.beats.map((b) => b.kind);
  for (const k of WRAPPER_KINDS) if (!kinds.includes(k)) issues.push(`WRAPPER: no "${k}" beat.`);
  if (kinds[0] !== "open") issues.push(`WRAPPER: the first beat must be "open".`);
  if (kinds[kinds.length - 1] !== "outro") issues.push(`WRAPPER: the last beat must be "outro".`);
  const big = biggestSection(outline);
  const mid = kinds.indexOf("midpoint-recap");
  const firstBig = outline.beats.findIndex((b) => norm(b.section) === norm(big.name));
  if (mid >= 0 && firstBig >= 0 && mid > firstBig) issues.push(`WRAPPER: "midpoint-recap" must come BEFORE the biggest section ("${big.name}").`);
  const retrievals = kinds.filter((k) => k === "retrieval").length;
  if (retrievals !== RETRIEVALS) issues.push(`RETRIEVAL: ${retrievals} retrieval beat(s); exactly ${RETRIEVALS} required.`);

  // Spine, analogies, must-say.
  const analogyFor = new Set(outline.analogies.map((a) => norm(a.section)));
  const noImage = outline.sections.filter((s) => s.weight >= MAJOR_SECTION_WEIGHT && !analogyFor.has(norm(s.name)));
  if (noImage.length) issues.push(`SPINE: no analogy image for: ${noImage.map((s) => s.name).join("; ")}.`);
  if (!outline.must_say.some((m) => m.kind === "formula")) issues.push(`MUST-SAY: no formula items; the source has formulas.`);
  return issues;
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
  if (words < 70 || words > 120) problems.push(`it is ${words} words; it must be 70-120`);
  if (!/\bwelcome\b/i.test(text)) problems.push(`it has no one-line welcome`);
  const missing = sectionsMissingFromIntro(text, outline);
  if (missing.length > 1) problems.push(`the MAP never mentions: ${missing.join("; ")}`);
  if (!/\bpause\b/i.test(text)) problems.push(`it never tells the listener to pause and answer when quizzed`);
  const bLines = intro.filter((l) => l.speaker === "B").length;
  if (bLines < 2) problems.push(`B speaks ${bLines} line(s); B needs at least 2, so it is a conversation`);
  if (/how (this|it) all works|everything you need/i.test(text)) {
    problems.push(`the PROMISE is vague; name two specific things the listener will be able to explain`);
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
    issues.push(`LENGTH: the draft is ${got} words; the requirement is ~${words}. Deepen the teaching and add reactions to reach it.`);
  }
  const eye = ls.filter((l) => EYE_ONLY.test(l.text));
  if (eye.length) {
    issues.push(
      `WRITTEN FOR THE EYE: ${eye.length} line(s) contain markdown, code or math symbols a voice would read ` +
        `literally. Rewrite each in spoken words:\n` + eye.slice(0, 25).map((l) => `  - "${l.text}"`).join("\n"),
    );
  }
  issues.push(...introIssues(ls, outline));

  // 2. Rhythm + alternation + balance.
  const lens = ls.map((l) => wordsOf(l.text));
  const med = median(lens);
  const shortShare = lens.filter((n) => n <= 6).length / lens.length;
  const long = ls.filter((l) => wordsOf(l.text) > 45);
  const rhythm: string[] = [];
  if (med > 16) rhythm.push(`median turn is ${med} words (max 16) — split explanations with B's reactions and guesses`);
  if (shortShare < 0.15) rhythm.push(`only ${(shortShare * 100).toFixed(0)}% of turns are 6 words or fewer (need 15%) — add quick real reactions`);
  if (long.length) rhythm.push(`${long.length} turn(s) over 45 words:\n` + long.slice(0, 8).map((l) => `  - "${l.text.slice(0, 90)}…"`).join("\n"));
  if (rhythm.length) issues.push(`RHYTHM: ${rhythm.join("; ")}.`);
  const doubles = ls.filter((l, i) => i > 0 && ls[i - 1].speaker === l.speaker &&
    !(ls[i - 1].kind === "retrieval-question" && l.kind === "retrieval-pickup") &&
    !(l.kind === "retrieval-question" && ls[i - 1].kind !== "retrieval-question"));
  if (doubles.length) {
    issues.push(`ALTERNATION: ${doubles.length} line(s) follow a line by the same host. Hosts must strictly alternate; give the other host a real reaction in between:\n` +
      doubles.slice(0, 10).map((l) => `  - ${l.speaker}: "${l.text.slice(0, 80)}"`).join("\n"));
  }
  const bShare = countWords(ls.filter((l) => l.speaker === "B")) / (got || 1);
  if (bShare < 0.38) issues.push(`BALANCE: B has ${(bShare * 100).toFixed(0)}% of the words; B needs at least 40%, with substance.`);
  const bare = ls.filter((l) => /^(okay|right|yeah|yes|exactly|sure|mm-?hmm|got it)[.!?]?$/i.test(l.text.trim()));
  if (bare.length > ls.length / 8) issues.push(`FILLER: ${bare.length} bare one-word acknowledgements; at most one in eight lines. Make reactions carry content.`);

  // 3. Spine.
  const kw = outline.spine.keyword.toLowerCase();
  const spineLines = ls.filter((l) => l.text.toLowerCase().includes(kw));
  const spineSections = new Set(spineLines.map((l) => norm(outline.beats[l.beat]?.section ?? "")));
  const outroHas = ls.some((l) => l.kind === "outro" && l.text.toLowerCase().includes(kw));
  if (spineSections.size < 3 || !outroHas) {
    issues.push(`SPINE: the running example "${outline.spine.example}" (keyword "${outline.spine.keyword}") appears in ${spineSections.size} section(s)${outroHas ? "" : " and not in the outro"}; it must return in at least 3 sections and in the outro.`);
  }

  // 4. Curiosity: section openers by B with a question; pushbacks; no announcers.
  // A section "opens with B's question" when B asks one within its first two lines — A may
  // close the previous thought first (the patcher oscillated when the very first line had to be B's).
  const openers: Line[][] = [];
  let prevSec = "";
  ls.forEach((l, i) => {
    const sec = norm(outline.beats[l.beat]?.section ?? "");
    const isTeaching = !(WRAPPER_KINDS as readonly string[]).includes(l.kind);
    if (isTeaching && sec && sec !== prevSec) {
      if (prevSec) openers.push(ls.slice(i, i + 2));
      prevSec = sec;
    }
  });
  const isQuestion = (l?: Line) => !!l && l.speaker === "B" && /\?\s*$/.test(l.text.trim());
  const badOpeners = openers.filter((pair) => !isQuestion(pair[0]) && !isQuestion(pair[1]));
  if (badOpeners.length) {
    issues.push(`CURIOSITY: ${badOpeners.length} section(s) don't open from B's question or objection (B's line ending with "?" must be the section's first or second line):\n` +
      badOpeners.map((pair) => `  - ${pair[0].speaker}: "${pair[0].text.slice(0, 90)}"`).join("\n"));
  }
  const pushbacks = ls.filter((l) => l.speaker === "B" && PUSHBACK.test(l.text));
  if (pushbacks.length < 3) issues.push(`CURIOSITY: only ${pushbacks.length} pushback(s) from B; at least 3 ("hold on", "I have to push back", "but doesn't…").`);
  const announcers = ls.filter((l) => ANNOUNCER.test(l.text));
  if (announcers.length) {
    issues.push(`ANNOUNCER: ${announcers.length} line(s) announce a transition instead of arriving at it through B's curiosity:\n` +
      announcers.slice(0, 8).map((l) => `  - "${l.text.slice(0, 90)}"`).join("\n"));
  }

  // 5. Wrapper kinds present in the script and outro last.
  const kinds = new Set(ls.map((l) => l.kind));
  const missingWrapper = WRAPPER_KINDS.filter((k) => !kinds.has(k));
  if (missingWrapper.length) issues.push(`WRAPPER: no lines of kind ${missingWrapper.map((k) => `"${k}"`).join(", ")}.`);
  if (ls[ls.length - 1]?.kind !== "outro") issues.push(`WRAPPER: the last line must be part of the outro (sign-off).`);
  if (!ls.some((l) => l.kind === "retrieval-question")) issues.push(`RETRIEVAL: no retrieval-question lines; ${RETRIEVALS} retrieval beat(s) are required.`);
  const badPickups = ls.filter((l, i) =>
    l.kind === "retrieval-question" && ls[i + 1]?.kind !== "retrieval-question" &&
    !(ls[i + 1]?.kind === "retrieval-pickup" && ls[i + 1]?.speaker === "A" && wordsOf(ls[i + 1].text) <= 12));
  if (badPickups.length) issues.push(`RETRIEVAL: ${badPickups.length} retrieval question(s) not followed by A's short retrieval-pickup line (4-10 words, turning to B).`);

  // 6. Must-say cues.
  const all = ls.map((l) => l.text.toLowerCase()).join("\n");
  const unsaid = outline.must_say.filter((m) => !cueFound(all, m.spoken_cue));
  if (unsaid.length) {
    issues.push(`MUST-SAY: these were never said out loud (use the cue words):\n` +
      unsaid.map((m) => `  - [${m.kind}] ${m.item} — cue "${m.spoken_cue}"`).join("\n"));
  }

  // 7. Airtime in words vs lecture share.
  const teaching = ls.filter((l) => !(WRAPPER_KINDS as readonly string[]).includes(l.kind));
  const teachingW = countWords(teaching) || 1;
  const wSum = outline.sections.reduce((n, s) => n + s.weight, 0) || 1;
  const drift: string[] = [];
  for (const s of outline.sections) {
    if (s.weight < MAJOR_SECTION_WEIGHT) continue;
    const share = countWords(teaching.filter((l) => norm(outline.beats[l.beat]?.section ?? "") === norm(s.name))) / teachingW;
    const want = s.weight / wSum;
    if (Math.abs(share - want) > want * AIRTIME_TOLERANCE) drift.push(`"${s.name}" is ${(want * 100).toFixed(0)}% of the lecture but ${(share * 100).toFixed(0)}% of the teaching words`);
  }
  if (drift.length) issues.push(`AIRTIME: ${drift.join("; ")} (allowed ±${AIRTIME_TOLERANCE * 100}%). Move depth, not filler.`);

  // "A" and "B" are script labels, never names a host says aloud (round 4: "Okay, B, what do you think?").
  const labelled = ls.filter((l) => /(^|[\s,])[AB][,.?!]/.test(l.text));
  if (labelled.length) issues.push(`LABELS: ${labelled.length} line(s) address a host as "A" or "B"; the hosts have no names on air:\n` + labelled.map((l) => `  - "${l.text.slice(0, 80)}"`).join("\n"));
  const overclaims = ls.filter((l) => OVERCLAIM.test(l.text));
  if (overclaims.length) issues.push(`TRUST: ${overclaims.length} line(s) claim what is on the exam.`);
  return issues;
}

const CUE_STOP = new Set(["the", "of", "and", "is", "a", "an", "to", "in", "with", "by", "for", "on", "or", "it", "its", "that", "this", "are", "be"]);
const stem = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);

/**
 * A cue like "square root of d-k" is spoken when all its content words (stemmed to 5 letters,
 * so "concatenate" also matches "concatenated") land on ONE line of the script, in any order.
 * The haystack is the script joined with newlines, one line per script line.
 */
function cueFound(haystack: string, cue: string) {
  const words = cue.replace(/[-_]/g, "").split(/\s+/).map(stem).filter((w) => w && !CUE_STOP.has(w));
  if (!words.length) return true;
  return haystack.split("\n").some((line) => {
    const bag = new Set(line.replace(/[-_]/g, "").split(/[^a-z0-9]+/i).map(stem));
    const squashed = line.toLowerCase().replace(/[\s\-_]/g, "");
    return words.every((w) => bag.has(w) || squashed.includes(w));
  });
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
      const retryable = /429|rate|quota|503|500|UNAVAILABLE|overloaded|timeout|fetch failed|Unexpected token|JSON|contract/i.test(msg);
      if (!retryable || i >= tries) throw e;
      const wait = 8000 * i;
      log(`${label}: ${msg.slice(0, 90)} — retry ${i}/${tries - 1} in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

function writeWav(pcm: Uint8Array, sampleRate: number, channels = 1, bits = 16) {
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

function readWav(buf: Uint8Array) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let sampleRate = 24000, off = 12, pcm: Uint8Array | null = null;
  while (off + 8 <= buf.length) {
    const id = String.fromCharCode(...buf.subarray(off, off + 4));
    const size = dv.getUint32(off + 4, true);
    if (id === "fmt ") sampleRate = dv.getUint32(off + 12, true);
    else if (id === "data") { pcm = buf.subarray(off + 8, off + 8 + size); break; }
    off += 8 + size + (size % 2);
  }
  if (!pcm) throw new Error("WAV has no data chunk");
  return { pcm, sampleRate };
}

/**
 * Beat-aligned TTS blocks under the dialogue budget, with a seam forced after
 * each fully-asked retrieval question so a real silence can go there.
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
    const questionStarts = cur.length > 0 && line.kind === "retrieval-question" && cur[cur.length - 1].kind !== "retrieval-question";
    if (cur.length && (questionStarts || chars + cost > MAX_BLOCK_CHARS || (newBeat && (chars > MAX_BLOCK_CHARS * 0.6 || cur[cur.length - 1].beat === 0)))) {
      // A block that opens with Speaker2 comes out in swapped voices (measured), so
      // when the next line is B's, its preceding A line moves into the new block.
      const carry = line.speaker === "B" && cur.length > 1 && cur[cur.length - 1].speaker === "A" ? cur.pop()! : null;
      flush(BLOCK_GAP_MS);
      if (carry) { cur.push(carry); chars += carry.text.length + 11; }
    }
    cur.push(line);
    chars += cost;
    if (line.kind === "retrieval-question" && lines[i + 1]?.kind !== "retrieval-question") flush(RETRIEVAL_PAUSE_MS);
    if (i === lines.length - 1) flush(0);
  });
  return blocks;
}

/* ── TTS (direct, fixed labels) + voice check ────────────────────── */

/** One block of dialogue → PCM. Speaker1/Speaker2 are fixed to A/B regardless of who speaks first. */
async function ttsBlock(lines: Line[], instructions: string) {
  if (FISH) return fishBlock(lines);
  const transcript = lines.map((l) => `${l.speaker === "A" ? "Speaker1" : "Speaker2"}: ${l.text}`).join("\n");
  const res = await fetch(`${BASE}/models/${TTS_MODEL}:generateContent?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `Delivery instructions:\n${instructions}\n\nTranscript:\n${transcript}` }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { multiSpeakerVoiceConfig: { speakerVoiceConfigs: [
          { speaker: "Speaker1", voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE_A } } },
          { speaker: "Speaker2", voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE_B } } },
        ] } },
      },
    }),
  });
  if (!res.ok) throw new Error(`tts ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { inlineData?: { data: string; mimeType: string } }[] } }[];
    usageMetadata?: { candidatesTokenCount?: number };
  };
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
  if (!part) throw new Error("tts returned no audio");
  const sampleRate = Number(/rate=(\d+)/.exec(part.mimeType)?.[1] ?? 24000);
  const pcm = new Uint8Array(Buffer.from(part.data, "base64"));
  return { pcm, sampleRate, outTokens: json.usageMetadata?.candidatesTokenCount ?? 0 };
}

/**
 * Fish Audio dialogue: one request, explicit per-line speaker tags, voices by index. No delivery
 * instructions field — expression is per-line bracket cues, left out here so the A/B compares the
 * raw voices. outTokens carries the billed unit for this provider: UTF-8 bytes of text.
 */
/**
 * Fish S2 takes free-form natural-language delivery tags in [square brackets], anywhere in the
 * text (docs.fish.audio → Emotion Control). Gemini gets a whole acting direction with every block
 * (DELIVERY); Fish was sent bare text, which is why the first A/B sounded flatter — that was our
 * doing, not the provider's. The script already knows what each line IS, so the direction comes
 * from the line's own kind and the host's role: A explains with quiet confidence, B is curious
 * and reacts fast.
 */
function fishCue(l: Line): string {
  const A = l.speaker === "A";
  switch (l.kind) {
    case "open": return A ? "[warm, glad you're here]" : "[bright, eager]";
    case "motivation": return A ? "[setting up the problem]" : "[curious]";
    case "mechanism": return A ? "[explaining clearly, unhurried]" : "[following closely]";
    case "example": return A ? "[warm, walking through it]" : "[interested]";
    case "analogy": return A ? "[playful]" : "[amused, getting it]";
    case "confusion": return A ? "[patient]" : "[puzzled, thinking out loud]";
    case "relevance": return "[this is the bit that matters]";
    case "midpoint-recap":
    case "recap": return "[calm, gathering the thread]";
    case "retrieval-question": return "[inviting, a little challenge]";
    case "retrieval-pickup": return "[game for it]";
    case "retrieval-attempt": return "[tentative, working it out]";
    case "retrieval-answer": return "[reassuring, confirming]";
    case "homework": return "[encouraging]";
    case "outro": return "[warm, signing off]";
    default: return A ? "[warm]" : "[curious]";
  }
}

async function fishBlock(lines: Line[]) {
  const text = lines
    .map((l) => `<|speaker:${l.speaker === "A" ? 0 : 1}|>${FISH_CUES ? `${fishCue(l)} ` : ""}${l.text}`)
    .join("\n");
  const res = await fetch("https://api.fish.audio/v1/tts", {
    method: "POST",
    headers: { Authorization: `Bearer ${FISH_API_KEY}`, "Content-Type": "application/json", model: FISH_MODEL },
    body: JSON.stringify({
      text, reference_id: [FISH_VOICE_A, FISH_VOICE_B], format: "wav", sample_rate: 24000,
      normalize: true, latency: "normal", temperature: 0.7, top_p: 0.7,
    }),
  });
  if (!res.ok) throw new Error(`fish tts ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const wav = readWav(new Uint8Array(await res.arrayBuffer()));
  return { pcm: wav.pcm, sampleRate: wav.sampleRate, outTokens: Buffer.byteLength(text, "utf8") };
}

const VOICE_CHECK_PROMPT = `Transcribe this two-host audio VERBATIM. Label every paragraph by the VOICE, judged only by
how it sounds: WOMAN or MAN. Never infer the speaker from what is said or from turn-taking; if the
voice changes mid-sentence, split the paragraph there. One paragraph per voice change, formatted
exactly as "WOMAN: …" or "MAN: …". No timestamps, no commentary.`;

const keyOf = (text: string, n = 5) => text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean).slice(0, n).join(" ");

/** Transcribe a block by voice and count lines that came out in the other host's voice. */
async function voiceCheck(lines: Line[], pcm: Uint8Array, sampleRate: number) {
  const wav = writeWav(pcm, sampleRate);
  const res = await fetch(`${BASE}/models/${CHECK_MODEL}:generateContent?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [
        { inline_data: { mime_type: "audio/wav", data: Buffer.from(wav).toString("base64") } },
        { text: VOICE_CHECK_PROMPT },
      ] }],
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
    voice: m[1].toUpperCase(), text: m[2].toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " "),
  }));
  let matched = 0;
  let cursor = 0;
  const wrong: string[] = [];
  for (const l of lines) {
    // Several keys per line: a name the transcriber spells differently ("Ouyang" → "Oyang") made the
    // first-words key miss, and an unmatched line is an unchecked line (Fish intro, 2026-09-17).
    const w = l.text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
    const keys = [w.slice(0, 5), w.slice(-4), w.slice(1, 5), w.slice(Math.max(0, w.length - 5), -1)]
      .filter((k) => k.length >= Math.min(3, w.length)).map((k) => k.join(" "));
    // Sequential: search only from the last matched paragraph forward, a few paragraphs deep. B often
    // restates A's words, so a global search matched B's line inside A's paragraph (3 identical false
    // flags on every take of the Fish run, all cleared by the whole-episode pass).
    const idx = paras.findIndex((p, i) => i >= cursor && i <= cursor + 3 && keys.some((k) => p.text.includes(k)));
    const hit = idx >= 0 ? paras[idx] : undefined;
    if (!hit) continue;
    cursor = idx;
    matched++;
    if (hit.voice !== (l.speaker === "A" ? "WOMAN" : "MAN")) wrong.push(`${l.speaker}: ${l.text.slice(0, 60)}`);
  }
  const cost = ((json.usageMetadata?.promptTokenCount ?? 0) * FLASH_AUDIO_IN + (json.usageMetadata?.candidatesTokenCount ?? 0) * FLASH_OUT) / 1e6;
  return { matched, total: lines.length, wrong, cost, transcript: text };
}

/** Voice a block, check it, and re-voice up to MAX_REVOICE times; keep the best. */
async function voiceBlock(lines: Line[], instructions: string, label: string, maxRevoice = MAX_REVOICE) {
  let best: { pcm: Uint8Array; sampleRate: number; outTokens: number; wrong: string[]; matched: number } | null = null;
  let checkCost = 0;
  let attempts = 0;
  for (let attempt = 0; attempt <= maxRevoice; attempt++) {
    attempts++;
    const tts = await withRetry(`${label} tts`, () => ttsBlock(lines, instructions));
    const check = await withRetry(`${label} voice check`, () => voiceCheck(lines, tts.pcm, tts.sampleRate));
    checkCost += check.cost;
    const cand = { ...tts, wrong: check.wrong, matched: check.matched };
    if (!best || cand.wrong.length < best.wrong.length || (cand.wrong.length === best.wrong.length && cand.matched > best.matched)) best = cand;
    // A line no key can find was probably swallowed into the other host's turn: re-take for that too.
    const unmatched = lines.length - check.matched;
    if (check.wrong.length === 0 && unmatched === 0) break;
    if (check.wrong.length === 0 && attempt >= 1) break; // unmatched only: one extra take, then accept
    if (check.wrong.length === 0) { log(`  ${label}: ${unmatched} line(s) not found in the by-voice transcript — one more take`); continue; }
    log(`  ${label}: ${check.wrong.length} line(s) in the wrong voice (${check.matched}/${lines.length} matched) — re-voicing`);
  }
  return { ...best!, checkCost, attempts };
}

/* ── intro-only preview ──────────────────────────────────────────── */

const PREVIEW_TAIL_S = 80;

async function introOnly(runDir: string) {
  const outline: Outline = JSON.parse(readFileSync(join(runDir, "outline.json"), "utf8"));
  const oldLines: Line[] = JSON.parse(readFileSync(join(runDir, "script.json"), "utf8")).lines;
  const source = readFileSync(join(runDir, "source.txt"), "utf8");
  const firstSection = oldLines.slice(0, 12).map((l) => `${l.speaker}: ${l.text}`).join("\n");

  const llm = new GeminiClient();
  let cost = 0;
  const system = `You write the INTRO of a Clutch Audio episode: two hosts, A drives and explains, B is curious and
restates things in their own words. It must sound like a great NotebookLM Audio Overview.

${INTRO_RULES}

WRITE FOR THE EAR: no markdown, symbols or math characters. Each line at most 140 characters.
Hosts strictly alternate. TRUST: use only facts from the outline and source.

Return JSON exactly: {"lines":[{"speaker":"A","beat":0,"kind":"open","text":""}]}`;
  const user = `OUTLINE:\n${JSON.stringify(outline, null, 2)}\n\nTHE EPISODE AFTER YOUR INTRO already exists and begins:\n${firstSection}\n\n` +
    `Your HANDOFF must lead straight into that first line.\n\nLECTURE SOURCE:\n${source}`;
  const IntroSchema = z.object({ lines: z.array(LineSchema).min(4) });
  let lines: Line[] = [];
  let issues: string[] = [];
  for (let attempt = 0; attempt <= 2; attempt++) {
    lines = await withRetry("intro", async () => {
      const res = await llm.generate({
        system,
        user: attempt === 0 ? user : `${user}\n\nYOUR PREVIOUS INTRO failed:\n${issues.join("\n")}\n\nPREVIOUS INTRO:\n${JSON.stringify({ lines })}`,
        model: GEMINI_PRO, temperature: 0.8, maxOutputTokens: 16384,
      });
      cost += ((res.usage.inputTokens ?? 0) * PRO_IN + (res.usage.outputTokens ?? 0) * PRO_OUT) / 1e6;
      return parseJson(res.text, IntroSchema, "intro").lines.map((l) => ({ ...l, beat: 0, kind: "open" as const }));
    });
    issues = introIssues(lines, outline);
    log(`  intro draft ${attempt + 1}: ${countWords(lines)} words · ${issues.length ? issues.join(" ") : "passes"}`);
    if (!issues.length) break;
  }
  const md = lines.map((l) => `**${l.speaker}** ${l.text}`).join("\n\n");
  writeFileSync(join(runDir, "intro.json"), JSON.stringify({ lines }, null, 2));
  writeFileSync(join(runDir, "intro-transcript.md"), `# Intro — ${outline.title}\n\n${md}\n`);
  console.log(`\n${md}\n`);

  log(`voicing intro with ${TTS_MODEL}…`);
  const v = await voiceBlock(lines, `${DELIVERY}\n${INTRO_DELIVERY}`, "intro");
  const tag = TTS_MODEL.replace(/[^a-z0-9.]+/gi, "-");
  const episode = readWav(readFileSync(join(runDir, `episode-${tag}.wav`)));
  const bps = v.sampleRate * 2;
  const gap = new Uint8Array(Math.round(bps * 0.35) & ~1);
  const tail = episode.pcm.subarray(0, Math.round(bps * PREVIEW_TAIL_S) & ~1);
  const joined = new Uint8Array(v.pcm.length + gap.length + tail.length);
  joined.set(v.pcm, 0);
  joined.set(tail, v.pcm.length + gap.length);
  const wavPath = join(runDir, "intro-preview.wav");
  const mp3Path = join(runDir, "intro-preview.mp3");
  writeFileSync(wavPath, writeWav(joined, v.sampleRate));
  execFileSync("/opt/homebrew/bin/ffmpeg", ["-y", "-loglevel", "error", "-i", wavPath, "-af", `afade=t=out:st=${(joined.length / bps - 2.5).toFixed(2)}:d=2.5`, "-b:a", "128k", mp3Path]);
  const report = {
    introSeconds: +(v.pcm.length / bps).toFixed(1), wrongVoiceLines: v.wrong, ttsAttempts: v.attempts,
    costUSD: { llm: +cost.toFixed(3), tts: +((v.outTokens * (TTS_OUTPUT_PRICE_PER_M[TTS_MODEL] ?? 0)) / 1e6).toFixed(3), checks: +v.checkCost.toFixed(3) },
  };
  writeFileSync(join(runDir, "intro-report.json"), JSON.stringify(report, null, 2));
  log(`intro ${report.introSeconds}s → ${mp3Path}`);
  console.log(JSON.stringify(report, null, 2));
}

/** Draft (or take a saved draft), then revise until every check passes; then the claims pass. */
const MAX_REVISIONS = 8;
async function polishScript(runDir: string, outline: Outline, source: string, llm: GeminiClient, addCost: (u: { inputTokens?: number; outputTokens?: number }) => void, initial: Line[] | null) {
  /* script, validated and revised */
  const words = MINUTES * WORDS_PER_MINUTE;
  const plannedS = outline.beats.reduce((n, b) => n + b.est_seconds, 0) || MINUTES * 60;
  const budgets = outline.beats
    .map((b, i) => `  beat ${i} (${b.kind}, ${b.section}): ~${Math.round((b.est_seconds / plannedS) * words)} words`)
    .join("\n");
  const baseUser = `OUTLINE:\n${JSON.stringify(outline, null, 2)}\n\nPER-BEAT WORD BUDGETS (total ~${words}):\n${budgets}\n\nLECTURE SOURCE:\n${source}`;

  let lines: Line[];
  if (initial) {
    lines = initial;
    log(`polishing the saved script (${lines.length} lines)`);
  } else {
    log(`script (~${words} words)…`);
    lines = await withRetry("script", async () => {
      const s = await llm.generate({ system: SCRIPT_SYSTEM(words), user: baseUser, model: GEMINI_PRO, temperature: 0.8, maxOutputTokens: 65536 });
      addCost(s.usage);
      return parseJson(s.text, ScriptSchema, "script").lines;
    });
  }
  const attempts: { words: number; issues: string[] }[] = [];
  let issues = scriptIssues(lines, words, outline);
  attempts.push({ words: countWords(lines), issues: issues.map((i) => i.split(":")[0]) });
  log(`  draft 1: ${countWords(lines)} words · ${issues.length ? issues.map((i) => i.split(":")[0]).join(" · ") : "passes"}`);

  const revise = async (why: string, temperature: number) => {
    const prev = lines;
    lines = await withRetry("script revise", async () => {
      const s = await llm.generate({
        system: SCRIPT_SYSTEM(words),
        user: `${baseUser}\n\nYOUR PREVIOUS DRAFT failed these checks:\n\n${why}\n\nRewrite the FULL script fixing every issue. Change ONLY what the issues require; keep every other line word for word.\n\nPREVIOUS DRAFT:\n${JSON.stringify({ lines: prev })}`,
        model: GEMINI_PRO, temperature, maxOutputTokens: 65536,
      });
      addCost(s.usage);
      return parseJson(s.text, ScriptSchema, "script").lines;
    });
  };

  /** Line-level fixes without re-rolling the whole script (full rewrites regressed other checks). */
  const patch = async (why: string) => {
    const numbered = lines.map((l, i) => `${i}\t${l.speaker} [${l.kind}]: ${l.text}`).join("\n");
    const edits = await withRetry("script patch", async () => {
      const r = await llm.generate({
        system: PATCH_SYSTEM(words),
        user: `OUTLINE (spine, must_say, sections):\n${JSON.stringify({ spine: outline.spine, must_say: outline.must_say, sections: outline.sections.map((x) => x.name) })}\n\nFAILED CHECKS:\n\n${why}\n\nSCRIPT:\n${numbered}\n\nLECTURE SOURCE (for facts):\n${source}`,
        model: GEMINI_PRO, temperature: 0.4, maxOutputTokens: 32768,
      });
      addCost(r.usage);
      return parseJson(r.text, PatchSchema, "patch").edits;
    });
    const next = [...lines];
    for (const e of [...edits].sort((a, b) => b.at - a.at)) {
      if (e.at < 0 || e.at >= lines.length) continue;
      const beat = lines[e.at].beat;
      next.splice(e.at, 1, ...e.lines.map((l) => ({ ...l, beat })));
    }
    lines = next;
    return edits.length;
  };

  let fullRewrites = 0;
  for (let attempt = 2; attempt <= MAX_REVISIONS && issues.length; attempt++) {
    const needsRewrite = issues.some((i) => GLOBAL_ISSUE.test(i)) && fullRewrites < 2;
    if (needsRewrite) { fullRewrites++; await revise(issues.join("\n\n"), 0.6); }
    else { const n = await patch(issues.join("\n\n")); log(`  patched ${n} line(s)`); }
    issues = scriptIssues(lines, words, outline);
    attempts.push({ words: countWords(lines), issues: issues.map((i) => i.split(":")[0]) });
    log(`  draft ${attempt}: ${countWords(lines)} words · ${issues.length ? issues.map((i) => i.split(":")[0]).join(" · ") : "passes"}`);
    for (const i of issues) log(`      ${i.replace(/\n/g, " | ").slice(0, 600)}`);
  }

  /* 8. claims check — the quote-anchored engine (issue #17), not the old "is this supported?" ask.
   * The model must produce the passage of the lecture that says the line, and CODE then looks for
   * that passage in the source. The old one-shot checker read 54 claims, passed all 54, and four
   * of them had cause and effect backwards. Measured on this very episode with those misses
   * planted back: 6/6 caught, 1 false flag in 9 checked lines. */
  const claimRounds: { checked: number; unsupported: string[] }[] = [];
  for (let round = 0; round < 2; round++) {
    log(`claims check ${round + 1}…`);
    // Only lines that can be wrong in a way that costs a student marks: a number, a causal link,
    // or a claim about what the lecture says. Selected by regex — no model, no cost.
    const selected = selectClaimLines(lines);
    if (!selected.length) { log(`  no checkable claims`); break; }
    const verdicts = await checkClaims(
      selected.map((c, i) => ({ id: String(i), text: c.text })),
      source,
      { client: llm, prose: true, onUsage: (u) => addCost({ inputTokens: u.inputTokens, outputTokens: u.outputTokens }) },
    );
    const bad = verdicts
      .filter((v) => !v.supported)
      .map((v) => ({ ...v, line: selected[Number(v.id)].index, kind: selected[Number(v.id)].kind, text: selected[Number(v.id)].text }))
      .filter((v) => v.line >= 0 && v.line < lines.length);
    claimRounds.push({
      checked: selected.length,
      unsupported: bad.map((v) => `[${v.kind}] line ${v.line}: "${v.text.slice(0, 90)}" — ${v.stage}: ${v.note.slice(0, 90)}`),
    });
    log(`  ${selected.length} of ${lines.length} lines carry a claim · ${bad.length} unsupported`);
    for (const v of bad) log(`    line ${v.line} [${v.kind}] ${v.stage}: "${v.text.slice(0, 80)}"`);
    if (!bad.length) break;
    const why = `CLAIMS: these lines say things the lecture does not support. Fix each — drop the number, state it the way the source states it, or remove the causal link — without changing anything else:\n` +
      bad.map((v) => `  - line ${v.line} (${v.kind}): "${v.text.slice(0, 120)}" — ${v.note.slice(0, 120)}`).join("\n");
    const n = await patch(why + (issues.length ? `\n\nALSO STILL FAILING:\n${issues.join("\n\n")}` : ""));
    log(`  patched ${n} line(s)`);
    issues = scriptIssues(lines, words, outline);
    attempts.push({ words: countWords(lines), issues: issues.map((i) => i.split(":")[0]) });
    log(`  after claims fix: ${countWords(lines)} words · ${issues.length ? issues.map((i) => i.split(":")[0]).join(" · ") : "passes"}`);
  }
  for (let extra = 1; extra <= 3 && issues.length; extra++) {
    const n = await patch(issues.join("\n\n"));
    log(`  patched ${n} line(s)`);
    issues = scriptIssues(lines, words, outline);
    attempts.push({ words: countWords(lines), issues: issues.map((i) => i.split(":")[0]) });
    log(`  final pass ${extra}: ${countWords(lines)} words · ${issues.length ? issues.map((i) => i.split(":")[0]).join(" · ") : "passes"}`);
  }
  if (issues.length) {
    log(`  WARNING: script still fails: ${issues.map((i) => i.split(":")[0]).join(" · ")}`);
    for (const i of issues) log(`    ${i.split("\n")[0]}`);
  }

  writeFileSync(join(runDir, "script.json"), JSON.stringify({ lines }, null, 2));
  writeFileSync(join(runDir, "transcript.md"), `# ${outline.title}\n\n${lines.map((l) => `**${l.speaker}** ${l.text}`).join("\n\n")}\n`);

  const wordCount = countWords(lines);
  const lens = lines.map((l) => wordsOf(l.text));
  const taught = new Set(lines.map((l) => norm(outline.beats[l.beat]?.section ?? "")));
  const bShare = +(countWords(lines.filter((l) => l.speaker === "B")) / wordCount).toFixed(2);
  const script = {
    lines: lines.length, words: wordCount, attempts, remainingIssues: issues.map((i) => i.split("\n")[0]),
    hostBShareOfWords: bShare,
    medianTurnWords: median(lens), shortTurnShare: +(lens.filter((n) => n <= 6).length / lens.length).toFixed(2), longestTurnWords: Math.max(...lens),
    consecutiveSameHost: lines.filter((l, i) => i > 0 && lines[i - 1].speaker === l.speaker).length,
    pushbacks: lines.filter((l) => l.speaker === "B" && PUSHBACK.test(l.text)).length,
    spineMentions: lines.filter((l) => l.text.toLowerCase().includes(outline.spine.keyword.toLowerCase())).length,
    mustSayUnsaid: outline.must_say.filter((m) => !cueFound(lines.map((l) => l.text.toLowerCase()).join("\n"), m.spoken_cue)).map((m) => m.item),
    retrievalQuestions: lines.filter((l) => l.kind === "retrieval-question").length,
    examOverclaims: lines.filter((l) => OVERCLAIM.test(l.text)).map((l) => l.text),
    claimRounds,
    sections: outline.sections.map((sec) => ({ name: sec.name, weight: sec.weight, taught: taught.has(norm(sec.name)) })),
  };
  log(`  ${lines.length} lines · ${wordCount} words · B ${Math.round(bShare * 100)}% · median ${median(lens)}w · ${outline.sections.filter((sec) => taught.has(norm(sec.name))).length}/${outline.sections.length} sections taught`);
  return { lines, script, passes: issues.length === 0 };
}

/* ── run ─────────────────────────────────────────────────────────── */

async function main() {
  if (SMOKE) {
    const demo: Line[] = [
      { speaker: "B", beat: 1, kind: "motivation", text: "Wait, so every word gets to look at every other word?" },
      { speaker: "A", beat: 1, kind: "mechanism", text: "All of them, in parallel. That's exactly why it trains so fast on a GPU." },
      { speaker: "B", beat: 1, kind: "confusion", text: "Then how does it know the order?" },
      { speaker: "A", beat: 1, kind: "mechanism", text: "It doesn't, on its own. You add a position vector to every word before it goes in." },
    ];
    mkdirSync("scripts/phase0/out/smoke", { recursive: true });
    // Raw takes, B-first and A-first, saved for an independent by-voice transcription.
    const variants: [string, Line[]][] = [["b-first", demo], ["a-first", [demo[1], demo[2], demo[3], demo[0]]]];
    for (const [name, ls] of variants) {
      for (let i = 1; i <= 3; i++) {
        const t = await ttsBlock(ls, DELIVERY);
        writeFileSync(`scripts/phase0/out/smoke/${name}-${i}.wav`, writeWav(t.pcm, t.sampleRate));
        const c = await voiceCheck(ls, t.pcm, t.sampleRate);
        console.log(`${name} take ${i}: wrong ${c.wrong.length}/${c.matched} · ${c.transcript.replace(/\s+/g, " ").slice(0, 160)}`);
      }
    }
    return;
  }
  if (INTRO_ONLY) return introOnly(REUSE!);

  let runDir: string;
  let outline: Outline;
  let lines: Line[];
  const report: Record<string, unknown> = { round: 4, ttsModel: TTS_MODEL, targetMinutes: MINUTES, vision: VISION };
  let llmCost = 0;

  if (REUSE) {
    runDir = REUSE;
    outline = JSON.parse(readFileSync(join(runDir, "outline.json"), "utf8"));
    lines = JSON.parse(readFileSync(join(runDir, "script.json"), "utf8")).lines;
    const issues = scriptIssues(lines, MINUTES * WORDS_PER_MINUTE, outline);
    if (issues.length) {
      log(`saved script fails ${issues.map((i) => i.split(":")[0]).join(" · ")} — polishing before voicing`);
      const llm = new GeminiClient();
      const polished = await polishScript(runDir, outline, readFileSync(join(runDir, "source.txt"), "utf8"), llm,
        (u) => (llmCost += ((u.inputTokens ?? 0) * PRO_IN + (u.outputTokens ?? 0) * PRO_OUT) / 1e6), lines);
      lines = polished.lines;
      report.script = polished.script;
      if (!polished.passes) throw new Error("script still fails its checks after polishing — not voicing it");
    } else {
      log(`reusing script from ${runDir} (${lines.length} lines) — re-voicing with ${TTS_MODEL}`);
    }
  } else {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    runDir = join("scripts/phase0/out", `${basename(PDF!, ".pdf")}-r4-${stamp}`);
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
    report.source = { pages: ing.units, chars: ing.charCount, visionPagesSent: ing.visionImages, visionChars: ing.visionChars, visionCostUSD: +visionCost.toFixed(4), warnings: ing.warnings };

    const llm = new GeminiClient();
    const addCost = (u: { inputTokens?: number; outputTokens?: number }) =>
      (llmCost += ((u.inputTokens ?? 0) * PRO_IN + (u.outputTokens ?? 0) * PRO_OUT) / 1e6);

    /* outline, validated: coverage, airtime, wrapper order, spine, must-say */
    const outlineUser = `LECTURE SOURCE (${basename(PDF!)}):\n\n${ing.text}`;
    log("outline…");
    let oIssues: string[] = [];
    outline = undefined as unknown as Outline;
    const outlineAttempts: string[][] = [];
    for (let attempt = 0; attempt <= 2; attempt++) {
      outline = await withRetry("outline", async () => {
        const o = await llm.generate({
          system: OUTLINE_SYSTEM,
          user: attempt === 0 ? outlineUser
            : `${outlineUser}\n\nYOUR PREVIOUS OUTLINE failed these checks:\n${oIssues.join("\n")}\n\nReplan fixing every one. Keep what already works.\n\nPREVIOUS OUTLINE:\n${JSON.stringify(outline)}`,
          model: GEMINI_PRO, temperature: 0.5, maxOutputTokens: 32768,
        });
        addCost(o.usage);
        return parseJson(o.text, OutlineSchema, "outline");
      });
      oIssues = outlineIssues(outline);
      outlineAttempts.push(oIssues.map((i) => i.split(":")[0]));
      log(`  outline draft ${attempt + 1}: ${oIssues.length ? oIssues.map((i) => i.split(":")[0]).join(" · ") + " — replanning" : "passes"}`);
      if (!oIssues.length) break;
    }
    writeFileSync(join(runDir, "outline.json"), JSON.stringify(outline, null, 2));
    log(`  "${outline.title}" · ${outline.sections.length} sections · ${outline.beats.length} beats · spine "${outline.spine.keyword}" · ${outline.must_say.length} must-say`);
    for (const sec of outline.sections) {
      const secs = outline.beats.filter((b) => norm(b.section) === norm(sec.name)).reduce((n, b) => n + b.est_seconds, 0);
      log(`    ${(sec.weight * 100).toFixed(0).padStart(3)}%  ${String(Math.round(secs)).padStart(4)}s  ${sec.name}  (pp. ${sec.pages})`);
    }
    report.outline = { attempts: outlineAttempts, remainingIssues: oIssues };

    const polished = await polishScript(runDir, outline, ing.text, llm, addCost, null);
    lines = polished.lines;
    report.script = polished.script;
    if (!polished.passes) throw new Error("script still fails its checks — not voicing it (rerun with --reuse to keep polishing)");
  }

  /* Targeted re-voice: blocks are separated by exact digital silence (the gaps this script
     inserts), so the existing WAV can be cut at those gaps and only the chosen blocks replaced. */
  if (REVOICE.length) {
    const tag = TTS_MODEL.replace(/[^a-z0-9.]+/gi, "-");
    const wavPath = join(runDir, `episode-${tag}.wav`);
    const wav = readWav(readFileSync(wavPath));
    const blocks = toBlocks(lines);
    const bps = wav.sampleRate * 2;
    const minGap = Math.round((bps * (BLOCK_GAP_MS - 20)) / 1000) & ~1;
    // Runs of exact zero bytes at least one gap long → block seams.
    const seams: { start: number; end: number }[] = [];
    let run = 0;
    for (let i = 0; i < wav.pcm.length; i += 2) {
      if (wav.pcm[i] === 0 && wav.pcm[i + 1] === 0) run += 2;
      else { if (run >= minGap) seams.push({ start: i - run, end: i }); run = 0; }
    }
    if (seams.length !== blocks.length - 1) throw new Error(`found ${seams.length} silent seams for ${blocks.length} blocks — cannot splice safely`);
    const segStarts = [0, ...seams.map((g) => g.end)];
    const segEnds = [...seams.map((g) => g.start), wav.pcm.length];
    const parts: Uint8Array[] = [];
    let wrongRemaining = 0, ttsTokens = 0, checkCost = 0;
    for (let i = 0; i < blocks.length; i++) {
      if (REVOICE.includes(i + 1)) {
        const instructions = blocks[i].lines[0].beat === 0 ? `${DELIVERY}\n${INTRO_DELIVERY}` : DELIVERY;
        const r = await voiceBlock(blocks[i].lines, instructions, `block ${i + 1}/${blocks.length}`, MAX_REVOICE_TARGETED);
        log(`  block ${i + 1}/${blocks.length} · ${(r.pcm.length / bps).toFixed(1)}s · ${r.attempts} take(s) · wrong voice ${r.wrong.length} (${r.matched}/${blocks[i].lines.length} matched)${r.wrong.length ? " — " + r.wrong.join(" / ") : ""}`);
        wrongRemaining += r.wrong.length; ttsTokens += r.outTokens; checkCost += r.checkCost;
        parts.push(r.pcm);
      } else {
        parts.push(wav.pcm.subarray(segStarts[i], segEnds[i]));
      }
      if (i < seams.length) parts.push(wav.pcm.subarray(seams[i].start, seams[i].end));
    }
    const total = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let off = 0;
    for (const p of parts) { total.set(p, off); off += p.length; }
    writeFileSync(wavPath, writeWav(total, wav.sampleRate));
    const mp3Path = join(runDir, `episode-${tag}.mp3`);
    execFileSync("/opt/homebrew/bin/ffmpeg", ["-y", "-loglevel", "error", "-i", wavPath, "-b:a", "128k", mp3Path]);
    const cost = (FISH ? 0 : (ttsTokens * (TTS_OUTPUT_PRICE_PER_M[TTS_MODEL] ?? 0)) / 1e6) + checkCost;
    log(`re-voiced blocks ${REVOICE.join(", ")} · ${(total.length / bps / 60).toFixed(2)} min · ${wrongRemaining} wrong-voice line(s) remaining · $${cost.toFixed(3)}`);
    return;
  }

  /* TTS with per-block voice check */
  const blocks = toBlocks(lines);
  const bFirst = blocks.filter((b) => b.lines[0].speaker === "B").length;
  log(`TTS with ${TTS_MODEL}: ${blocks.length} blocks (${bFirst} open with B), ${TTS_CONCURRENCY} at a time, voice-checked`);
  const results: Awaited<ReturnType<typeof voiceBlock>>[] = new Array(blocks.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(TTS_CONCURRENCY, blocks.length) }, async () => {
    while (next < blocks.length) {
      const i = next++;
      const b = blocks[i];
      const instructions = b.lines[0].beat === 0 ? `${DELIVERY}\n${INTRO_DELIVERY}` : DELIVERY;
      results[i] = await voiceBlock(b.lines, instructions, `block ${i + 1}/${blocks.length}`);
      const r = results[i];
      log(`  block ${i + 1}/${blocks.length} · ${(r.pcm.length / (r.sampleRate * 2)).toFixed(1)}s · ${r.attempts} take(s) · wrong voice ${r.wrong.length} (${r.matched}/${b.lines.length} matched)`);
    }
  }));

  const sampleRate = results[0].sampleRate;
  const bps = sampleRate * 2;
  const pcmParts: Uint8Array[] = [];
  const chapters: { section: string; startS: number }[] = [];
  let cursorS = 0, lastSection = "", ttsTokens = 0, checkCost = 0, wrongVoice = 0, revoiced = 0;
  const wrongLines: string[] = [];
  results.forEach((r, i) => {
    const section = outline.beats[blocks[i].lines[0].beat]?.section ?? "";
    if (section && section !== lastSection) { chapters.push({ section, startS: Math.round(cursorS) }); lastSection = section; }
    pcmParts.push(r.pcm);
    cursorS += r.pcm.length / bps;
    if (blocks[i].pauseAfterMs > 0) {
      pcmParts.push(new Uint8Array(Math.round((bps * blocks[i].pauseAfterMs) / 1000) & ~1));
      cursorS += blocks[i].pauseAfterMs / 1000;
    }
    ttsTokens += r.outTokens; checkCost += r.checkCost; wrongVoice += r.wrong.length; revoiced += r.attempts - 1;
    wrongLines.push(...r.wrong.map((w) => `block ${i + 1}: ${w}`));
  });
  const total = new Uint8Array(pcmParts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of pcmParts) { total.set(p, off); off += p.length; }

  const tag = TTS_MODEL.replace(/[^a-z0-9.]+/gi, "-");
  const wavPath = join(runDir, `episode-${tag}.wav`);
  const mp3Path = join(runDir, `episode-${tag}.mp3`);
  writeFileSync(wavPath, writeWav(total, sampleRate));
  const durationS = total.length / bps;
  log(`episode: ${(durationS / 60).toFixed(2)} min · ${wrongVoice} wrong-voice line(s) remaining · ${revoiced} block re-take(s)`);
  if (existsSync("/opt/homebrew/bin/ffmpeg")) {
    execFileSync("/opt/homebrew/bin/ffmpeg", ["-y", "-loglevel", "error", "-i", wavPath, "-b:a", "128k", mp3Path]);
    log(`mp3: ${mp3Path}`);
  }

  const ttsCost = FISH
    ? (ttsTokens * (FISH_MODEL.endsWith("-free") ? 0 : FISH_PRICE_PER_M_BYTES)) / 1e6
    : (ttsTokens * (TTS_OUTPUT_PRICE_PER_M[TTS_MODEL] ?? 0)) / 1e6;
  if (FISH) report.fish = { model: FISH_MODEL, voices: { A: FISH_VOICE_A, B: FISH_VOICE_B }, textBytes: ttsTokens, listPriceUSD: +((ttsTokens * FISH_PRICE_PER_M_BYTES) / 1e6).toFixed(3) };
  report.tts = {
    blocks: blocks.length, durationMinutes: +(durationS / 60).toFixed(2), chapters,
    billedTokens: ttsTokens, tokensPerSecond: +(ttsTokens / durationS).toFixed(2),
    wrongVoiceLinesRemaining: wrongLines, blockRetakes: revoiced, ttsCostUSD: +ttsCost.toFixed(3), voiceCheckCostUSD: +checkCost.toFixed(3),
  };
  report.costUSD = { llmAndVision: +llmCost.toFixed(3), tts: +ttsCost.toFixed(3), checks: +checkCost.toFixed(3), total: +(llmCost + ttsCost + checkCost).toFixed(3) };
  writeFileSync(join(runDir, `report-${tag}.json`), JSON.stringify(report, null, 2));
  log(`done → ${runDir}`);
  console.log(JSON.stringify({ script: report.script, tts: report.tts, cost: report.costUSD }, null, 2));
}

main().catch((e) => {
  console.error(`\nFAILED: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
