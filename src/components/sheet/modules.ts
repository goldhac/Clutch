/**
 * modules.ts — the sheet as a set of topics the student controls (#20).
 *
 * Every control here is FREE and INSTANT: it only ever shows or hides what the engine already
 * wrote. Nothing in this file calls a model, and nothing here can spend a credit. That is what
 * lets the whole tier ship without a paywall or a rate limit — and it is why the work is a filter,
 * not a regeneration.
 *
 * Two of the three controls are pure content filters and run BEFORE composition, so an unticked
 * topic behaves exactly as though it had never been on the sheet and the fitter refills the space
 * from the rest. The third — "less" — needs the scores composition produces, so it runs after.
 *
 * The rule that outranks all of them: a line the student wrote is PINNED. `less` will not take it,
 * and (in FittedSheet) neither will the fitter when space runs out. They put it there on purpose.
 */
import type { SheetContent } from "@/contract/sheet-content";

/** The sections a topic can show. Mirrors the sheet's own display order. */
export const MODULE_SECTIONS = ["formulas", "tables", "concepts", "traps", "questions"] as const;
export type ModuleSection = (typeof MODULE_SECTIONS)[number];

/** What the student has done to one topic. Absent entry = untouched: on, untrimmed, all sections. */
export interface TopicModule {
  /** Unticked — off the sheet, its space to the rest. */
  off?: true;
  /** How many of this topic's lowest-ranked lines to drop. Never takes a student's own line. */
  trim?: number;
  /** Sections to show in this topic. Absent = all of them. */
  sections?: ModuleSection[];
}

/** Keyed by `topics[].name`, which is the same key items carry in `topic`. */
export type ModuleState = Record<string, TopicModule>;

/**
 * "Less" stops here rather than at zero. A topic reduced to nothing is not a thinner topic, it is
 * an unticked one — and two controls that do the same thing at their extremes is how an interface
 * starts lying about what it does. Below this the UI offers "remove" instead.
 */
export const MIN_TOPIC_LINES = 3;

/** An item the student wrote or edited. Never trimmed, never starred (see the contract). */
const isMine = (item: unknown): boolean =>
  !!item && typeof item === "object" && (item as { mine?: true }).mine === true;

const topicOf = (item: unknown): string | undefined =>
  item && typeof item === "object" ? (item as { topic?: string }).topic : undefined;

/**
 * Apply the structural half: unticked topics and per-topic section mix.
 *
 * Pure, and returns a new SheetContent so the caller can compose it exactly as it would compose a
 * generated one. Notes follow their topic, because a note pinned to a chapter that is not on the
 * sheet has nowhere to be.
 */
export function applyModules(content: SheetContent, modules: ModuleState | undefined): SheetContent {
  if (!modules || !Object.keys(modules).length) return content;

  const off = new Set(Object.entries(modules).filter(([, m]) => m.off).map(([name]) => name));
  const sectionsFor = (topic: string | undefined): ModuleSection[] | undefined =>
    topic ? modules[topic]?.sections : undefined;

  /** An item survives when its topic is on AND its section is in that topic's mix. */
  const keep = (section: ModuleSection) => (item: unknown): boolean => {
    const t = topicOf(item);
    if (t && off.has(t)) return false;
    const allowed = sectionsFor(t);
    return !allowed || allowed.includes(section);
  };

  return {
    ...content,
    topics: content.topics.filter((t) => !off.has(t.name)),
    formulas: content.formulas.filter(keep("formulas")),
    concepts: content.concepts.filter(keep("concepts")),
    traps: content.traps.filter(keep("traps")),
    questions: content.questions.filter(keep("questions")),
    tables: content.tables?.filter(keep("tables")),
    notes: content.notes?.filter((n) => !n.topic || !off.has(n.topic)),
  };
}

/**
 * Apply "less": drop the N lowest-scored lines of each trimmed topic.
 *
 * Runs on the composed, scored items rather than on content, because "lowest-ranked" only means
 * something after ranking. Returns the ids to remove — the caller drops them from BOTH placed and
 * bench, or the fitter's gap-fill would quietly put them back and "less" would appear not to work.
 *
 * Three things it will not do: take a student's own line, take a topic below MIN_TOPIC_LINES, or
 * touch a topic the student has not trimmed.
 */
export function trimmedIds<T extends { id: string; score: number }>(
  items: T[],
  modules: ModuleState | undefined,
  topicNameOf: (id: string) => string | undefined,
  itemById: (id: string) => unknown,
): Set<string> {
  const out = new Set<string>();
  if (!modules) return out;

  for (const [name, mod] of Object.entries(modules)) {
    const want = mod.trim ?? 0;
    if (want <= 0 || mod.off) continue;

    const mine = items.filter((it) => topicNameOf(it.id) === name);
    // Ascending: the weakest go first.
    const takeable = mine
      .filter((it) => !isMine(itemById(it.id)))
      .sort((a, b) => a.score - b.score);

    // Never below the floor — count what would be LEFT, student lines included.
    const canTake = Math.max(0, Math.min(want, mine.length - MIN_TOPIC_LINES));
    for (let i = 0; i < canTake && i < takeable.length; i++) out.add(takeable[i].id);
  }
  return out;
}

/** How far "less" can still go on a topic — 0 means the control becomes "remove". */
export function trimRoom(lineCount: number, alreadyTrimmed = 0): number {
  return Math.max(0, lineCount - alreadyTrimmed - MIN_TOPIC_LINES);
}

/* ──────────────────────────────────────────────────────────────────────
 * Editing a line in place (#20)
 * ────────────────────────────────────────────────────────────────────── */

/** The sections whose lines a student may edit. Tables and traps have their own shapes. */
export type EditableSection = "concepts" | "questions" | "formulas";

/**
 * A line's identity, derived from what it SAYS rather than where it sits.
 *
 * `data-fit-id` is `"{section}:{index}"`, and that index points into the array the fitter was
 * composed from — which is the sheet AFTER unticked topics, section mix and density filtering have
 * all rearranged it. Editing by that index would reliably change the wrong line.
 *
 * So identity is the item's own primary text, normalised. It survives every filter between the
 * stored sheet and the rendered one, and it fails SAFE: if nothing matches, the edit is refused
 * rather than applied to a neighbour.
 */
export function editKey(item: unknown, section: string): string | undefined {
  if (!item || typeof item !== "object") return undefined;
  const o = item as Record<string, unknown>;
  const primary =
    section === "concepts" ? o.term :
    section === "questions" ? o.q :
    section === "formulas" ? o.name :
    undefined;
  if (typeof primary !== "string" || !primary.trim()) return undefined;
  return `${section}|${primary.trim().slice(0, 120).toLowerCase()}`;
}

/** The two fields a student edits, per section — the claim and its support. */
export function editFields(item: unknown, section: string): { a: string; b: string; labels: [string, string] } | null {
  const o = (item ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  if (section === "concepts") return { a: str(o.term), b: str(o.def), labels: ["Term", "What it means"] };
  if (section === "questions") return { a: str(o.q), b: str(o.a), labels: ["Question", "Answer"] };
  if (section === "formulas") return { a: str(o.name), b: str(o.formula), labels: ["Name", "Formula"] };
  return null;
}

/**
 * Write an edit back into the sheet.
 *
 * The edited line becomes the student's: it reads `you`, it is pinned, and it loses the verified
 * star — we checked the sentence that used to be there, not this one. `src` is deliberately KEPT
 * as a provenance trail of where the line started; `mine` is what the renderer and fitter read.
 *
 * Returns the content unchanged when nothing matches, so a stale key can never edit a neighbour.
 */
export function applyEdit<T extends { concepts: unknown[]; questions: unknown[]; formulas: unknown[] }>(
  content: T,
  key: string,
  next: { a: string; b: string },
): T {
  const section = key.split("|")[0] as EditableSection;
  const list = content[section] as unknown[] | undefined;
  if (!Array.isArray(list)) return content;

  const ix = list.findIndex((it) => editKey(it, section) === key);
  if (ix < 0) return content;

  const old = list[ix] as Record<string, unknown>;
  const fields =
    section === "concepts" ? { term: next.a, def: next.b } :
    section === "questions" ? { q: next.a, a: next.b } :
    { name: next.a, formula: next.b };

  const edited: Record<string, unknown> = { ...old, ...fields, mine: true as const };
  // The star said "Clutch checked this against your files". It no longer applies to these words.
  delete edited.verified;
  // "high" was earned by evidence for the old wording; drop it rather than carry it over.
  if (edited.conf === "high") edited.conf = "med";

  const copy = [...list];
  copy[ix] = edited;
  return { ...content, [section]: copy };
}

/**
 * Take a line off the sheet entirely.
 *
 * Only ever reached for a line the student wrote — Clutch's own lines come off by unticking their
 * topic or trimming it, both of which are reversible with one click. Deleting is not, so the UI puts
 * a modal in front of it and this function stays dumb: match by key, or change nothing.
 */
export function removeLine<T extends { concepts: unknown[]; questions: unknown[]; formulas: unknown[] }>(
  content: T,
  key: string,
): T {
  const section = key.split("|")[0] as EditableSection;
  const list = content[section] as unknown[] | undefined;
  if (!Array.isArray(list)) return content;
  const next = list.filter((it) => editKey(it, section) !== key);
  return next.length === list.length ? content : { ...content, [section]: next };
}
