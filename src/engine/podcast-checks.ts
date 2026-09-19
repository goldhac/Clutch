/**
 * podcast-checks.ts — the soft rules, the ones the patch loop repairs (#3).
 *
 * Ported from `scripts/phase0/episode.ts`. Every rule here exists because an episode failed
 * without it, and the wording of each message is part of the rule: the patcher reads these
 * strings, so they say what is wrong AND what to do, and they quote the offending lines.
 *
 * Why these are not in the contract: a first draft fails several of them almost every time, and
 * the loop fixes them in one or two passes. A hard rejection would throw that work away. See the
 * note at the top of `contract/podcast-script.ts`.
 */
import type { PodcastOutline } from "@/contract/podcast-outline";
import { WRAPPER_KINDS, countWords, wordsOf, type PodcastLine } from "@/contract/podcast-script";

/* ── tuning, all of it measured in Phase 0 ──────────────────────────────────────────────────── */

/** A section smaller than this is not worth policing for airtime. */
const MAJOR_SECTION_WEIGHT = 0.08;
/** How far a section's airtime may drift from its share of the lecture. */
const AIRTIME_TOLERANCE = 0.4;
/** Long turns are what make generated dialogue sound like a monologue. */
const MEDIAN_WORDS_MAX = 16;
const LONG_TURN_WORDS = 45;
/** Real conversation has short turns in it. */
const SHORT_TURN_SHARE_MIN = 0.15;
/** B is a host, not a prompt generator. */
const B_WORD_SHARE_MIN = 0.38;

/** Symbols a voice reads literally: markdown, code, maths. */
const EYE_ONLY = /[`*_#^$\\{}=√∑∏⊕⊗×÷≤≥≠≈∈∉→←↔∀∃∂∇∞]|\b[A-Za-z]_[A-Za-z0-9]|\b\w+\^\w/;
/** Announcing a transition instead of arriving at it through curiosity. */
const ANNOUNCER = /\b(now,? let'?s (?:move|step|turn|go|talk|look)|let'?s (?:move on|step back|turn to)|next,? (?:let'?s|we'?ll)|moving on)\b/i;
/** B earning their place: doubt, objection, a real question. */
const PUSHBACK = /\b(wait|hold on|hang on|push back|too (?:expensive|neat|easy|good)|isn'?t that just|but (?:doesn'?t|isn'?t|wouldn'?t|how|why|that|then|what|if))\b/i;
/** We do not know what is on anyone's exam. Saying we do is the fastest way to lose a student. */
const OVERCLAIM = /\b(definitely|certainly|guaranteed|will be)\b.*\bexam\b|\bexam\b.*\b(definitely|guaranteed)\b/i;
/** Section-name words too generic to prove the intro mentioned that section. */
const GENERIC = new Set([
  "introduction", "intro", "overview", "problem", "problems", "section", "lecture", "part", "basics",
  "summary", "conclusion", "attention", "model", "models", "network", "networks", "vector", "with",
  "from", "into", "that", "this", "their", "what", "about",
]);
const CUE_STOP = new Set(["the", "of", "and", "is", "a", "an", "to", "in", "with", "by", "for", "on", "or", "it", "its", "that", "this", "are", "be"]);

const norm = (x: string) => x.toLowerCase().trim();
const stem = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/**
 * A cue like "square root of d-k" counts as spoken when all its content words — stemmed to five
 * letters, so "concatenate" also matches "concatenated" — land on ONE line, in any order.
 * Round 4 failed a line for saying "d k" where the cue read "d-k"; hence the squashed compare.
 */
export function cueFound(haystack: string, cue: string): boolean {
  const words = cue.replace(/[-_]/g, "").split(/\s+/).map(stem).filter((w) => w && !CUE_STOP.has(w));
  if (!words.length) return true;
  return haystack.split("\n").some((line) => {
    const bag = new Set(line.replace(/[-_]/g, "").split(/[^a-z0-9]+/i).map(stem));
    const squashed = line.toLowerCase().replace(/[\s\-_]/g, "");
    return words.every((w) => bag.has(w) || squashed.includes(w));
  });
}

function sectionsMissingFromIntro(introText: string, outline: PodcastOutline): string[] {
  const text = introText.toLowerCase();
  return outline.sections
    .filter((sec) => {
      const keys = sec.name.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4 && !GENERIC.has(w));
      return keys.length > 0 && !keys.some((w) => text.includes(w.slice(0, 6)));
    })
    .map((sec) => sec.name);
}

/**
 * The first thirty seconds decide whether anyone hears the rest. Round 3's episode opened
 * mid-thought because the prompt said "open mid-thought"; this is the structure that replaced it.
 */
export function introIssues(lines: PodcastLine[], outline: PodcastOutline): string[] {
  const intro = lines.filter((l) => l.beat === 0);
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

/**
 * Every soft rule, as strings the patcher can act on. Empty array means the script is ready.
 * `targetWords` is the episode length in words (minutes × words-per-minute).
 */
export function scriptIssues(lines: PodcastLine[], targetWords: number, outline: PodcastOutline): string[] {
  const issues: string[] = [];
  const got = countWords(lines);

  if (got < targetWords * 0.85) {
    issues.push(`LENGTH: the draft is ${got} words; the requirement is ~${targetWords}. Deepen the teaching and add reactions to reach it.`);
  }

  const eye = lines.filter((l) => EYE_ONLY.test(l.text));
  if (eye.length) {
    issues.push(
      `WRITTEN FOR THE EYE: ${eye.length} line(s) contain markdown, code or math symbols a voice would read ` +
        `literally. Rewrite each in spoken words:\n` + eye.slice(0, 25).map((l) => `  - "${l.text}"`).join("\n"),
    );
  }

  issues.push(...introIssues(lines, outline));

  // ── Rhythm, alternation, balance ──────────────────────────────────────────────────────────
  const lens = lines.map((l) => wordsOf(l.text));
  const med = median(lens);
  const shortShare = lens.filter((n) => n <= 6).length / lens.length;
  const long = lines.filter((l) => wordsOf(l.text) > LONG_TURN_WORDS);
  const rhythm: string[] = [];
  if (med > MEDIAN_WORDS_MAX) rhythm.push(`median turn is ${med} words (max ${MEDIAN_WORDS_MAX}) — split explanations with B's reactions and guesses`);
  if (shortShare < SHORT_TURN_SHARE_MIN) rhythm.push(`only ${(shortShare * 100).toFixed(0)}% of turns are 6 words or fewer (need ${SHORT_TURN_SHARE_MIN * 100}%) — add quick real reactions`);
  if (long.length) rhythm.push(`${long.length} turn(s) over ${LONG_TURN_WORDS} words:\n` + long.slice(0, 8).map((l) => `  - "${l.text.slice(0, 90)}…"`).join("\n"));
  if (rhythm.length) issues.push(`RHYTHM: ${rhythm.join("; ")}.`);

  const bShare = countWords(lines.filter((l) => l.speaker === "B")) / (got || 1);
  if (bShare < B_WORD_SHARE_MIN) issues.push(`BALANCE: B has ${(bShare * 100).toFixed(0)}% of the words; B needs at least 40%, with substance.`);

  const bare = lines.filter((l) => /^(okay|right|yeah|yes|exactly|sure|mm-?hmm|got it)[.!?]?$/i.test(l.text.trim()));
  if (bare.length > lines.length / 8) {
    issues.push(`FILLER: ${bare.length} bare one-word acknowledgements; at most one in eight lines. Make reactions carry content.`);
  }

  // ── The running example ───────────────────────────────────────────────────────────────────
  const kw = outline.spine.keyword.toLowerCase();
  const spineLines = lines.filter((l) => l.text.toLowerCase().includes(kw));
  const spineSections = new Set(spineLines.map((l) => norm(outline.beats[l.beat]?.section ?? "")));
  const outroHas = lines.some((l) => l.kind === "outro" && l.text.toLowerCase().includes(kw));
  if (spineSections.size < 3 || !outroHas) {
    issues.push(
      `SPINE: the running example "${outline.spine.example}" (keyword "${outline.spine.keyword}") appears in ` +
        `${spineSections.size} section(s)${outroHas ? "" : " and not in the outro"}; it must return in at least 3 sections and in the outro.`,
    );
  }

  // ── Curiosity: sections open from B's question; B pushes back; nobody announces ────────────
  // A section "opens with B's question" when B asks one within its first TWO lines — A may close
  // the previous thought first. Requiring the very first line be B's made the patcher oscillate.
  const openers: PodcastLine[][] = [];
  let prevSec = "";
  lines.forEach((l, i) => {
    const sec = norm(outline.beats[l.beat]?.section ?? "");
    const isTeaching = !(WRAPPER_KINDS as readonly string[]).includes(l.kind);
    if (isTeaching && sec && sec !== prevSec) {
      if (prevSec) openers.push(lines.slice(i, i + 2));
      prevSec = sec;
    }
  });
  const isQuestion = (l?: PodcastLine) => !!l && l.speaker === "B" && /\?\s*$/.test(l.text.trim());
  const badOpeners = openers.filter((pair) => !isQuestion(pair[0]) && !isQuestion(pair[1]));
  if (badOpeners.length) {
    issues.push(
      `CURIOSITY: ${badOpeners.length} section(s) don't open from B's question or objection (B's line ending with "?" ` +
        `must be the section's first or second line):\n` +
        badOpeners.map((pair) => `  - ${pair[0].speaker}: "${pair[0].text.slice(0, 90)}"`).join("\n"),
    );
  }
  const pushbacks = lines.filter((l) => l.speaker === "B" && PUSHBACK.test(l.text));
  if (pushbacks.length < 3) {
    issues.push(`CURIOSITY: only ${pushbacks.length} pushback(s) from B; at least 3 ("hold on", "I have to push back", "but doesn't…").`);
  }
  const announcers = lines.filter((l) => ANNOUNCER.test(l.text));
  if (announcers.length) {
    issues.push(
      `ANNOUNCER: ${announcers.length} line(s) announce a transition instead of arriving at it through B's curiosity:\n` +
        announcers.slice(0, 8).map((l) => `  - "${l.text.slice(0, 90)}"`).join("\n"),
    );
  }

  // ── Everything the outline promised gets said ─────────────────────────────────────────────
  const all = lines.map((l) => l.text.toLowerCase()).join("\n");
  const unsaid = outline.must_say.filter((m) => !cueFound(all, m.spoken_cue));
  if (unsaid.length) {
    issues.push(
      `MUST-SAY: these were never said out loud (use the cue words):\n` +
        unsaid.map((m) => `  - [${m.kind}] ${m.item} — cue "${m.spoken_cue}"`).join("\n"),
    );
  }

  // ── Airtime follows the lecture, not the model's interest ─────────────────────────────────
  const teaching = lines.filter((l) => !(WRAPPER_KINDS as readonly string[]).includes(l.kind));
  const teachingW = countWords(teaching) || 1;
  const wSum = outline.sections.reduce((n, s) => n + s.weight, 0) || 1;
  const drift: string[] = [];
  for (const s of outline.sections) {
    if (s.weight < MAJOR_SECTION_WEIGHT) continue;
    const share = countWords(teaching.filter((l) => norm(outline.beats[l.beat]?.section ?? "") === norm(s.name))) / teachingW;
    const want = s.weight / wSum;
    if (Math.abs(share - want) > want * AIRTIME_TOLERANCE) {
      drift.push(`"${s.name}" is ${(want * 100).toFixed(0)}% of the lecture but ${(share * 100).toFixed(0)}% of the teaching words`);
    }
  }
  if (drift.length) issues.push(`AIRTIME: ${drift.join("; ")} (allowed ±${AIRTIME_TOLERANCE * 100}%). Move depth, not filler.`);

  // ── Trust ─────────────────────────────────────────────────────────────────────────────────
  const overclaims = lines.filter((l) => OVERCLAIM.test(l.text));
  if (overclaims.length) issues.push(`TRUST: ${overclaims.length} line(s) claim what is on the exam.`);

  return issues;
}
