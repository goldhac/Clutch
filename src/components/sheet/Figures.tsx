import type { SheetContent, SheetFigure } from "@/contract/sheet-content";
import { Citation } from "@/components/trust";

/**
 * Diagrams on the sheet (issue #15). The student chooses; a figure the student chose is
 * never the first thing the fitter trims (score far above any text item), so adding one
 * displaces the lowest-ranked lines instead.
 *
 * One column wide only: the sheet is a CSS multi-column layout, where an element either
 * sits in one column or spans all of them.
 */
export const FIGURE_SCORE = 100_000;
export const figureFitId = (f: SheetFigure) => `figures:${f.id}`;

/** Until the student chooses, place the single most important diagram — if one is central. */
export function defaultFigureIds(content: SheetContent): string[] {
  const top = (content.figures ?? []).find((f) => f.importance >= 5);
  return top ? [top.id] : [];
}

export function selectedFigures(content: SheetContent, chosen: string[] | undefined): SheetFigure[] {
  const ids = new Set(chosen ?? defaultFigureIds(content));
  return (content.figures ?? []).filter((f) => ids.has(f.id));
}

/** Index of the topic group a figure belongs in; the first group when it has no home. */
export function figureTopicIndex(f: SheetFigure, content: SheetContent): number {
  const i = f.topic ? content.topics.findIndex((t) => t.name === f.topic) : -1;
  return i >= 0 ? i : 0;
}

export function FigureLeaf({ figure: f, hidden, className }: { figure: SheetFigure; hidden: boolean; className?: string }) {
  return (
    <figure
      data-fit-id={figureFitId(f)}
      data-score={FIGURE_SCORE}
      className={`fit-leaf sheet-figure${className ? ` ${className}` : ""}`}
      style={hidden ? { display: "none" } : undefined}
    >
      {/* width/height give the browser the aspect ratio before the data-URL decodes, so the
          fitter measures the real height on its first pass. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={f.image} width={f.w} height={f.h} alt={f.what || f.caption} />
      <figcaption>
        {f.caption} <Citation src={f.src} />
      </figcaption>
    </figure>
  );
}
