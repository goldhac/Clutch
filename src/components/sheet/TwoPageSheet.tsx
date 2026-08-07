"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  Concept,
  Formula,
  Question,
  SheetContent,
  SheetTable,
  Trap,
} from "@/contract/sheet-content";
import { Citation, ConfDot, InlineText, VerifiedStar } from "@/components/trust";
import { filterForDensity } from "./tiers";
import { ExamFormatStrip } from "./ExamFormatStrip";
import { VerifiedPatternsBlock } from "./VerifiedPatternsBlock";
import { FormulaBlock } from "./FormulaBlock";
import { TrapCallout } from "./TrapCallout";
import { QuestionBox } from "./QuestionBox";
import {
  compose,
  EMPTY_CTX,
  type ScoreCtx,
  type Scored,
  type Section,
} from "./relevance";
import { assignTopics } from "./topics-color";

/**
 * TwoPageSheet — the front/back standard, done the way that can't lose
 * items or leave dead space.
 *
 * The old approach split the pool BEFORE rendering, using estimated
 * budgets (with a hand-tuned 0.8 factor). Two chronic failures:
 *   1. items the front's FitController trimmed were part of the front's
 *      materialized content — so they never reached the back. LOST.
 *   2. when the estimate ran conservative the front under-filled and no
 *      bench was deep enough to close the gap. DEAD SPACE.
 *
 * This component renders BOTH pages in one document and fills them
 * SEQUENTIALLY by real measurement:
 *   page 1 gets the ENTIRE pool → measure → trim lowest-scored until it
 *   fits → re-add whatever still fits (skip-and-continue);
 *   page 2 gets EXACTLY page 1's hidden set → same fit.
 * The only items that don't appear are the true surplus past two full
 * pages. No estimates, no tuning constants, nothing to drift.
 *
 * `data-fit-done` is set on the wrapper only after BOTH pages settle —
 * the PDF route waits for it and prints the two pages in one pass.
 */

const DISPLAY_ORDER: Section[] = ["formulas", "tables", "concepts", "traps", "questions"];

export interface TwoPageSheetProps {
  content: SheetContent;
  ctx?: ScoreCtx;
  cols5?: boolean;
  debug?: boolean;
}

type Groups = Record<Section, Scored[]>[];

export function TwoPageSheet({
  content: raw,
  ctx = EMPTY_CTX,
  cols5 = false,
  debug = false,
}: TwoPageSheetProps) {
  const content = useMemo(() => filterForDensity(raw, "max"), [raw]);
  const topicAssign = useMemo(() => assignTopics(content), [content]);

  // Compose with an effectively infinite budget: we want the mix-aware
  // ORDER and scores for the whole pool — the pages themselves decide
  // how much fits, by measurement.
  const allItems = useMemo(() => {
    const r = compose(content, "max", ctx, 1e9, cols5);
    return [...r.placed, ...r.bench, ...r.overflow];
  }, [content, ctx, cols5]);

  // Topic-major grouping over the ENTIRE pool (both pages share it; each
  // page renders only its own subset so texture stays identical).
  const topicGroups: Groups = useMemo(() => {
    const n = Math.max(1, content.topics.length);
    const groups: Groups = Array.from({ length: n }, () => ({
      formulas: [], concepts: [], traps: [], questions: [], topics: [], tables: [],
    }));
    for (const it of allItems) {
      const ti = Math.min(topicAssign.topicIndexOf(it.id), n - 1);
      groups[ti][it.section].push(it);
    }
    for (const g of groups)
      for (const s of DISPLAY_ORDER) g[s].sort((a, b) => b.score - a.score);
    return groups;
  }, [allItems, content.topics.length, topicAssign]);

  const allIds = useMemo(() => new Set(allItems.map((i) => i.id)), [allItems]);

  const rootRef = useRef<HTMLDivElement>(null);
  // page1Ids = visible on page 1; page2Ids = visible on page 2.
  // Initial state: everything on page 1, page 2 empty — the effect
  // measures and rebalances.
  const [page1Ids, setPage1Ids] = useState<Set<string>>(allIds);
  const [page2Ids, setPage2Ids] = useState<Set<string>>(new Set());
  const [fitInfo, setFitInfo] = useState<{ p1: number; p2: number; dropped: number } | null>(null);

  useLayoutEffect(() => {
    setPage1Ids(allIds);
    setPage2Ids(new Set());
  }, [allIds]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const sheets = Array.from(root.querySelectorAll<HTMLElement>(".sheet"));
    if (sheets.length !== 2) return;

    const TOL = 1.5;

    /** Fit one page in place: given the leaves rendered inside it, show
     * `candidates` (score-ordered whole-pool order), trim/re-add by
     * measurement, and return the visible set. */
    const fitPage = (sheet: HTMLElement, candidates: Set<string>): Set<string> => {
      const cols = sheet.querySelector<HTMLElement>(".cols");
      if (!cols) return new Set();
      const leaves = Array.from(cols.querySelectorAll<HTMLElement>("[data-fit-id]"));
      const byId = new Map<string, HTMLElement>();
      const scoreOf = new Map<string, number>();
      for (const el of leaves) {
        byId.set(el.dataset.fitId!, el);
        scoreOf.set(el.dataset.fitId!, Number(el.dataset.score));
      }
      const visible = new Set<string>();
      for (const el of leaves) {
        const id = el.dataset.fitId!;
        const on = candidates.has(id);
        el.style.display = on ? "" : "none";
        if (on) visible.add(id);
      }
      // A topic group whose leaves are all hidden must not occupy space
      // (its banner would sit alone and shift the measurement) — sync
      // section visibility to its leaves before every measurement.
      const groups = Array.from(cols.querySelectorAll<HTMLElement>(".topic-group"));
      const syncGroups = () => {
        for (const gr of groups) {
          const any = Array.from(gr.querySelectorAll<HTMLElement>("[data-fit-id]")).some(
            (el) => el.style.display !== "none",
          );
          gr.style.display = any ? "" : "none";
        }
      };
      const colsRight = () => cols.getBoundingClientRect().right;
      const clipped = () => {
        syncGroups();
        const right = colsRight();
        for (const id of visible) {
          const el = byId.get(id)!;
          if (el.style.display !== "none" && el.getBoundingClientRect().right > right + TOL)
            return true;
        }
        return false;
      };
      // Trim lowest-scored until nothing clips.
      let guard = leaves.length + 8;
      while (visible.size > 0 && guard-- > 0 && clipped()) {
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
      // Re-add pass: anything still hidden (from candidates) that fits,
      // best-scored first, skip-and-continue.
      const hiddenSorted = [...candidates]
        .filter((id) => !visible.has(id) && byId.has(id))
        .sort((a, b) => (scoreOf.get(b) ?? 0) - (scoreOf.get(a) ?? 0));
      for (const id of hiddenSorted) {
        const el = byId.get(id)!;
        el.style.display = "";
        visible.add(id);
        if (clipped()) {
          el.style.display = "none";
          visible.delete(id);
        }
      }
      return visible;
    };

    const run = () => {
      // Page 1 fills from the WHOLE pool…
      const p1 = fitPage(sheets[0], allIds);
      // …page 2 fills from exactly what page 1 couldn't take.
      const rest = new Set([...allIds].filter((id) => !p1.has(id)));
      const p2 = fitPage(sheets[1], rest);

      setPage1Ids(p1);
      setPage2Ids(p2);
      setFitInfo({ p1: p1.size, p2: p2.size, dropped: allIds.size - p1.size - p2.size });
      root.setAttribute("data-fit-done", "1");
    };

    root.removeAttribute("data-fit-done");
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
  }, [allIds, topicGroups]);

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

  return (
    <div ref={rootRef} className="two-page">
      <SheetPage
        pageNo={1}
        title={content.title}
        content={content}
        groups={topicGroups}
        visible={page1Ids}
        topicAssign={topicAssign}
        totalRanked={totalRanked}
        verified={counts.verified}
        cols5={cols5}
      />
      <SheetPage
        pageNo={2}
        title={`${content.title} — BACK`}
        content={content}
        groups={topicGroups}
        visible={page2Ids}
        topicAssign={topicAssign}
        totalRanked={totalRanked}
        verified={counts.verified}
        cols5={cols5}
      />
      {debug && fitInfo && (
        <div className="print:hidden fixed left-3 bottom-3 z-50 rounded border border-green-300 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-800 shadow">
          ✓ front {fitInfo.p1} · back {fitInfo.p2} · surplus {fitInfo.dropped} · no clip
        </div>
      )}
    </div>
  );
}

function SheetPage({
  pageNo,
  title,
  content,
  groups,
  visible,
  topicAssign,
  totalRanked,
  verified,
  cols5,
}: {
  pageNo: 1 | 2;
  title: string;
  content: SheetContent;
  groups: Groups;
  visible: Set<string>;
  topicAssign: ReturnType<typeof assignTopics>;
  totalRanked: number;
  verified: number;
  cols5: boolean;
}) {
  const hide = (id: string) => !visible.has(id);
  const groupVisible = (g: Record<Section, Scored[]>) =>
    DISPLAY_ORDER.some((s) => g[s].some((it) => visible.has(it.id)));
  const colsClass = `cols${cols5 ? " cols-5" : ""}`;

  return (
    <div className="sheet density-max" data-page={pageNo}>
      <header className="sheet-head">
        <div className="sheet-head-main">
          <h1>{title}</h1>
          <div className="sheet-meta">
            {totalRanked} items ranked · {verified} verified · MAX
          </div>
        </div>
        <div className="sheet-legend">
          {topicAssign.legend.length > 0 && (
            <div className="topic-key">
              {topicAssign.legend
                .filter((t) => t.count > 0)
                .map((t, i) => (
                  <span key={i} className={`tkitem ${t.colorClass}`} title={t.full}>
                    <i className="tksw" />
                    <span className="tkname">{t.name}</span>
                  </span>
                ))}
            </div>
          )}
          <div className="sheet-conf-note">
            <span className="lg"><i className="dot conf-high" /> high</span>
            <span className="lg"><i className="dot conf-med" /> med</span>
            <span className="lg"><i className="dot conf-low" /> low</span>
            <span className="lg"><i className="vstar">★</i> verified</span>
          </div>
        </div>
      </header>

      <div className={colsClass}>
        {pageNo === 1 && <ExamFormatStrip format={content.examFormat} />}
        {pageNo === 1 && <VerifiedPatternsBlock patterns={content.verifiedPatterns} />}

        {groups.map((g, ti) => {
          const hasAny = DISPLAY_ORDER.some((s) => g[s].length > 0);
          if (!hasAny) return null;
          // The section (and its leaves) is ALWAYS in the DOM — the fit
          // pass measures by toggling styles, so unmounting by state would
          // make page 2's items invisible to measurement. Visibility is
          // style-driven; the fit pass syncs it live, this mirrors it.
          const shown = groupVisible(g);
          const tk = topicAssign.topicColor(ti);
          const topicName = content.topics[ti]?.name;
          return (
            <section
              key={ti}
              className={`topic-group ${tk}`}
              style={shown ? undefined : { display: "none" }}
            >
              {topicName && <h2 className="topic-banner">{topicName}</h2>}
              {(["formulas", "tables", "concepts"] as const).map((section) =>
                g[section].map((it) => (
                  <FitLeaf key={it.id} it={it} hidden={hide(it.id)} className={tk}>
                    {renderItem(section, it)}
                  </FitLeaf>
                )),
              )}
              {g.traps.map((it) => (
                <FitLeaf key={it.id} it={it} hidden={hide(it.id)}>
                  <TrapCallout trap={it.item as Trap} />
                </FitLeaf>
              ))}
              {g.questions.length > 0 && (
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
        {content.formulas.length} formulas · {content.concepts.length} concepts ·{" "}
        {content.traps.length} traps · {content.questions.length} questions ·{" "}
        {verified} verified · MAX · {pageNo === 1 ? "FRONT" : "BACK"}
      </footer>
    </div>
  );
}

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
    default:
      return null;
  }
}

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
