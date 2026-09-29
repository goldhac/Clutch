/**
 * FitLeaf — one measurable block on the sheet, and the attributes the fit pass reads.
 *
 * This lived twice, copied into FittedSheet and TwoPageSheet, differing by a single line. It is
 * also the component that carries `data-pinned` and `data-edit-key` — and the absence of those
 * from one copy is what produced two of the three duplication bugs on 2026-09-29: the fitter
 * happily trimmed a line the student had written, because the guard had only ever been added to
 * the view almost nobody sees.
 *
 * So there is one now. `data-est` is emitted always: TwoPageSheet's fit pass reads it, FittedSheet
 * ignores it, and an attribute one view ignores is far cheaper than a second copy of this file.
 */
import type { Scored } from "./relevance";
import { editKey } from "./modules";

/** A line the student wrote or edited (#20). The fitter may never trim it. */
export const isPinned = (it: { item?: unknown }): boolean =>
  (it.item as { mine?: true } | undefined)?.mine === true;

/** Identity for click-to-edit (#20): what the line SAYS, not where it sits. */
export const editKeyOf = (it: { item?: unknown; section?: string }): string | undefined =>
  editKey(it.item, it.section ?? "");

export function FitLeaf({
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
  const key = editKeyOf(it);
  return (
    <Tag
      data-fit-id={it.id}
      data-score={it.score}
      data-est={it.estHeight}
      {...(isPinned(it) ? { "data-pinned": "1" } : {})}
      {...(key ? { "data-edit-key": key } : {})}
      className={`fit-leaf${className ? ` ${className}` : ""}`}
      style={hidden ? { display: "none" } : undefined}
    >
      {children}
    </Tag>
  );
}
