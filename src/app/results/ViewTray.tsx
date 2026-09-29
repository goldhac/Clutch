"use client";

/**
 * ViewTray — how the sheet is displayed, in one place (editing-flow handoff §9).
 *
 * These five controls were loose in the dock, each with its own mono label, competing for room
 * with the controls that change what the sheet SAYS. They are a different kind of thing: none of
 * them adds or removes a fact, they only change how the facts are shown, and every one of them is
 * free and prints exactly as previewed. Grouping them says that.
 *
 * Each row carries one line of helper text, because the choice is not self-evident from two words
 * — "Priority" in particular is the control most likely to be misread as "delete the rest".
 */
import { Tray } from "@/components/ui";
import type { ScoreCtx, ViewOptions } from "@/components/sheet/relevance";

export interface ViewTrayProps {
  order: NonNullable<ScoreCtx["order"]>;
  view: ViewOptions;
  /** Present only when the pack had figures; the row opens the existing Diagrams tray. */
  figures?: { on: number; total: number; onOpen: () => void };
  onOrder: (next: NonNullable<ScoreCtx["order"]>) => void;
  onToggle: (key: "traps" | "tags") => void;
  onSources: (next: ViewOptions["sources"]) => void;
  onClose: () => void;
}

/** A segmented control: a trough with one lit item. Used for every row, so they read as one set. */
function Segmented<T extends string>({
  label,
  value,
  options,
  helper,
  onPick,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  helper: string;
  onPick: (v: T) => void;
}) {
  return (
    <div className="px-[10px] py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--on-band-muted)]">
          {label}
        </span>
        <span className="flex items-center rounded-[9px] bg-[var(--band-2)] p-[3px] shadow-[inset_0_0_0_1px_var(--band-line)]" role="group" aria-label={label}>
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={value === o.value}
              onClick={() => onPick(o.value)}
              className={
                "ctl tap inline-flex h-7 items-center rounded-[6px] px-3 text-[12.5px] font-semibold " +
                (value === o.value ? "bg-white text-[var(--band)]" : "text-[#cbcbd4] hover:text-white")
              }
            >
              {o.label}
            </button>
          ))}
        </span>
      </div>
      <p className="mt-1 max-w-[42ch] text-[11.5px] leading-[1.45] text-[var(--on-band-muted)]">{helper}</p>
    </div>
  );
}

export function ViewTray({ order, view, figures, onOrder, onToggle, onSources, onClose }: ViewTrayProps) {
  const showHide = [
    { value: "show" as const, label: "Show" },
    { value: "hide" as const, label: "Hide" },
  ];

  return (
    <Tray
      title="View"
      description="Display only. None of this changes what the sheet says."
      width={320}
      onClose={onClose}
      footer="display only · free · prints as shown"
    >
      <Segmented
        label="Order"
        value={order}
        options={[{ value: "course", label: "Course" }, { value: "priority", label: "Priority" }]}
        helper="Priority puts the topics most likely to come up first."
        onPick={onOrder}
      />
      <Segmented
        label="Sources"
        value={view.sources ?? "compact"}
        options={[
          { value: "off" as const, label: "Off" },
          { value: "compact" as const, label: "Compact" },
          { value: "full" as const, label: "Full" },
        ]}
        helper={"Your own lines read “you” in every mode, including Off."}
        onPick={(v) => onSources(v)}
      />
      <Segmented
        label="Traps"
        value={view.traps ? "show" : "hide"}
        options={showHide}
        helper="Across every topic. Per-topic mixes live in Topics."
        onPick={() => onToggle("traps")}
      />
      <Segmented
        label="Question tags"
        value={view.tags ? "show" : "hide"}
        options={showHide}
        helper="The small [MC] / [SA] marks beside each question."
        onPick={() => onToggle("tags")}
      />

      {figures && (
        <div className="flex items-center justify-between gap-3 px-[10px] py-2">
          <span className="min-w-0">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--on-band-muted)]">
              Diagrams
            </span>
            <p className="mt-1 text-[11.5px] leading-[1.45] text-[var(--on-band-muted)]">
              {figures.on} of {figures.total} from your files are on the sheet.
            </p>
          </span>
          <button
            type="button"
            onClick={figures.onOpen}
            className="ctl ctl-neutral tap inline-flex h-7 shrink-0 items-center rounded-[7px] px-2.5 text-[11.5px] font-semibold"
          >
            Choose
          </button>
        </div>
      )}
    </Tray>
  );
}
