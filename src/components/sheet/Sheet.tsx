import type { SheetContent } from "@/contract/sheet-content";
import { ExamFormatStrip } from "./ExamFormatStrip";
import { VerifiedPatternsBlock } from "./VerifiedPatternsBlock";
import { TopicsOverview } from "./TopicsOverview";
import { FormulaBlock } from "./FormulaBlock";
import { CompareTable } from "./CompareTable";
import { ConceptsTable } from "./ConceptsTable";
import { TrapsSection } from "./TrapCallout";
import { QuestionsSection } from "./QuestionBox";

/**
 * Density modes — three renders of the same ranked content, one per
 * moment in the final 48h:
 *   max         — the exam-room weapon (all tiers, ~5 col, edge-to-edge)
 *   balanced    — the day-before desk sheet (core+high, ~3 col, annotatable)
 *   essentials  — the walk-to-the-exam glance card (core, ~2 col, big)
 *
 * (Renamed from minimal/standard in D4 — see docs/08.)
 */
export type Density = "essentials" | "balanced" | "max";

/** Legacy URL/param aliases → current names. Keeps old links working. */
export const DENSITY_ALIASES: Record<string, Density> = {
  minimal: "essentials",
  standard: "balanced",
  essentials: "essentials",
  balanced: "balanced",
  max: "max",
};

export function normalizeDensity(raw: string | null | undefined): Density {
  if (!raw) return "max";
  return DENSITY_ALIASES[raw.toLowerCase()] ?? "max";
}

export interface SheetProps {
  content: SheetContent;
  density: Density;
  /** Optional 5-column override for MAX (OutSpec §3 — never promise 7). */
  cols5?: boolean;
}

/**
 * Sheet — the hero artifact, in React.
 *
 * Composed of the 8 renderable blocks. Header elements (h1, exam
 * format, verified block) live INSIDE .cols and use column-span: all
 * so they span horizontally without a separate flex container —
 * matches the proven hand-built cheatsheet-maxdensity.html technique.
 *
 * The rendered HTML is server-safe: this component works in Next.js
 * server components (so the /sheet page + /api/pdf Playwright route
 * both get static markup with no client JS).
 *
 * Order rationale (mirrors the proven build):
 *   verifiedPatterns ▸ topics overview ▸ formulas (workhorse)
 *   ▸ tables (decision guides) ▸ concepts (memorize-cold)
 *   ▸ traps (what NOT to do) ▸ questions (drill set)
 */
export function Sheet({ content, density, cols5 = false }: SheetProps) {
  const colsClass = `cols${density === "max" && cols5 ? " cols-5" : ""}`;
  return (
    <div className={`sheet density-${density}`}>
      <div className={colsClass}>
        <h1 className="span-all">{content.title}</h1>
        <ExamFormatStrip format={content.examFormat} />
        <VerifiedPatternsBlock patterns={content.verifiedPatterns} />
        <TopicsOverview topics={content.topics} />

        {content.formulas.length > 0 && (
          <section className="formulas">
            <h2>Formulas</h2>
            {content.formulas.map((f, i) => (
              <FormulaBlock key={i} formula={f} />
            ))}
          </section>
        )}

        {content.tables?.map((t, i) => (
          <CompareTable key={i} table={t} />
        ))}

        <ConceptsTable concepts={content.concepts} />
        <TrapsSection traps={content.traps} />
        <QuestionsSection questions={content.questions} />
      </div>
    </div>
  );
}
