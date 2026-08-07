"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { SheetContent } from "@/contract/sheet-content";
import type { Concept, Formula, Question, SheetTable, Trap } from "@/contract/sheet-content";
import { Citation, ConfDot, InlineText, VerifiedStar } from "@/components/trust";
import { filterForDensity } from "./tiers";
import { ExamFormatStrip } from "./ExamFormatStrip";
import { VerifiedPatternsBlock } from "./VerifiedPatternsBlock";
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
import { assignTopics } from "./topics-color";

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

  // Topic color assignment — the KEY the reader scans. Each block is tinted
  // by its topic; the legend maps color → topic name.
  const topicAssign = useMemo(() => assignTopics(content), [content]);

  // Compose once (pure/deterministic). The estimated budget just needs to
  // land near the page — the measure pass corrects the rest.
  const { placed, bench } = useMemo(
    () => compose(content, density, ctx, defaultBudget(density, cols5), cols5),
    [content, density, ctx, cols5],
  );

  // TOPIC-MAJOR grouping (the proven layout): the sheet reads as colored
  // topic blocks, each holding that topic's formulas → tables → concepts →
  // traps → questions. Front and back get the SAME texture — one
  // continuous generation, not "formula page then leftovers page".
  // Bench items start hidden; the fit pass reveals them into slack.
  const topicGroups = useMemo(() => {
    const n = Math.max(1, content.topics.length);
    const groups: Record<Section, Scored[]>[] = Array.from({ length: n }, () => ({
      formulas: [], concepts: [], traps: [], questions: [], topics: [], tables: [],
    }));
    const put = (it: Scored) => {
      const ti = Math.min(topicAssign.topicIndexOf(it.id), n - 1);
      groups[ti][it.section].push(it);
    };
    for (const p of placed) put(p);
    for (const b of bench) put(b);
    for (const g of groups)
      for (const s of DISPLAY_ORDER) g[s].sort((a, b) => b.score - a.score);
    return groups;
  }, [placed, bench, content.topics.length, topicAssign]);

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

    // A block is CLIPPED if its right edge extends past the visible column
    // box — the exact metric the PDF route's verifier uses, so the two
    // never disagree. (Multicol overflow is horizontal: extra content
    // spills into a clipped 8th column.) byId maps id→node for O(1) toggles.
    const TOL = 1.5;
    const isClipped = (el: HTMLElement, right: number) =>
      el.style.display !== "none" && el.getBoundingClientRect().right > right + TOL;

    const run = () => {
      const all = nodes();
      const byId = new Map<string, HTMLElement>();
      const scoreOf = new Map<string, number>();
      for (const el of all) {
        byId.set(el.dataset.fitId!, el);
        scoreOf.set(el.dataset.fitId!, Number(el.dataset.score));
      }

      // Start from the composed baseline: placed visible, bench hidden.
      const visible = new Set<string>();
      for (const el of all) {
        const id = el.dataset.fitId!;
        const hidden = benchIds.has(id);
        el.style.display = hidden ? "none" : "";
        if (!hidden) visible.add(id);
      }

      const colsRight = () => cols.getBoundingClientRect().right;
      const anyClipped = () => {
        const right = colsRight();
        for (const id of visible) if (isClipped(byId.get(id)!, right)) return true;
        return false;
      };

      // Phase A — trim. While any visible block spills past the columns,
      // hide the lowest-scored visible item (mix-aware, not a flow suffix)
      // and re-measure. Converges because each step removes real height.
      let guard = all.length + 4;
      while (visible.size > 0 && guard-- > 0 && anyClipped()) {
        let victim: string | null = null;
        let low = Infinity;
        for (const id of visible) {
          const sc = scoreOf.get(id) ?? 0;
          if (sc < low) { low = sc; victim = id; }
        }
        if (!victim) break;
        visible.delete(victim);
        byId.get(victim)!.style.display = "none";
      }

      // Phase B — gap-fill. Reveal bench items (highest-scored first) into
      // any slack; revert the first that clips and stop (monotone tail).
      // Check GLOBAL clipping after each reveal, not just the added item's
      // edge: bench items sit mid-flow (end of their section), so revealing
      // one pushes LATER sections rightward and could clip them.
      const benchSorted = [...benchIds]
        .filter((id) => scoreOf.has(id))
        .sort((a, b) => (scoreOf.get(b) ?? 0) - (scoreOf.get(a) ?? 0));
      // Don't STOP at the first item that doesn't fit — skip it and keep
      // trying smaller ones. The page must always end up full (the locked
      // product rule: never dead space), and a single tall block early in
      // the bench would otherwise leave the last column half empty.
      for (const id of benchSorted) {
        if (visible.has(id)) continue;
        const el = byId.get(id);
        if (!el) continue;
        el.style.display = "";
        visible.add(id);
        if (anyClipped()) {
          el.style.display = "none";
          visible.delete(id);
        }
      }

      // Commit: leave each node's inline display MATCHING the decision
      // (hidden→none, visible→"") so the DOM stays consistent with the
      // React state we set — no all-visible flash between effect and paint.
      const hidden = new Set<string>();
      for (const el of all) {
        const id = el.dataset.fitId!;
        const isHidden = !visible.has(id);
        el.style.display = isHidden ? "none" : "";
        if (isHidden) hidden.add(id);
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
  }, [topicGroups, benchIds, density, cols5]);

  const hide = (id: string) => hiddenIds.has(id);
  const groupVisible = (g: Record<Section, Scored[]>) =>
    DISPLAY_ORDER.some((s) => g[s].some((it) => !hide(it.id)));

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
          {/* Topic key lives in the full-width COLOR KEY strip below the
           * header (the proven sheet's layout); here we keep only the
           * compact confidence note. */}
          <div className="sheet-conf-note">
            <span className="lg"><i className="dot conf-high" /> high</span>
            <span className="lg"><i className="dot conf-med" /> med</span>
            <span className="lg"><i className="dot conf-low" /> low</span>
            <span className="lg"><i className="vstar">★</i> verified</span>
          </div>
        </div>
      </header>

      <div className={colsClass}>
        <ExamFormatStrip format={content.examFormat} />
        {/* COLOR KEY strip — the proven sheet's top line: chip per topic. */}
        {topicAssign.legend.length > 0 && (
          <div className="color-key-strip">
            <span className="cklabel">COLOR KEY:</span>
            {topicAssign.legend
              .filter((t) => t.count > 0)
              .map((t, i) => (
                <span key={i} className={`ckchip ${t.colorClass}`} title={t.full}>
                  {t.name}
                </span>
              ))}
          </div>
        )}
        <VerifiedPatternsBlock patterns={content.verifiedPatterns} />
        {/* No "On this sheet" TOC — the COLOR KEY strip above already maps
         * color → topic, and the banners label each block. The TOC just
         * consumed a column for content the reader already has. */}


        {topicGroups.map((g, ti) => {
          if (!groupVisible(g)) return null;
          const tk = topicAssign.topicColor(ti);
          const topicName = content.topics[ti]?.name;
          return (
            <section key={ti} className={`topic-group ${tk}`}>
              {topicName && <h2 className="topic-banner">{topicName}</h2>}
              {(["formulas", "tables", "concepts"] as const).map((section) =>
                g[section].map((it) => (
                  <FitLeaf key={it.id} it={it} hidden={hide(it.id)} className={tk}>
                    {renderItem(section, it)}
                  </FitLeaf>
                )),
              )}
              {/* Traps keep their orange "what NOT to do" styling inside the
               * topic block; questions render as the qq drill list. */}
              {g.traps.map((it) => (
                <FitLeaf key={it.id} it={it} hidden={hide(it.id)}>
                  {renderItem("traps", it)}
                </FitLeaf>
              ))}
              {g.questions.some((it) => !hide(it.id)) && (
                <ul className="qa-list">
                  {g.questions.map((it) => (
                    <FitLeaf key={it.id} it={it} hidden={hide(it.id)} as="li" className={`qq ${tk}`}>
                      <QuestionBox question={it.item as Question} bare />
                    </FitLeaf>
                  ))}
                </ul>
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
      <div className="def">
        <InlineText text={c.def} />
        {c.ex && (
          <span className="cex"> Example: <InlineText text={c.ex} /></span>
        )}
      </div>
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
