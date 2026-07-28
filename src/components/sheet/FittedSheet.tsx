"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { SheetContent } from "@/contract/sheet-content";
import type { Concept, Formula, Question, SheetTable, Trap } from "@/contract/sheet-content";
import { Citation, ConfDot, InlineText, VerifiedStar } from "@/components/trust";
import { filterForDensity } from "./tiers";
import { ExamFormatStrip } from "./ExamFormatStrip";
import { VerifiedPatternsBlock } from "./VerifiedPatternsBlock";
import { TopicsOverview } from "./TopicsOverview";
import { FormulaBlock } from "./FormulaBlock";
import { TrapCallout } from "./TrapCallout";
import { QuestionBox } from "./QuestionBox";
import type { Density } from "./Sheet";
import {
  compose,
  defaultBudget,
  EMPTY_CTX,
  type ScoreCtx,
  type Scored,
  type Section,
} from "./relevance";

/**
 * FittedSheet — Layer C of the relevance & fit system (docs/09 §4).
 *
 * The server-safe <Sheet> clips at the page boundary via CSS overflow.
 * This client variant does better: it renders the composed pool
 * (placed + bench) and then MEASURES the real layout to
 *   (a) trim — hide the lowest-scored items if content overflows the
 *       visible columns, so nothing is ever clipped mid-block, and
 *   (b) gap-fill — reveal bench items (highest-scored first) into any
 *       leftover slack, so the page is always full.
 *
 * Visibility is React state (`hiddenIds`), not DOM mutation — the
 * measurement pass uses transient inline styles for trial only, then
 * commits the final set once (spec review requirement).
 *
 * Clip axis is HORIZONTAL: with `column-fill: auto` + fixed height +
 * `overflow: hidden`, extra content spills into columns beyond the
 * container width, so `scrollWidth > clientWidth` is the overflow
 * signal (spec §4 — the review's #1 correctness note).
 */

const DISPLAY_ORDER: Section[] = ["formulas", "tables", "concepts", "traps", "questions"];
const SECTION_HEAD: Partial<Record<Section, string>> = {
  formulas: "Formulas",
  concepts: "Memorize cold",
  traps: "Traps",
  questions: "Likely questions",
};

export interface FittedSheetProps {
  content: SheetContent;
  density: Density;
  cols5?: boolean;
  ctx?: ScoreCtx;
  /** Dev overlay badge (fit status). Off in production/print. */
  debug?: boolean;
}

export function FittedSheet({
  content: raw,
  density,
  cols5 = false,
  ctx = EMPTY_CTX,
  debug = false,
}: FittedSheetProps) {
  const content = useMemo(() => filterForDensity(raw, density), [raw, density]);

  // Compose once (pure/deterministic). The estimated budget just needs to
  // land near the page — the measure pass corrects the rest.
  const { placed, bench } = useMemo(
    () => compose(content, density, ctx, defaultBudget(density, cols5), cols5),
    [content, density, ctx, cols5],
  );

  // Group placed + bench by section, score-ordered within section. Bench
  // items start hidden; the fit pass reveals them into slack.
  const bySection = useMemo(() => {
    const g: Record<Section, Scored[]> = {
      formulas: [], concepts: [], traps: [], questions: [], topics: [], tables: [],
    };
    for (const p of placed) g[p.section].push(p);
    for (const b of bench) g[b.section].push(b);
    for (const s of DISPLAY_ORDER) g[s].sort((a, b) => b.score - a.score);
    return g;
  }, [placed, bench]);

  const benchIds = useMemo(() => new Set(bench.map((b) => b.id)), [bench]);

  const rootRef = useRef<HTMLDivElement>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(benchIds);
  const [fitInfo, setFitInfo] = useState<{ visible: number; total: number } | null>(null);

  // Reset visibility to the composed baseline whenever the pool changes,
  // so the measure pass starts from placed-visible / bench-hidden.
  useLayoutEffect(() => {
    setHiddenIds(new Set(benchIds));
  }, [benchIds]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const cols = root.querySelector<HTMLElement>(".cols");
    if (!cols) return;

    const nodes = () =>
      Array.from(cols.querySelectorAll<HTMLElement>("[data-fit-id]"));
    const overflowing = () => cols.scrollWidth > cols.clientWidth + 1.5;

    const run = () => {
      const all = nodes();
      const scoreOf = new Map<string, number>();
      for (const el of all) scoreOf.set(el.dataset.fitId!, Number(el.dataset.score));

      // Start from the composed baseline: placed visible, bench hidden.
      const visible = new Set<string>();
      for (const el of all) {
        const id = el.dataset.fitId!;
        const hidden = benchIds.has(id);
        el.style.display = hidden ? "none" : "";
        if (!hidden) visible.add(id);
      }

      // Phase A — trim. While the visible columns overflow, hide the
      // lowest-scored visible item (mix-aware, not a blind flow suffix).
      let guard = all.length + 4;
      while (overflowing() && visible.size > 0 && guard-- > 0) {
        let victim: string | null = null;
        let low = Infinity;
        for (const id of visible) {
          const sc = scoreOf.get(id) ?? 0;
          if (sc < low) { low = sc; victim = id; }
        }
        if (!victim) break;
        visible.delete(victim);
        const el = all.find((n) => n.dataset.fitId === victim);
        if (el) el.style.display = "none";
      }

      // Phase B — gap-fill. Reveal bench items (highest-scored first) into
      // any slack; revert the first that pushes a new (clipped) column.
      const benchSorted = [...benchIds]
        .filter((id) => scoreOf.has(id))
        .sort((a, b) => (scoreOf.get(b) ?? 0) - (scoreOf.get(a) ?? 0));
      for (const id of benchSorted) {
        if (visible.has(id)) continue;
        const el = all.find((n) => n.dataset.fitId === id);
        if (!el) continue;
        el.style.display = "";
        if (overflowing()) { el.style.display = "none"; break; }
        visible.add(id);
      }

      // Commit to React state; clear the transient inline styles so state
      // is the single source of truth.
      for (const el of all) el.style.display = "";
      const hidden = new Set<string>();
      for (const el of all) {
        const id = el.dataset.fitId!;
        if (!visible.has(id)) hidden.add(id);
      }
      setHiddenIds(hidden);
      setFitInfo({ visible: visible.size, total: all.length });
      root.setAttribute("data-fit-done", "1");
    };

    root.removeAttribute("data-fit-done");
    // Measure after layout + after fonts settle (metrics shift on load).
    const raf = requestAnimationFrame(run);
    let cancelled = false;
    if (typeof document !== "undefined" && "fonts" in document) {
      document.fonts.ready.then(() => { if (!cancelled) run(); });
    }
    const onResize = () => run();
    window.addEventListener("resize", onResize);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bySection, benchIds, density, cols5]);

  const hide = (id: string) => hiddenIds.has(id);
  const sectionVisible = (s: Section) =>
    bySection[s].some((it) => !hide(it.id));

  const counts = {
    formulas: content.formulas.length,
    concepts: content.concepts.length,
    traps: content.traps.length,
    questions: content.questions.length,
    verified: [
      ...content.topics, ...content.formulas, ...content.concepts, ...content.questions,
    ].filter((i) => i.verified).length,
  };
  const totalRanked =
    content.topics.length + counts.formulas + counts.concepts + counts.questions;

  const colsClass = `cols${density === "max" && cols5 ? " cols-5" : ""}`;

  return (
    <div ref={rootRef} className={`sheet density-${density}`}>
      <header className="sheet-head">
        <div className="sheet-head-main">
          <h1>{content.title}</h1>
          <div className="sheet-meta">
            {totalRanked} items ranked · {counts.verified} verified · {density.toUpperCase()}
          </div>
        </div>
        <div className="sheet-legend">
          <span className="lg"><i className="dot conf-high" /> high</span>
          <span className="lg"><i className="dot conf-med" /> med</span>
          <span className="lg"><i className="dot conf-low" /> low</span>
          <span className="lg"><i className="vstar">★</i> verified</span>
        </div>
      </header>

      <div className={colsClass}>
        <ExamFormatStrip format={content.examFormat} />
        <VerifiedPatternsBlock patterns={content.verifiedPatterns} />
        <TopicsOverview topics={content.topics} />

        {DISPLAY_ORDER.map((section) => {
          if (bySection[section].length === 0 || !sectionVisible(section)) return null;
          return (
            <section key={section} className={SECTION_CLASS[section]}>
              {SECTION_HEAD[section] && (
                <h2 className={SECTION_TINT[section]}>{SECTION_HEAD[section]}</h2>
              )}
              {section === "questions" ? (
                <ul className="qa-list">
                  {bySection.questions.map((it) => (
                    <FitLeaf key={it.id} it={it} hidden={hide(it.id)} as="li" className="qq">
                      <QuestionBox question={it.item as Question} bare />
                    </FitLeaf>
                  ))}
                </ul>
              ) : (
                bySection[section].map((it, i) => (
                  <FitLeaf
                    key={it.id}
                    it={it}
                    hidden={hide(it.id)}
                    className={section === "formulas" ? `tk-${i % 10}` : undefined}
                  >
                    {renderItem(section, it)}
                  </FitLeaf>
                ))
              )}
            </section>
          );
        })}
      </div>

      <footer className="sheet-foot">
        {counts.formulas} formulas · {counts.concepts} concepts · {counts.traps} traps ·{" "}
        {counts.questions} questions · {counts.verified} verified · {density.toUpperCase()}
      </footer>

      {debug && fitInfo && (
        <div className="print:hidden fixed left-3 bottom-3 z-50 rounded border border-green-300 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-800 shadow">
          ✓ fit: {fitInfo.visible}/{fitInfo.total} blocks shown · no clip
        </div>
      )}
    </div>
  );
}

const SECTION_CLASS: Record<Section, string> = {
  formulas: "formulas",
  tables: "tables",
  concepts: "concepts concepts-flow",
  traps: "traps",
  questions: "qa-section",
  topics: "topics",
};

/** Per-section header tint (design handoff: color-coded section bars,
 * not all-black). */
const SECTION_TINT: Partial<Record<Section, string>> = {
  formulas: "t-indigo",
  concepts: "t-teal",
  traps: "t-orange",
  questions: "t-purple",
};

/** One measurable, hideable leaf. break-inside:avoid keeps a block whole
 * (so clipping lands between blocks, never through one). */
function FitLeaf({
  it,
  hidden,
  as = "div",
  className,
  children,
}: {
  it: Scored;
  hidden: boolean;
  as?: "div" | "li";
  className?: string;
  children: React.ReactNode;
}) {
  const Tag = as;
  return (
    <Tag
      data-fit-id={it.id}
      data-score={it.score}
      className={`fit-leaf${className ? ` ${className}` : ""}`}
      style={hidden ? { display: "none" } : undefined}
    >
      {children}
    </Tag>
  );
}

function renderItem(section: Section, it: Scored) {
  switch (section) {
    case "formulas":
      return <FormulaBlock formula={it.item as Formula} />;
    case "tables":
      return <CompareTableInner table={it.item as SheetTable} />;
    case "concepts":
      return <ConceptRow concept={it.item as Concept} />;
    case "traps":
      return <TrapCallout trap={it.item as Trap} />;
    default:
      return null;
  }
}

/** A single concept as a row-block (term | def | meta) — replaces the
 * monolithic table so each concept is independently trimmable/fillable
 * while looking like the memorize-cold rows. */
function ConceptRow({ concept: c }: { concept: Concept }) {
  return (
    <div className="concept-row">
      <div className="term">
        <VerifiedStar verified={c.verified} />
        <strong><InlineText text={c.term} /></strong>
      </div>
      <div className="def"><InlineText text={c.def} /></div>
      <div className="meta">
        <ConfDot conf={c.conf} />
        <Citation src={c.src} />
      </div>
    </div>
  );
}

/** CompareTable body without its own <section>/no-break wrapper (the
 * FitLeaf owns break behavior now). */
function CompareTableInner({ table: t }: { table: SheetTable }) {
  return (
    <div className="compare-table">
      <h3><InlineText text={t.title} /></h3>
      <table>
        <thead>
          <tr>{t.cols.map((c, i) => <th key={i}><InlineText text={c} /></th>)}</tr>
        </thead>
        <tbody>
          {t.rows.map((row, ri) => (
            <tr key={ri}>{row.map((cell, ci) => <td key={ci}><InlineText text={cell} /></td>)}</tr>
          ))}
        </tbody>
      </table>
      <div className="src-line"><Citation src={t.src} /></div>
    </div>
  );
}
