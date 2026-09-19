/**
 * podcast-prompts.ts — the words that make an episode teach (#3).
 *
 * Ported verbatim from `scripts/phase0/episode.ts`. These are not drafts: every paragraph here
 * replaced an episode that failed in a specific way, across four rounds. Changing one is changing
 * the product, and should be measured the way they were earned — regenerate and listen.
 *
 * `MINUTES` and the retrieval count were module constants in Phase 0; here they are parameters,
 * because a series has episodes of different lengths.
 */
import { z } from "zod";
import { LINE_KINDS } from "@/contract/podcast-script";

/** One retrieval beat per ~8 minutes, at least one, at most three. Measured in Phase 0. */
export const retrievalsFor = (minutes: number) => Math.max(1, Math.min(3, Math.round(minutes / 8)));

/** Mirrors the airtime rule in podcast-checks.ts; the prompt has to state the same numbers. */
const MAJOR_SECTION_WEIGHT = 0.08;
const AIRTIME_TOLERANCE = 0.4;

export const OUTLINE_SYSTEM = (MINUTES: number) => {
  const RETRIEVALS = retrievalsFor(MINUTES);
  return `You are the producer of Clutch Audio, a two-host study podcast.
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
};


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


export const SCRIPT_SYSTEM = (words: number) => `You write the dialogue for a Clutch Audio episode.

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


export const PATCH_SYSTEM = (words: number) => `You are editing an existing Clutch Audio script with SURGICAL patches. You get the full numbered
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

/** One patch edit replaces line `at` with 1-3 new lines; everything else stays untouched. */
export const PatchSchema = z.object({
  edits: z
    .array(
      z.object({
        at: z.number().int(),
        lines: z
          .array(z.object({ speaker: z.enum(["A", "B"]), kind: z.enum(LINE_KINDS), text: z.string().min(1) }))
          .min(1)
          .max(3),
      }),
    ),
});

/* ── which spoken lines carry a claim worth checking ──────────────────────────────────────────
 * Most dialogue asserts nothing ("Right, so where does that leave us?"). Checking everything
 * would drown the real flags, so lines are selected first by regex — no model, no cost — for the
 * three kinds that can be wrong in a way that costs a student marks.
 */
const NUMBER = /\b\d{2,}(?:[.,]\d+)?\b|\b\d+(?:\.\d+)?\s?%|\b\d+(?:\.\d+)?\s?(?:x|times|percent|million|billion|thousand)\b/i;
const CAUSAL = /\b(caus(?:e[sd]?|ing)|creat(?:e[sd]?|ing)|led to|leads to|introduc(?:e[sd]?|ing)|gives? rise to|results? in|resulting in|that'?s why|which is why|so that'?s how)\b/i;
const SOURCE_CLAIM = /\b(the (?:lecture|slides?|notes?|paper|professor|deck)|she (?:says|showed|writes)|it says|according to)\b/i;

export function selectClaimLines(lines: { text: string }[]): { index: number; kind: string; text: string }[] {
  const out: { index: number; kind: string; text: string }[] = [];
  lines.forEach((l, index) => {
    const kinds: string[] = [];
    if (NUMBER.test(l.text)) kinds.push("number");
    if (CAUSAL.test(l.text)) kinds.push("cause");
    if (SOURCE_CLAIM.test(l.text)) kinds.push("source");
    if (kinds.length) out.push({ index, kind: kinds.join("+"), text: l.text });
  });
  return out;
}
