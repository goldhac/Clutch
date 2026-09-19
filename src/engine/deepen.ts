/**
 * deepen.ts — make the pool deep enough to fill BOTH sides of the sheet.
 *
 * The system prompt has always asked for ~140 items; production returns 60–100 (2026-09-17:
 * 61, 80, 94, 96, 98), and with traps off by default the back page came up nearly blank. A
 * prompt rule can't fix what a prompt rule already failed to do, and asking the main Pro call
 * for twice the output would double a wait that is already two minutes. So: measure the pool,
 * and when it is short, ask Flash for MORE lines — one call per topic, all in parallel
 * (~15–20 s total), each grounded in the pack text and told what the topic already says.
 * Every new line passes the same item contract as a generated one, must sit in its topic, must
 * cite one of the student's files and must not repeat a line the sheet already has. Anything
 * that fails is dropped, never loosened. Best effort: on any failure the sheet ships as it was.
 *
 * The type size and the 7 columns are the product; they never change to fill space.
 */
import { safeParseSheetContent, type SheetContent } from "@/contract/sheet-content";
import { checkClaims } from "./claims-check";
import { isProviderCapacityError } from "@/lib/provider-outage";
import { applyOps, ITEM_SCHEMA, labelOf, type EditOp, type EditSection } from "./edit";
import { defaultGeminiClient, GEMINI_FLASH } from "./gemini-client";
import type { LLMClient } from "./llm-client";
import { normalizeDraft } from "./normalize";
import type { ExamFormat } from "./prompt";

/**
 * Lines that take space with traps hidden (the default view). Measured: one page holds 68–74,
 * so two pages ≈ 145; the rest is deliberate OVERSUPPLY. Fixed-space layout is a selection
 * problem (newspaper pagination; Paper2Poster's render→"too blank"/"overflow"→revise-content
 * loop): supply more than fits and let the measuring fitter keep the best — it trims the
 * lowest-ranked lines, it cannot invent missing ones.
 */
export const FILL_TARGET = 160;
/** Below this gap the fitter's tail-packing closes it; not worth a model call. */
const MIN_DEFICIT = 10;
const MAX_PER_TOPIC = 30;
/** Render→measure→revise loops are bounded everywhere they work (Paper2Poster caps its own). */
const MAX_ROUNDS = 2;
/** Surplus kept beyond the gap: the fitter fills a page best with a few lines to choose from. */
const KEEP_OVER = 1.12;
const FILL_SECTIONS = ["concepts", "questions", "formulas", "tables"] as const;
type FillSection = (typeof FILL_SECTIONS)[number];

/**
 * A sheet may not say more than its sources do. Two dense pages hold ~3,000 words; a 1,200-word
 * deck cannot fill them without repeating itself or writing from the model's own knowledge
 * (seen in testing: "Master Theorem Case 1–3" cited to a homework that never says "master").
 * So the target is capped at a multiple of the pack's own length. 1.6, not 1: a sheet line
 * carries its answer and its reason, and first drafts already run ~1.5× a thin deck. At 2 a
 * lecture-sized pack (~17k chars) fills both sides; a single short deck (~8k) stops at one page.
 * What keeps 2× honest is below: the grounding check and the paraphrase check.
 */
const SOURCE_RATIO = 2;
const STOP = new Set(
  "which following about their there these those would could should where when what that this with from have been being into than then also only most more such each other some many does were will because while between under over after before true false".split(" "),
);
/** Hyphens split ("self-attention" and "self attention" must match); 6-letter stems fold plurals. */
export const stems = (t: string): string[] =>
  (t.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !STOP.has(w)).map((w) => w.slice(0, 6));
const TEXT_KEYS = ["term", "def", "q", "a", "name", "formula", "vars", "when", "ex", "title"] as const;
const textOf = (item: unknown): string => {
  const it = (item ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(it.rows) ? (it.rows as unknown[][]).flat().join(" ") : "";
  return `${TEXT_KEYS.map((k) => (typeof it[k] === "string" ? it[k] : "")).join(" ")} ${rows}`;
};

/**
 * Deterministic grounding check for a NEW line: most words of its headline (a concept's term, a
 * formula's name) must occur in the pack, and most of the line's other words must too.
 * Crude on purpose — it cannot prove a line true, but it reliably catches a line about
 * something the student's files never mention.
 */
export function groundingProblem(section: string, item: unknown, pack: Set<string>): string | null {
  const it = (item ?? {}) as Record<string, unknown>;
  const head = section === "concepts" ? it.term : section === "formulas" ? it.name : null;
  if (typeof head === "string") {
    // Most of the headline, not all of it: the model labels lines ("… Purpose", "… (Detailed)")
    // with words the slides never use. A headline mostly absent from the pack is a new subject.
    const hs = stems(head);
    if (hs.length && hs.filter((w) => pack.has(w)).length / hs.length < 0.6) return `"${head}" is not in your files`;
  }
  const all = stems(textOf(item));
  if (all.length >= 5) {
    const share = all.filter((w) => pack.has(w)).length / all.length;
    if (share < 0.55) return `only ${Math.round(share * 100)}% of its words are in your files`;
  }
  return null;
}

/**
 * A wrong figure is the worst thing an exam sheet can carry, and word overlap cannot see it
 * ("60% of adults" and "16% of adults" share every word). Every number in a NEW line that is
 * specific enough to be wrong — two or more digits, a decimal, a percentage — must occur in the
 * text the line was built from. Formulas are exempt: their digits are exponents and indices.
 */
const UNITS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
/** Slides write "Sixty percent"; a line that says "60%" is quoting them. Digits for every number word. */
function spelledNumbers(text: string): string {
  const out: string[] = [];
  const re = new RegExp(`\\b(${TENS.filter(Boolean).join("|")})(?:[- ](${UNITS.slice(1, 10).join("|")}))?\\b|\\b(${UNITS.slice(10).join("|")})\\b`, "gi");
  for (const m of text.matchAll(re)) {
    if (m[1]) out.push(String(TENS.indexOf(m[1].toLowerCase()) * 10 + (m[2] ? UNITS.indexOf(m[2].toLowerCase()) : 0)));
    else if (m[3]) out.push(String(UNITS.indexOf(m[3].toLowerCase())));
  }
  return out.join(" ");
}

export function numberProblem(section: string, item: unknown, sourceText: string): string | null {
  if (section === "formulas") return null;
  const source = `${sourceText.replace(/(\d),(?=\d{3})/g, "$1")} ${spelledNumbers(sourceText)}`;
  const nums = textOf(item).replace(/(\d),(?=\d{3})/g, "$1").match(/\d+(?:\.\d+)?%?/g) ?? [];
  for (const n of nums) {
    const core = n.replace(/%$/, "");
    const specific = core.replace(".", "").length >= 2 || n.endsWith("%") || core.includes(".");
    if (!specific) continue;
    // Whole-number match: "16" must not be satisfied by "2016" or "160".
    if (!new RegExp(`(?<![\\d.])${core.replace(".", "\\.")}(?![\\d])`).test(source)) return `the number ${n} is not in your files`;
  }
  return null;
}

/** The words a line is ABOUT: its question or headline, not its answer. */
const aboutOf = (section: string, item: unknown): Set<string> => new Set(stems(labelOfFull(section, item)));
const labelOfFull = (section: string, item: unknown): string => {
  const it = (item ?? {}) as Record<string, unknown>;
  return String(it.q ?? it.term ?? it.name ?? it.title ?? it.text ?? "");
};
/** Same subject said another way: most of the smaller line's words are in the other one. */
const PARAPHRASE = 0.75;
export function paraphrases(a: Set<string>, b: Set<string>): boolean {
  if (a.size < 3 || b.size < 3) return false;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / Math.min(a.size, b.size) >= PARAPHRASE;
}

export const visibleLines = (c: SheetContent): number =>
  c.formulas.length + c.concepts.length + c.questions.length + (c.tables ?? []).length;

const keyOf = (section: string, item: unknown): string =>
  `${section === "formulas" || section === "concepts" ? "def" : section}:${labelOf(section as EditSection, item).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 70)}`;

const SYSTEM = `
You add lines to ONE topic of a student's exam reference sheet. You are given the TOPIC, the
lines that topic ALREADY has, how many NEW lines to write, and the PACK TEXT — the student's
own course files, the only source of facts.

Write new lines that an examiner could plausibly test and that the topic does not already
cover: definitions the slides give that were skipped, worked examples not yet itemised,
comparisons, numbers, steps of a procedure, exceptions to a rule. Never restate an existing
line in other words. If the pack has nothing more on this topic, return fewer lines — filler
on an exam sheet is worse than white space.

ITEM SHAPES (no extra keys):
- concepts:  {"topic","term","def","src","conf"}     def ends with a concrete "Example: …" when the pack gives one
- questions: {"topic","q","a","kind":"MCQ|short|problem|T/F","src","conf"}   "a" is required
- formulas:  {"topic","name","formula","vars","when","ex"?,"src","conf"}     only if the pack states the formula
- tables:    {"topic","title","cols":[…],"rows":[[…]],"src"}                  every row as long as cols; at most one
"topic" must be exactly the topic name you were given. "conf" is "med" or "low" ("high" only
for a multi-source src containing ";"). "src" cites the pack the way the existing lines do
("<file> p12", "<file> Slide 4") — never a file that is not in the pack.

Return JSON exactly: {"items":[{"section":"concepts","item":{…}}]}
`.trim();

function formatRule(format: ExamFormat | undefined): string {
  switch (format) {
    case "multiple-choice":
      return `This is a MULTIPLE-CHOICE exam: about two thirds of the new lines should be questions of kind "MCQ" (the rest concepts the questions rely on) whose answer is "<correct option> — not <the most tempting wrong option>: <why it is wrong>".`;
    case "true-false":
      return `This is a TRUE/FALSE exam: about two thirds of the new lines should be questions of kind "T/F" (the rest concepts the statements rely on); write about as many TRUE statements as FALSE ones, the answer starting "TRUE —" or "FALSE —" with the reason.`;
    case "problems":
      return `This is a PROBLEM-SOLVING exam: prefer formulas the pack states and questions of kind "problem" with the worked answer.`;
    case "short-answer":
      return `This is a SHORT-ANSWER exam: prefer concepts and questions of kind "short".`;
    default:
      return `Mixed exam: mix the question kinds (MCQ, short, T/F, problem) the way an examiner would.`;
  }
}

export interface DeepenResult {
  /** `add` operations, already validated. */
  ops: EditOp[];
  dropped: string[];
  proposed: SheetContent;
  before: number;
  after: number;
  asked: number;
  seconds: number;
  /** The pack is too short to fill two pages honestly; `sourceCap` is the line count it supports. */
  cappedBySource: boolean;
  sourceCap: number;
  /** Lines added by the practice layer (derived from lines already on the sheet). */
  practice?: number;
  /** Still short of the target after everything honest was tried. */
  short?: boolean;
  /** Lines the claims check refused (issue #17). */
  unverified?: number;
  /** Every call failed because the provider refused us (spend cap, quota). NOT 'the pack is empty'. */
  providerBusy?: boolean;
}

/** How many lines of THIS sheet's size the pack can honestly support. */
function sourceCapOf(content: SheetContent, packText: string): number {
  const lines = [...content.formulas, ...content.concepts, ...content.questions, ...(content.tables ?? [])];
  const avgChars = lines.length ? Math.max(60, lines.reduce((n, it) => n + textOf(it).length, 0) / lines.length) : 150;
  return Math.floor((packText.length * SOURCE_RATIO) / avgChars);
}

async function deepenOnce(
  content: SheetContent,
  opts: { packText?: string; files?: string[]; examFormat?: ExamFormat; target?: number; client?: LLMClient } = {},
): Promise<DeepenResult> {
  const t0 = Date.now();
  const before = visibleLines(content);
  const none = (): DeepenResult => ({ ops: [], dropped: [], proposed: content, before, after: before, asked: 0, seconds: 0, cappedBySource: false, sourceCap: 0 });
  if (!opts.packText || content.topics.length === 0) return none();
  // How many lines of THIS sheet's size the pack can honestly support.
  const sourceCap = sourceCapOf(content, opts.packText);
  const wanted = opts.target ?? FILL_TARGET;
  const target = Math.min(wanted, sourceCap);
  const cappedBySource = sourceCap < wanted;
  const deficit = target - before;
  if (deficit < MIN_DEFICIT) return { ...none(), cappedBySource, sourceCap };
  const packStems = new Set(stems(opts.packText));

  const client = opts.client ?? defaultGeminiClient();
  const knownFiles = (opts.files ?? []).map((f) => f.toLowerCase().replace(/\.[a-z0-9]{1,5}$/, ""));
  // Ask for well over the gap: measured, ~1 line in 3 repeats an existing one or fails a check.
  // What survives beyond the gap is kept as surplus for the fitter, up to KEEP_OVER.
  const perTopic = Math.min(MAX_PER_TOPIC, Math.ceil((deficit * 1.6) / content.topics.length));
  const seen = new Set<string>();
  // Per section: a question may ask about a term the sheet defines; two questions may not ask the same thing.
  const about: Record<string, Set<string>[]> = {};
  for (const sec of FILL_SECTIONS) about[sec] = ((content[sec] ?? []) as unknown[]).map((it) => aboutOf(sec, it));
  for (const s of [...FILL_SECTIONS, "traps"] as const) for (const it of (content[s] ?? []) as unknown[]) seen.add(keyOf(s, it));

  // Two calls per topic, in parallel: the wait is bound by how long one call writes, and a call
  // that writes 15 lines finishes in half the time of one that writes 30.
  const qShare = opts.examFormat === "multiple-choice" || opts.examFormat === "true-false" ? 0.65 : 0.5;
  const halves = [
    { want: "questions", n: Math.max(2, Math.round(perTopic * qShare)), rule: `Write ONLY questions ("section":"questions"). ${formatRule(opts.examFormat)}` },
    { want: "facts", n: Math.max(2, Math.round(perTopic * (1 - qShare))), rule: `Write ONLY concepts, plus a formula where the pack states one and at most one table. No questions.` },
  ] as const;
  const perTopicCalls = content.topics.flatMap((topic) => halves.map(async (half) => {
    const has: string[] = [];
    for (const s of FILL_SECTIONS) {
      for (const it of (content[s] ?? []) as { topic?: string }[]) if (it.topic === topic.name) has.push(`- [${s}] ${labelOf(s, it)}`);
    }
    const user = [
      `TOPIC: "${topic.name}" — ${topic.why}`,
      half.rule,
      `WRITE ${half.n} NEW LINES for this topic.`,
      `THE TOPIC ALREADY HAS (do not repeat or rephrase these):\n${has.join("\n") || "(nothing yet)"}`,
      `PACK TEXT:\n${opts.packText!.slice(0, 300_000)}`,
    ].join("\n\n──────\n\n");
    const res = await Promise.race([
      client.generate({ system: SYSTEM, user, model: GEMINI_FLASH, temperature: 0.3, maxOutputTokens: 8192 }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("deepen timed out")), 45_000)),
    ]);
    const cleaned = res.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    const parsed = JSON.parse(cleaned) as { items?: { section?: string; item?: unknown }[] };
    return { topic: topic.name, items: Array.isArray(parsed.items) ? parsed.items : [] };
  }));

  const settled = await Promise.allSettled(perTopicCalls);
  const ops: EditOp[] = [];
  const byTopic = new Map<string, EditOp[]>();
  const dropped: string[] = [];
  let capacityFailures = 0;
  for (const r of settled) {
    if (r.status === "rejected") {
      if (isProviderCapacityError(r.reason)) capacityFailures++;
      dropped.push(`a topic could not be deepened (${r.reason instanceof Error ? r.reason.message.slice(0, 60) : "error"})`);
      continue;
    }
    for (const raw of r.value.items) {
      const section = raw.section as FillSection;
      if (!FILL_SECTIONS.includes(section)) { dropped.push(`unknown section "${String(raw.section)}"`); continue; }
      const holder = { [section]: [raw.item] } as Record<string, unknown[]>;
      normalizeDraft(holder);
      let ok = ITEM_SCHEMA[section].safeParse(holder[section][0]);
      if (!ok.success) {
        // A stray key ("options" on an MCQ) is not a reason to lose the line.
        const extra = ok.error.issues.flatMap((i) => (i.code === "unrecognized_keys" ? (i as { keys: string[] }).keys : []));
        if (extra.length && holder[section][0] && typeof holder[section][0] === "object") {
          for (const k of extra) delete (holder[section][0] as Record<string, unknown>)[k];
          ok = ITEM_SCHEMA[section].safeParse(holder[section][0]);
        }
      }
      if (!ok.success) { dropped.push(`${section}: ${ok.error.issues[0]?.message ?? "invalid"} — "${labelOf(section, raw.item)}"`); continue; }
      const item = ok.data as { topic?: string; src: string };
      if (item.topic !== r.value.topic) { dropped.push(`${section}: wrong topic "${item.topic}"`); continue; }
      if (knownFiles.length && !knownFiles.some((f) => item.src.toLowerCase().includes(f))) {
        dropped.push(`${section}: cites "${item.src.slice(0, 50)}", not one of the files — "${labelOf(section, item)}"`);
        continue;
      }
      const ungrounded = groundingProblem(section, item, packStems) ?? numberProblem(section, item, opts.packText!);
      if (ungrounded) { dropped.push(`${section}: ${ungrounded} — "${labelOf(section, item)}"`); continue; }
      const key = keyOf(section, item);
      if (seen.has(key)) { dropped.push(`${section}: repeats "${labelOf(section, item)}"`); continue; }
      const mine = aboutOf(section, item);
      if (about[section].some((other) => paraphrases(mine, other))) { dropped.push(`${section}: says again "${labelOf(section, item)}"`); continue; }
      about[section].push(mine);
      seen.add(key);
      const list = byTopic.get(r.value.topic) ?? [];
      list.push({ op: "add", section, item, after: labelOf(section, item) });
      byTopic.set(r.value.topic, list);
    }
  }
  // Take turns across topics up to the gap plus a little surplus for the fitter to trim against,
  // so a talkative topic cannot crowd out the others.
  const keep = Math.ceil(deficit * KEEP_OVER);
  for (let round = 0; ops.length < keep; round++) {
    let took = false;
    for (const list of byTopic.values()) {
      if (round < list.length && ops.length < keep) { ops.push(list[round]); took = true; }
    }
    if (!took) break;
  }
  if (!ops.length) return { ...none(), dropped, cappedBySource, sourceCap, providerBusy: capacityFailures > 0, asked: perTopic * content.topics.length, seconds: (Date.now() - t0) / 1000 };

  // New lines go after the generated ones: the first draft's ranking stays on top.
  const proposed = applyOps({ ...content, figures: undefined }, ops);
  const whole = safeParseSheetContent(proposed);
  if (!whole.success) return { ...none(), dropped: [...dropped, `the deepened sheet failed the contract: ${whole.error.issues[0]?.message}`] };
  const next = { ...whole.data, figures: content.figures };
  return { ops, dropped, proposed: next, before, after: visibleLines(next), cappedBySource, sourceCap, asked: perTopic * content.topics.length, seconds: (Date.now() - t0) / 1000 };
}

type DeepenOpts = {
  packText?: string; files?: string[]; examFormat?: ExamFormat; target?: number; client?: LLMClient;
  /** Traps are showing, so they take space too. */
  countTraps?: boolean;
  /** Skip the claims check (evals, offline tests). Never in production. */
  verify?: false;
};

/**
 * PRACTICE LAYER — for when the files have no more facts to give (a thin pack).
 * Practice questions and traps need no new source: each one TESTS a line the sheet already has.
 * So they are held to a stricter rule than new facts — the line must carry the exact citation of
 * the line it tests, and its words and numbers must come from that topic's lines or the pack.
 * Capped at PRACTICE_RATIO questions per fact line: past that it is a quiz, not a reference sheet.
 */
const PRACTICE_RATIO = 2;
const PRACTICE_SYSTEM = `
You write PRACTICE for one topic of a student's exam reference sheet. You are given the topic's
LINES (the facts already on the sheet, each with its citation) and how many items to write.

Write questions an examiner could ask about THESE LINES, and a few traps (a tempting wrong belief
about one of these lines, and why it is wrong). Use ONLY facts stated in the lines: the answer to
every question must be readable off one of them. Never bring in outside knowledge, never invent a
number. Do not repeat a question or trap the topic already has; come at the fact from a new angle
(apply it, compare two lines, reverse it, give the consequence).

ITEM SHAPES (no extra keys):
- questions: {"topic","q","a","kind":"MCQ|short|problem|T/F","conf":"med"}   "a" is required
- traps:     {"topic","text"}   text names the falsity: "X is FALSE because Y"
"topic" is exactly the topic name given. Do NOT write a citation: give "line", the number of the
LINE the item tests, and the sheet attaches that line's citation itself.

Return JSON exactly: {"items":[{"section":"questions","line":3,"item":{…}}]}
`.trim();

async function practiceRound(
  content: SheetContent,
  opts: DeepenOpts,
  want: number,
): Promise<{ ops: EditOp[]; dropped: string[] }> {
  const client = opts.client ?? defaultGeminiClient();
  const dropped: string[] = [];
  const byTopic = new Map<string, EditOp[]>();
  const about: Record<"questions" | "traps", Set<string>[]> = {
    questions: content.questions.map((q) => aboutOf("questions", q)),
    traps: content.traps.map((t) => aboutOf("traps", t)),
  };
  const topics = content.topics
    .map((topic) => {
      const facts = [...content.concepts, ...content.formulas, ...(content.tables ?? [])].filter((it) => it.topic === topic.name);
      return { topic, facts };
    })
    .filter((t) => t.facts.length > 0);
  if (!topics.length) return { ops: [], dropped };
  const perTopic = Math.min(24, Math.ceil((want * 1.5) / topics.length));

  const settled = await Promise.allSettled(topics.map(async ({ topic, facts }) => {
    const lines = facts.map((f, i) => `[${i + 1}] ${textOf(f).replace(/\s+/g, " ").trim()}`).join("\n");
    const has = content.questions.filter((q) => q.topic === topic.name).map((q) => `- ${q.q}`).join("\n");
    const user = [
      `TOPIC: "${topic.name}"`,
      `${formatRule(opts.examFormat)} About one item in five should be a trap.`,
      `WRITE ${perTopic} ITEMS.`,
      `LINES (the only facts you may use):\n${lines}`,
      `QUESTIONS THE TOPIC ALREADY HAS (do not repeat):\n${has || "(none)"}`,
    ].join("\n\n──────\n\n");
    const res = await Promise.race([
      client.generate({ system: PRACTICE_SYSTEM, user, model: GEMINI_FLASH, temperature: 0.4, maxOutputTokens: 8192 }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("practice timed out")), 45_000)),
    ]);
    const cleaned = res.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    const parsed = JSON.parse(cleaned) as { items?: { section?: string; line?: number; item?: unknown }[] };
    return { topic: topic.name, facts, items: Array.isArray(parsed.items) ? parsed.items : [] };
  }));

  for (const r of settled) {
    if (r.status === "rejected") { dropped.push("a topic got no practice (call failed)"); continue; }
    const factsText = r.value.facts.map((f) => textOf(f)).join(" ");
    const allowed = new Set(stems(`${factsText} ${opts.packText ?? ""}`));
    for (const raw of r.value.items) {
      const section = raw.section as "questions" | "traps";
      if (section !== "questions" && section !== "traps") { dropped.push(`practice: unknown section "${String(raw.section)}"`); continue; }
      // The citation is not the model's to write: it is the citation of the line being tested.
      const tested = typeof raw.line === "number" ? r.value.facts[raw.line - 1] : undefined;
      if (!tested || !raw.item || typeof raw.item !== "object") { dropped.push(`practice ${section}: does not say which line it tests`); continue; }
      const holder = { [section]: [{ ...(raw.item as Record<string, unknown>), src: tested.src, topic: r.value.topic }] } as Record<string, unknown[]>;
      normalizeDraft(holder);
      const first = holder[section][0];
      if (first && typeof first === "object") delete (first as Record<string, unknown>).options;
      const ok = ITEM_SCHEMA[section].safeParse(first);
      if (!ok.success) { dropped.push(`practice ${section}: ${ok.error.issues[0]?.message ?? "invalid"}`); continue; }
      const item = ok.data as { topic?: string; src: string };
      const words = stems(textOf(item) + " " + String((item as { text?: string }).text ?? ""));
      if (words.length >= 5 && words.filter((w) => allowed.has(w)).length / words.length < 0.6) { dropped.push(`practice ${section}: goes beyond the sheet's lines — "${labelOf(section, item)}"`); continue; }
      const num = numberProblem(section, { ...item, a: `${(item as { a?: string }).a ?? ""} ${(item as { text?: string }).text ?? ""}` }, `${factsText} ${opts.packText ?? ""}`);
      if (num) { dropped.push(`practice ${section}: ${num} — "${labelOf(section, item)}"`); continue; }
      const mine = aboutOf(section, item);
      if (about[section].some((o) => paraphrases(mine, o))) { dropped.push(`practice ${section}: says again "${labelOf(section, item)}"`); continue; }
      about[section].push(mine);
      const list = byTopic.get(r.value.topic) ?? [];
      list.push({ op: "add", section, item, after: labelOf(section, item) });
      byTopic.set(r.value.topic, list);
    }
  }
  const ops: EditOp[] = [];
  const keep = Math.ceil(want * KEEP_OVER);
  for (let round = 0; ops.length < keep; round++) {
    let took = false;
    for (const list of byTopic.values()) if (round < list.length && ops.length < keep) { ops.push(list[round]); took = true; }
    if (!took) break;
  }
  return { ops, dropped };
}

/**
 * The ladder, cheapest and most certain first: new FACTS from the pack (up to MAX_ROUNDS, capped
 * by the source), then PRACTICE derived from the sheet's own lines. Each step runs only if the
 * one before left a real gap.
 */
export async function deepenPool(content: SheetContent, opts: DeepenOpts = {}): Promise<DeepenResult> {
  const t0 = Date.now();
  const count = (c: SheetContent) => visibleLines(c) + (opts.countTraps ? c.traps.length : 0);
  const wanted = opts.target ?? FILL_TARGET;
  const practiceRoom = (c: SheetContent) =>
    (c.concepts.length + c.formulas.length + (c.tables ?? []).length) * PRACTICE_RATIO - c.questions.length;

  // The pack's length is known before any call: when it cannot carry the sheet to the target,
  // practice (which needs only the lines already here) starts NOW, beside the facts round,
  // instead of a minute later. Measured: 62 s in sequence.
  const cap = opts.packText ? sourceCapOf(content, opts.packText) : 0;
  const foreseen = wanted - Math.max(count(content), Math.min(wanted, cap));
  const early = foreseen >= MIN_DEFICIT && practiceRoom(content) >= 4
    ? practiceRound(content, opts, Math.min(foreseen, practiceRoom(content))).catch(() => null)
    : null;

  let total = await deepenOnce(content, opts);
  for (let round = 1; round < MAX_ROUNDS; round++) {
    const target = Math.min(wanted, total.sourceCap || Infinity);
    if (!total.ops.length || target - total.after < MIN_DEFICIT) break;
    const next = await deepenOnce(total.proposed, opts);
    if (!next.ops.length) break;
    total = {
      ...next,
      ops: [...total.ops, ...next.ops],
      dropped: [...total.dropped, ...next.dropped],
      before: total.before,
      asked: total.asked + next.asked,
    };
  }

  const addPractice = (p: { ops: EditOp[]; dropped: string[] } | null) => {
    if (!p?.ops.length) return;
    // Practice written beside the facts round has not seen its questions: check again here.
    const seen = total.proposed.questions.map((q) => aboutOf("questions", q));
    const fresh = p.ops.filter((o) => {
      if (o.section !== "questions") return true;
      const mine = aboutOf("questions", o.item);
      if (seen.some((other) => paraphrases(mine, other))) return false;
      seen.push(mine);
      return true;
    });
    const room = Math.max(0, Math.ceil((wanted - count(total.proposed)) * KEEP_OVER));
    const kept = fresh.slice(0, room);
    if (!kept.length) return;
    const whole = safeParseSheetContent(applyOps({ ...total.proposed, figures: undefined }, kept));
    if (!whole.success) return;
    total = {
      ...total,
      ops: [...total.ops, ...kept],
      dropped: [...total.dropped, ...p.dropped],
      proposed: { ...whole.data, figures: content.figures },
      practice: (total.practice ?? 0) + kept.length,
    };
  };
  addPractice(early ? await early : null);

  // Not foreseen (the facts round simply came back short): practice now.
  const gap = wanted - count(total.proposed);
  if (!early && gap >= MIN_DEFICIT && practiceRoom(total.proposed) >= 4) {
    addPractice(await practiceRound(total.proposed, opts, Math.min(gap, practiceRoom(total.proposed))).catch(() => null));
  }

  // ── The claims check: nothing goes on the sheet that the source does not say (issue #17) ──
  // Measured on scripts/evals/claims: 100% recall on 28 planted wrong lines, ~9% false alarms.
  // A dropped true line costs a little space; a confident wrong one costs the student marks.
  if (opts.verify !== false && total.ops.length && opts.packText) {
    // What is actually being ASSERTED. A question asserts nothing; its ANSWER does, and the
    // question is context for it. A trap asserts its correction. Checking the whole item as one
    // string made the checker refuse 99 of 112 good lines: it was reading interrogatives as claims.
    const claimText = (o: EditOp): string => {
      const it = (o.item ?? {}) as Record<string, string | undefined>;
      const clean = (t: string) => t.replace(/\s+/g, " ").trim();
      if (o.section === "questions") return clean(`${it.a ?? ""}${it.q ? ` (in answer to: ${it.q})` : ""}`);
      if (o.section === "traps") return clean(it.text ?? "");
      if (o.section === "concepts") return clean(`${it.term ?? ""}: ${it.def ?? ""}`);
      if (o.section === "formulas") return clean(`${it.name ?? ""}: ${it.formula ?? ""}. ${it.when ?? ""}`);
      return clean(textOf(o.item));
    };
    // Index every op, so the verdicts map back to exactly the ops that were checked.
    const checked = total.ops.map((op, index) => ({ op, index })).filter(({ op }) => op.op === "add" && claimText(op).length > 30);
    if (checked.length) {
      try {
        // Practice lines were built on the sheet's own lines: those count as source here.
        const sheetLines = [...content.concepts, ...content.formulas, ...content.questions, ...(content.tables ?? [])]
          .map((it) => textOf(it)).join("\n");
        const verdicts = await checkClaims(
          checked.map(({ index }, i) => ({ id: String(i), text: claimText(total.ops[index]) })),
          `${opts.packText}\n\n===== ALREADY ON THE SHEET =====\n${sheetLines}`,
          { client: opts.client },
        );
        const refusedIndexes = new Set(
          verdicts.filter((v) => !v.supported).map((v) => checked[Number(v.id)]?.index).filter((i): i is number => i !== undefined),
        );
        if (refusedIndexes.size) {
          const practiceFrom = total.ops.length - (total.practice ?? 0); // practice ops were appended last
          const survivors = total.ops.filter((_, i) => !refusedIndexes.has(i));
          const whole = safeParseSheetContent(applyOps({ ...content, figures: undefined }, survivors));
          if (whole.success) {
            total = {
              ...total,
              ops: survivors,
              proposed: { ...whole.data, figures: content.figures },
              practice: (total.practice ?? 0) - [...refusedIndexes].filter((i) => i >= practiceFrom).length,
              unverified: refusedIndexes.size,
              dropped: [
                ...total.dropped,
                ...verdicts.filter((v) => !v.supported).map((v) =>
                  `claims check: ${v.note.slice(0, 90)} — "${claimText(total.ops[checked[Number(v.id)].index]).slice(0, 70)}"`),
              ],
            };
          }
        }
      } catch {
        /* the checker itself failed: the per-line guards still stand */
      }
    }
  }

  total.before = count(content);
  total.after = count(total.proposed);
  total.short = wanted - total.after >= MIN_DEFICIT;
  total.seconds = (Date.now() - t0) / 1000;
  return total;
}
