import type { SheetContent } from "@/contract/sheet-content";
import type { Density } from "./Sheet";

/**
 * The fill model — "keep adding ranked items until the page is full."
 *
 * We already have all the content, ranked. A density is a TYPE-SIZE
 * choice (max = small/5-col, balanced = medium/3-col, essentials =
 * big/2-col), not a different content set. For every density we:
 *   1. order each section by rank (verified/core → high → med → low),
 *      best items first so they lead the columns, and
 *   2. include ALL of it — the fixed A4 box (overflow: hidden) clips at
 *      the boundary, so a bigger type simply shows fewer items before
 *      the clip. Result: the page is ALWAYS full, never dead space,
 *      and what shows is always the highest-ranked.
 *
 * (Supersedes the earlier tier-REMOVAL approach, which shrank the pool
 * and left balanced/essentials underfilled.)
 *
 * The engine targets ~25% more content than fits MAX (OutSpec §3.1)
 * so even MAX overfills and clips — no underflow at any density.
 */
export type Tier = "core" | "high" | "med" | "low";

interface Ranked {
  conf?: "high" | "med" | "low";
  verified?: boolean;
}

export function tierOf(item: Ranked): Tier {
  if (item.verified) return "core";
  if (item.conf === "high") return "high";
  if (item.conf === "med") return "med";
  return "low";
}

const RANK: Record<Tier, number> = { core: 0, high: 1, med: 2, low: 3 };

/** Stable sort by rank — best (verified/core) first. */
function byRank<T extends Ranked>(items: T[]): T[] {
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => RANK[tierOf(a.item)] - RANK[tierOf(b.item)] || a.i - b.i)
    .map((x) => x.item);
}

/**
 * Order a SheetContent for a density. Everything is kept and rank-
 * ordered; the fixed page + clip fill the sheet. Essentials drops only
 * the space-hungry extras (the topics TOC and compare tables) that its
 * wide 2-col layout has no room for — the ranked formulas/concepts/
 * traps/questions still overfill and clip.
 */
export function filterForDensity(content: SheetContent, density: Density): SheetContent {
  const essentials = density === "essentials";
  return {
    ...content,
    topics: essentials ? [] : byRank(content.topics),
    formulas: byRank(content.formulas),
    concepts: byRank(content.concepts),
    questions: byRank(content.questions),
    // traps + verifiedPatterns + examFormat: always kept, order preserved.
    tables: essentials ? undefined : content.tables,
  };
}
