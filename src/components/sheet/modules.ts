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
