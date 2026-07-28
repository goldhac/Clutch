/**
 * relevance.ts — Layers A + B of the relevance & fit system.
 * Spec: docs/09-RELEVANCE-AND-FIT.md (v2, post-review).
 *
 * PURE + DETERMINISTIC. No DOM, no React, no randomness. Same
 * (content, density, ctx, budget) ⇒ byte-identical output. Unit-tested
 * by scripts/check-relevance.ts.
 *
 *   A  scoreItem()        evidence + authority + corroboration + controls
 *   A½ redundancyDemote() MMR-lite: halve near-duplicate scores
 *   B  compose()          floors → deficit water-fill → best-fit remainder
 *      estimateHeight()   approximate; Layer C (FitController) is the truth
 *
 * The composer never removes items to "make it fit" — it ORDERS the pool
 * and marks an estimated cutoff + a bench. The client renders all of it
 * (bench pre-hidden) and Layer C measures the real cutoff.
 */
import type {
  Concept,
  Formula,
  Question,
  SheetContent,
  SheetTable,
  Topic,
  Trap,
} from "@/contract/sheet-content";
import type { Density } from "./Sheet";

/* ──────────────────────────────────────────────────────────────────────
 * Public types
 * ────────────────────────────────────────────────────────────────────── */

export type Section = "formulas" | "concepts" | "traps" | "questions" | "topics" | "tables";

export type ExamType = "conceptual" | "problem-solving" | "mixed";
export type PriorityMode = "formulas" | "concepts" | "balanced";

export interface ScoreCtx {
  /** Uploaded files with their tags — drives source-authority scoring. */
  files: { name: string; tag: string }[];
  examType: ExamType;
  priority: PriorityMode;
}

export const EMPTY_CTX: ScoreCtx = { files: [], examType: "mixed", priority: "balanced" };

/** A ranked item paired with its section + derived score + estimated height. */
export interface Scored<T = unknown> {
  item: T;
  section: Section;
  /** Stable identity: "{section}:{emissionIndex}" — used by data-fit-id. */
  id: string;
  score: number;
  /** Estimated block height in pt (approximate; Layer C corrects). */
  estHeight: number;
}

export interface ComposeResult {
  /** Placed items in render order (best mix first). */
  placed: Scored[];
  /** Bench items past the estimated cutoff — rendered but pre-hidden, for gap-fill. */
  bench: Scored[];
  /** Everything below the bench — not rendered. */
  overflow: Scored[];
  /** Per-section placed counts (for header/footer + tests). */
  counts: Record<Section, number>;
  /** Estimated used height / budget, for the underfill projection. */
  estFill: number;
}

/* ──────────────────────────────────────────────────────────────────────
 * Density geometry (mirrors src/renderer/density.css). pt = 1/72 in.
 * ────────────────────────────────────────────────────────────────────── */

const PAGE = { w: 841.7, h: 595.4, padX: 10, padY: 11.5 }; // A4 landscape @72dpi

interface Geometry {
  cols: number;
  gap: number; // pt
  bodyPt: number;
  monoPt: number;
  lineHeight: number;
}

// MAX = 7 columns — the proven hand-built weapon (cheatsheet-maxdensity.html
// ran 7-col @ 5.7pt on Letter landscape; A4 landscape is WIDER, so 7 fits
// with room to spare). The `cols5` flag forces a narrower 5-col variant for
// comparison; the standard FRONT is the full 7.
const GEO: Record<Density, Geometry> = {
  max: { cols: 7, gap: 3, bodyPt: 5.7, monoPt: 4.7, lineHeight: 1.13 },
  balanced: { cols: 3, gap: 11, bodyPt: 8, monoPt: 7, lineHeight: 1.32 },
  essentials: { cols: 2, gap: 16, bodyPt: 9, monoPt: 8, lineHeight: 1.42 },
};

/** Column width in pt for a density. */
export function colWidth(density: Density, cols5 = false): number {
  const g = GEO[density];
  const cols = density === "max" && cols5 ? 5 : g.cols;
  const usable = PAGE.w - PAGE.padX * 2;
  return (usable - g.gap * (cols - 1)) / cols;
}

/** Default whole-page column budget (pt) when the client hasn't measured
 * fixtures yet. The real render passes a measured budget to compose(). */
export function defaultBudget(density: Density, cols5 = false): number {
  const g = GEO[density];
  const cols = density === "max" && cols5 ? 5 : g.cols;
  // usable height minus rough fixtures (header ~22, footer ~12, strips ~40)
  const usableH = PAGE.h - PAGE.padY * 2;
  const fixtures = 74;
  const colH = usableH - fixtures;
  return colH * cols * 0.97; // 0.97 safety margin (spec §3.1)
}

/* Chars-per-line for a field, given font + effective width. Advance ≈
 * 0.52em sans / 0.62em mono at small sizes (spec §3.4). */
function charsPerLine(widthPt: number, pt: number, mono: boolean): number {
  const advance = mono ? 0.62 : 0.52;
  return Math.max(6, widthPt / (advance * pt));
}

/* ──────────────────────────────────────────────────────────────────────
 * Layer A — scoring
 * ────────────────────────────────────────────────────────────────────── */

interface Ranked {
  conf?: "high" | "med" | "low";
  verified?: boolean;
  src: string;
}

const EXAM_RX = /\b(exam|final|midterm|quiz|prior)\b/i;
const REVIEW_RX = /\breview\b/i;
const HW_RX = /\b(hw\d?|homework)\b/i;

const TAG_AUTHORITY: Record<string, number> = {
  past_exam: 22,
  review: 14,
  homework: 10,
  formula_sheet: 8,
  slides: 6,
  notes: 4,
};

/** Evidence base by type (spec §2.1) — DEFINED for every type. */
function evidenceBase(section: Section, r: Ranked): number {
  if (section === "traps") {
    // Named falsity = inherently high-trust; verified if exam-cited.
    return r.verified || EXAM_RX.test(r.src) ? 50 : 35;
  }
  if (section === "tables") return 20;
  if (r.verified) return 50;
  if (r.conf === "high") return 35;
  if (r.conf === "med") return 20;
  if (r.conf === "low") return 8;
  return 8; // missing conf on a ranked type — lowest (shouldn't happen)
}

/** Source authority (spec §2.2): best matched file tag, else keyword. */
function authority(src: string, files: ScoreCtx["files"]): number {
  const s = src.toLowerCase();
  let best = 0;
  for (const f of files) {
    const stem = f.name.toLowerCase().replace(/\.[a-z0-9]+$/i, "");
    if (s.includes(f.name.toLowerCase()) || (stem.length >= 3 && s.includes(stem))) {
      best = Math.max(best, TAG_AUTHORITY[f.tag] ?? 0);
    }
  }
  if (best > 0) return best;
  if (EXAM_RX.test(src)) return 18;
  if (REVIEW_RX.test(src)) return 12;
  if (HW_RX.test(src)) return 8;
  return 0;
}

/** Corroboration (spec §2.3): distinct cited sources. */
function corroboration(src: string): number {
  const parts = src.split(/[;·]/).map((p) => p.trim()).filter(Boolean);
  const distinct = new Set(parts.map((p) => p.toLowerCase())).size;
  return Math.min(12, Math.max(0, distinct - 1) * 6);
}

/** Within-section item multiplier for question kinds (spec §2.4). */
function itemMultiplier(section: Section, item: unknown, ctx: ScoreCtx): number {
  if (section !== "questions") return 1;
  const kind = (item as Question).kind;
  if (ctx.examType === "problem-solving") return kind === "problem" ? 1.15 : 0.95;
  if (ctx.examType === "conceptual") return kind === "MCQ" || kind === "T/F" ? 1.1 : 0.95;
  return 1;
}

/**
 * Score one item. Deterministic. Non-ranked types (traps/tables) route
 * through evidenceBase by section, so they never fall to the conf=8 default.
 */
export function scoreItem(item: unknown, section: Section, ctx: ScoreCtx): number {
  const r = item as Ranked;
  const src = r.src ?? "";
  const base = evidenceBase(section, r);
  const raw = base + authority(src, ctx.files) + corroboration(src);
  return raw * itemMultiplier(section, item, ctx);
}

/* ── A½ — MMR-lite redundancy demotion (spec §0.5) ─────────────────── */

const STOP = new Set([
  "the", "a", "an", "of", "to", "in", "is", "and", "or", "for", "on", "with",
  "when", "not", "it", "as", "by", "at", "be", "this", "that", "if",
]);

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1 && !STOP.has(t)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Text of an item for redundancy comparison, by section. */
function itemText(item: unknown, section: Section): string {
  const o = item as Record<string, string>;
  switch (section) {
    case "formulas": return `${o.name} ${o.formula} ${o.when}`;
    case "concepts": return `${o.term} ${o.def}`;
    case "traps": return o.text;
    case "questions": return o.q;
    case "topics": return `${o.name} ${o.why}`;
    case "tables": return o.title;
  }
}

/** Halve the score of items that near-duplicate a higher-scored kept one. */
function redundancyDemote(scored: Scored[], section: Section): Scored[] {
  const kept: Set<string>[] = [];
  return [...scored]
    .sort((a, b) => b.score - a.score)
    .map((s) => {
      const tk = tokens(itemText(s.item, section));
      const dup = kept.some((k) => jaccard(tk, k) > 0.6);
      kept.push(tk);
      return dup ? { ...s, score: s.score * 0.5 } : s;
    });
}

/* ──────────────────────────────────────────────────────────────────────
 * Height estimation (spec §3.4) — approximate; Layer C corrects.
 * ────────────────────────────────────────────────────────────────────── */

const CHROME: Record<Section, number> = {
  // fixed padding/margin/title-row per block, in pt (approx, per-item).
  formulas: 10,
  concepts: 3,
  traps: 4,
  questions: 4,
  topics: 3,
  tables: 8,
};

function fieldLines(text: string, w: number, pt: number, mono: boolean): number {
  if (!text) return 0;
  // Multiline pre/code: each \n line ceils separately (the pre-wrap fix).
  return text
    .split("\n")
    .reduce((acc, line) => acc + Math.max(1, Math.ceil(line.length / charsPerLine(w, pt, mono))), 0);
}

export function estimateHeight(item: unknown, section: Section, density: Density, cols5 = false): number {
  const g = GEO[density];
  const w = colWidth(density, cols5);
  const lh = g.bodyPt * g.lineHeight;
  const o = item as Record<string, string>;
  let lines = 0;

  switch (section) {
    case "formulas": {
      lines += fieldLines(o.name, w, g.bodyPt, false);
      lines += fieldLines(o.formula, w, g.monoPt, true); // mono, multiline
      lines += fieldLines(o.vars, w, g.bodyPt, false);
      lines += fieldLines(o.when, w, g.bodyPt, false);
      if (o.trap) lines += fieldLines(o.trap, w, g.bodyPt, false);
      if (o.ex) lines += fieldLines(o.ex, w, g.bodyPt, false);
      break;
    }
    case "concepts": {
      // def cell gets ~65% of column (term+meta reserve the rest).
      lines += fieldLines(o.def, w * 0.65, g.bodyPt, false);
      lines = Math.max(lines, 1);
      break;
    }
    case "traps":
      lines += fieldLines(o.text, w, g.bodyPt, false);
      break;
    case "questions":
      lines += fieldLines(o.q, w, g.bodyPt, false);
      break;
    case "topics":
      lines += fieldLines(o.name, w, g.bodyPt, false) + fieldLines(o.why, w, g.bodyPt, false);
      break;
    case "tables": {
      const t = item as unknown as SheetTable;
      lines += (t.rows?.length ?? 0) + 1; // rows + header
      break;
    }
  }
  return lines * lh + CHROME[section];
}

/* ──────────────────────────────────────────────────────────────────────
 * Layer B — composition
 * ────────────────────────────────────────────────────────────────────── */

const SECTION_ORDER: Section[] = ["formulas", "concepts", "traps", "questions", "topics", "tables"];

/** Base section shares of the budget, per density (spec §3.2). */
const BASE_SHARES: Record<Density, Record<Section, number>> = {
  max:        { formulas: 0.40, concepts: 0.15, traps: 0.14, questions: 0.15, topics: 0.08, tables: 0.08 },
  balanced:   { formulas: 0.40, concepts: 0.16, traps: 0.16, questions: 0.16, topics: 0.06, tables: 0.06 },
  essentials: { formulas: 0.46, concepts: 0.18, traps: 0.22, questions: 0.14, topics: 0.00, tables: 0.00 },
};

/** Control share deltas in percentage points (spec §2.4). */
function shareDeltas(ctx: ScoreCtx): Record<Section, number> {
  const d: Record<Section, number> = { formulas: 0, concepts: 0, traps: 0, questions: 0, topics: 0, tables: 0 };
  if (ctx.examType === "problem-solving") { d.formulas += 8; d.concepts -= 6; d.questions += 3; d.tables -= 2; }
  if (ctx.examType === "conceptual") { d.formulas -= 8; d.concepts += 8; d.traps += 3; }
  if (ctx.priority === "formulas") { d.formulas += 5; d.concepts -= 5; }
  if (ctx.priority === "concepts") { d.formulas -= 5; d.concepts += 5; }
  return d;
}

/** Final scalar targets (pt of budget) per section (spec §3.2/3.3). */
function targets(density: Density, ctx: ScoreCtx, budget: number): Record<Section, number> {
  const base = BASE_SHARES[density];
  const delta = shareDeltas(ctx);
  const shares: Record<Section, number> = { ...base };
  for (const s of SECTION_ORDER) {
    // Only apply a delta if the base share is > 0 (0 = excluded section).
    shares[s] = base[s] > 0 ? Math.max(0, base[s] + delta[s] / 100) : 0;
  }
  const sum = SECTION_ORDER.reduce((a, s) => a + shares[s], 0) || 1;
  const t: Record<Section, number> = { formulas: 0, concepts: 0, traps: 0, questions: 0, topics: 0, tables: 0 };
  for (const s of SECTION_ORDER) t[s] = (shares[s] / sum) * budget;
  return t;
}

const FLOORS: Partial<Record<Section, number>> = { formulas: 3, traps: 2, concepts: 2, questions: 2 };

/** Score + estimate every item, grouped by section, redundancy-demoted, sorted. */
function scoreAll(content: SheetContent, density: Density, ctx: ScoreCtx, cols5: boolean): Record<Section, Scored[]> {
  const mk = <T,>(arr: T[], section: Section): Scored[] =>
    redundancyDemote(
      arr.map((item, i) => ({
        item,
        section,
        id: `${section}:${i}`,
        score: scoreItem(item, section, ctx),
        estHeight: estimateHeight(item, section, density, cols5),
      })),
      section,
    ).sort((a, b) => b.score - a.score || cmpId(a.id, b.id));

  return {
    formulas: mk<Formula>(content.formulas, "formulas"),
    concepts: mk<Concept>(content.concepts, "concepts"),
    traps: mk<Trap>(content.traps, "traps"),
    questions: mk<Question>(content.questions, "questions"),
    topics: mk<Topic>(content.topics, "topics"),
    tables: mk<SheetTable>(content.tables ?? [], "tables"),
  };
}

/** Stable id comparator (emission index) for tie-breaks. */
function cmpId(a: string, b: string): number {
  const ia = Number(a.split(":")[1]);
  const ib = Number(b.split(":")[1]);
  return ia - ib;
}

/**
 * Compose the sheet for a density. Deterministic. Returns placed / bench /
 * overflow with per-section counts. `budget` is the measured whole-page
 * column budget (pt); pass defaultBudget() before the client measures.
 */
export function compose(
  content: SheetContent,
  density: Density,
  ctx: ScoreCtx = EMPTY_CTX,
  budget: number = defaultBudget(density),
  cols5 = false,
): ComposeResult {
  const pools = scoreAll(content, density, ctx, cols5);
  const tgt = targets(density, ctx, budget);

  // Sections with target 0 are excluded from water-fill + remainder,
  // UNLESS we project underfill (< 90%) — then they re-enter (spec §3.3).
  const active = SECTION_ORDER.filter((s) => tgt[s] > 0);

  const cursor: Record<Section, number> = { formulas: 0, concepts: 0, traps: 0, questions: 0, topics: 0, tables: 0 };
  const allocated: Record<Section, number> = { formulas: 0, concepts: 0, traps: 0, questions: 0, topics: 0, tables: 0 };
  const placed: Scored[] = [];
  let used = 0;

  const place = (s: Section) => {
    const it = pools[s][cursor[s]];
    cursor[s]++;
    placed.push(it);
    allocated[s] += it.estHeight;
    used += it.estHeight;
    return it;
  };

  // 1. Floors first (highest-scored of each, if present).
  for (const s of SECTION_ORDER) {
    const floor = FLOORS[s] ?? 0;
    for (let i = 0; i < floor && cursor[s] < pools[s].length; i++) {
      if (used + pools[s][cursor[s]].estHeight > budget) break;
      place(s);
    }
  }

  // 2. Deficit water-fill over active sections.
  for (;;) {
    // pick active section with lowest allocated/target that has an item that fits
    let pick: Section | null = null;
    let bestRatio = Infinity;
    for (const s of active) {
      if (cursor[s] >= pools[s].length) continue;
      if (used + pools[s][cursor[s]].estHeight > budget) continue;
      const ratio = allocated[s] / tgt[s];
      if (ratio < bestRatio - 1e-9 || (Math.abs(ratio - bestRatio) < 1e-9 && (pick === null || SECTION_ORDER.indexOf(s) < SECTION_ORDER.indexOf(pick)))) {
        bestRatio = ratio;
        pick = s;
      }
    }
    if (!pick) break;
    place(pick);
  }

  // 3. Remainder pass: highest-scored unplaced that fits, any active
  //    section; share-0 sections re-enter only if projected underfill.
  const projectedUnderfill = used < budget * 0.9;
  const remainderSections = projectedUnderfill ? SECTION_ORDER : active;
  const remainderPool: Scored[] = [];
  for (const s of remainderSections) remainderPool.push(...pools[s].slice(cursor[s]));
  remainderPool.sort((a, b) => b.score - a.score || SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section) || cmpId(a.id, b.id));
  const remainderIds = new Set<string>();
  for (const it of remainderPool) {
    if (used + it.estHeight <= budget) {
      placed.push(it);
      cursor[it.section]++;
      allocated[it.section] += it.estHeight;
      used += it.estHeight;
      remainderIds.add(it.id);
    }
  }

  // Bench = next items past the cutoff (for Layer C gap-fill), ~8 items.
  const placedIds = new Set(placed.map((p) => p.id));
  const rest: Scored[] = [];
  for (const s of SECTION_ORDER) for (const it of pools[s]) if (!placedIds.has(it.id)) rest.push(it);
  rest.sort((a, b) => b.score - a.score || SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section) || cmpId(a.id, b.id));
  const bench = rest.slice(0, 8);
  const overflow = rest.slice(8);

  const counts: Record<Section, number> = { formulas: 0, concepts: 0, traps: 0, questions: 0, topics: 0, tables: 0 };
  for (const p of placed) counts[p.section]++;

  return { placed, bench, overflow, counts, estFill: used / budget };
}

/* ──────────────────────────────────────────────────────────────────────
 * Front/back split — the R6 prototype (docs/09 §7).
 * FRONT = the dense weapon (MAX, optionally ×5). BACK = Balanced (the
 * decided standard): composed from the pool MINUS the front's items.
 * Estimated cutoffs for now; Layer C (FitController) refines later.
 * ────────────────────────────────────────────────────────────────────── */

/** Rebuild a SheetContent containing only the items whose ids are in `ids`
 * (emission order preserved per section — the renderer flows sections in
 * fixed order anyway). */
function materialize(content: SheetContent, ids: Set<string>): SheetContent {
  const keep = <T,>(arr: T[], section: Section): T[] =>
    arr.filter((_, i) => ids.has(`${section}:${i}`));
  return {
    ...content,
    topics: keep(content.topics, "topics"),
    formulas: keep(content.formulas, "formulas"),
    concepts: keep(content.concepts, "concepts"),
    traps: keep(content.traps, "traps"),
    questions: keep(content.questions, "questions"),
    tables: content.tables ? keep(content.tables, "tables") : undefined,
  };
}

export interface FrontBack {
  front: SheetContent;
  back: SheetContent;
  frontCompose: ComposeResult;
  backCompose: ComposeResult;
}

/**
 * Split a pool into FRONT (max — full 7-col weapon) + BACK (balanced,
 * composed from the remainder). Deterministic. Page 2's input is the
 * pool minus page 1's placed set — the docs/09 §7 data flow with the
 * estimated cutoff. `cols5=false` → the standard 7-col FRONT; pass true
 * only for the narrow 5-col comparison variant.
 */
export function splitFrontBack(
  content: SheetContent,
  ctx: ScoreCtx = EMPTY_CTX,
  cols5 = false,
): FrontBack {
  // The 7-col MAX estimate runs optimistic — narrow columns wrap taller
  // than estimateHeight() predicts, so the client FitController trims ~20%
  // of the estimated placement. Split the front CONSERVATIVELY (0.8×) so
  // its materialized set ≈ what actually renders, and the true remainder
  // (the rest) flows to the back instead of being trimmed into the void.
  const FRONT_FIT_FACTOR = 0.8;
  const frontCompose = compose(
    content, "max", ctx, defaultBudget("max", cols5) * FRONT_FIT_FACTOR, cols5,
  );
  const frontIds = new Set(frontCompose.placed.map((p) => p.id));
  const front = materialize(content, frontIds);

  // Remainder pool = everything NOT placed on the front.
  const remainder: SheetContent = {
    ...content,
    topics: content.topics.filter((_, i) => !frontIds.has(`topics:${i}`)),
    formulas: content.formulas.filter((_, i) => !frontIds.has(`formulas:${i}`)),
    concepts: content.concepts.filter((_, i) => !frontIds.has(`concepts:${i}`)),
    traps: content.traps.filter((_, i) => !frontIds.has(`traps:${i}`)),
    questions: content.questions.filter((_, i) => !frontIds.has(`questions:${i}`)),
    tables: content.tables?.filter((_, i) => !frontIds.has(`tables:${i}`)),
    // verified patterns lead the FRONT only; back gets a plain header.
    verifiedPatterns: undefined,
  };
  // BACK = the FULL remainder (not just backCompose.placed). The back
  // page's own FittedSheet re-composes at Balanced and its FitController
  // gap-fills to the boundary — so it must receive every leftover item to
  // pull from, or it underfills whenever the estimate was conservative.
  const backCompose = compose(remainder, "balanced", ctx, defaultBudget("balanced"));
  const back = { ...remainder, title: `${content.title} — BACK` };

  return { front, back, frontCompose, backCompose };
}
