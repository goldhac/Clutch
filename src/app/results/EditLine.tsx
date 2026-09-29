"use client";

/**
 * EditLine — change the words on a line, and own it (editing-flow handoff §6).
 *
 * Opened by clicking a line on the sheet. Deliberately a small panel rather than an inline
 * contenteditable: the sheet is a measured print layout, and letting text grow inside it while the
 * fitter is measuring would fight the thing that keeps both pages full.
 *
 * It is the one tray with no opener — a line on the sheet summoned it — so it centres, and the
 * line itself is ringed on the page to make the connection from the other end.
 *
 * The panel exists mostly to answer one question before the student commits: **what does saving
 * change?** Editing a line moves it across the trust boundary — it stops being a line Clutch stands
 * behind and becomes one the student wrote. So the middle of this tray is a before/after of exactly
 * the three things that move: the citation, the verified star, and whether the fitter may trim it.
 * Two of those are a gain and one is a loss, and a panel that showed only the gain would be lying.
 */
import { useEffect, useRef, useState } from "react";
import { Modal, ModalActions, Button } from "@/components/ui";
import { topicColorClass } from "@/components/sheet/topics-color";

export interface EditLineProps {
  labels: [string, string];
  initial: { a: string; b: string };
  /** True when the line currently carries the verified star, so we can warn before removing it. */
  wasVerified?: boolean;
  /** The citation this line carries now — "Slide 14". Shown as the "before" of the trust panel. */
  src?: string;
  /** Already the student's, from a previous edit or an Add block. Changes the whole panel. */
  mine?: boolean;
  /** For the header swatch and name, so the panel and the block on the page read as one object. */
  topic?: string;
  topicIndex?: number;
  /** Only offered for a line the student wrote — Clutch's own lines are removed by unticking. */
  onRemove?: () => void;
  onSave: (next: { a: string; b: string }) => void;
  onCancel: () => void;
}

/** One row of the before/after grid. `after` carries the weight; `before` is what is being left. */
function Change({ label, before, after }: { label: string; before: React.ReactNode; after: React.ReactNode }) {
  return (
    <>
      <span className="font-mono text-[11px] text-[var(--on-band-muted)]">{label}</span>
      <span className="min-w-0 truncate text-[12px] text-[#8a8a96]">{before}</span>
      <span aria-hidden className="text-center font-mono text-[11px] text-[#4a4a53]">&rarr;</span>
      <span className="min-w-0 text-[12px] text-[var(--on-band)]">{after}</span>
    </>
  );
}

/** The marker that means "yours" everywhere in the product: a hollow ring, never a filled dot. */
const MineRing = () => (
  <span aria-hidden className="mr-1 inline-block h-[7px] w-[7px] rounded-full border-[1.3px] border-[#b3b0f4] align-middle" />
);

export function EditLine({
  labels,
  initial,
  wasVerified,
  src,
  mine,
  topic,
  topicIndex,
  onRemove,
  onSave,
  onCancel,
}: EditLineProps) {
  const [a, setA] = useState(initial.a);
  const [b, setB] = useState(initial.b);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  // Runs after the Tray's own "focus the first control", and selects — the student came here to
  // replace a phrase, not to append to it.
  useEffect(() => { first.current?.focus(); first.current?.select(); }, []);

  const changed = a !== initial.a || b !== initial.b;
  const ready = a.trim().length > 0 && b.trim().length > 0 && changed;
  const tk = topicIndex === undefined ? "" : topicColorClass(topicIndex);

  return (
    <>
      <div
        role="dialog"
        aria-label={mine ? "Edit your line" : "Rewrite this line"}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.stopPropagation(); onCancel(); }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && ready) onSave({ a, b });
        }}
        style={{ width: 600, maxWidth: "calc(100vw - 32px)" }}
        className={`${tk} tray pointer-events-auto animate-[cl-rise_220ms_var(--ease-pop)] rounded-[14px] bg-[var(--band-2)] text-[var(--on-band)] shadow-[0_24px_60px_rgba(17,17,20,.45),0_0_0_1px_var(--band-line)]`}
      >
        <div className="flex items-center gap-2.5 py-3.5 pl-[18px] pr-3">
          {topicIndex !== undefined && (
            <span aria-hidden className="h-[9px] w-[9px] shrink-0 rounded-[2px] bg-[var(--tk)]" />
          )}
          <h2 className="shrink-0 text-[14px] font-semibold">{mine ? "Edit your line" : "Rewrite this line"}</h2>
          {topic && (
            <span className="min-w-0 truncate font-mono text-[11px] text-[var(--on-band-muted)]">{topic}</span>
          )}
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="ctl ctl-square tap -mr-1 ml-auto inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-[var(--on-band-muted)] hover:bg-white/[0.08] hover:text-white"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-2.5 px-[18px] pb-3.5">
          <label className="block">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.05em] text-[var(--on-band-muted)]">{labels[0]}</span>
            <input
              ref={first}
              value={a}
              maxLength={160}
              onChange={(e) => setA(e.target.value)}
              className="ctl-input mt-1 h-[34px] w-full rounded-[8px] px-2.5 text-[13px]"
            />
          </label>

          <label className="block">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.05em] text-[var(--on-band-muted)]">{labels[1]}</span>
            <textarea
              value={b}
              rows={2}
              maxLength={400}
              onChange={(e) => setB(e.target.value)}
              className="ctl-input mt-1 w-full resize-y rounded-[8px] px-2.5 py-1.5 text-[13px]"
            />
          </label>

          {mine ? (
            <p className="text-[12px] text-[var(--on-band-muted)]">
              <MineRing />
              Already yours{src ? <> &middot; rewritten from <span className="font-mono">{src}</span></> : null}. It stays
              pinned, and the sheet will never trim it.
            </p>
          ) : (
            <div className="rounded-[10px] bg-[#15151a] px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--band-line)]">
              <div
                className="grid items-center gap-x-3 gap-y-[7px]"
                style={{ gridTemplateColumns: "110px 1fr 20px 1fr" }}
              >
                <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[#6b6b76]">When you save</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[#6b6b76]">Now</span>
                <span />
                <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[#6b6b76]">After</span>

                <Change
                  label="Citation"
                  before={<span className="font-mono">{src || "—"}</span>}
                  after={<><MineRing /><span className="font-semibold text-[#b3b0f4]">you</span></>}
                />
                <Change
                  label="Verified"
                  before={wasVerified ? <span className="text-[var(--verified)]">&#9733; verified</span> : <span className="text-[#6b6b76]">not starred</span>}
                  after={wasVerified ? "comes off" : <span className="text-[#6b6b76]">&mdash;</span>}
                />
                <Change label="Trimming" before="by rank" after="pinned, never trimmed" />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-[var(--band-line)] px-[18px] py-[11px]">
          <button
            type="button"
            disabled={!ready}
            onClick={() => onSave({ a, b })}
            className="ctl ctl-primary tap inline-flex h-8 items-center rounded-[8px] px-3 text-[12px] font-semibold"
          >
            {mine ? "Save" : "Save as mine"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="ctl tap inline-flex h-8 items-center rounded-[8px] px-2 text-[12px] font-semibold text-[var(--on-band-muted)] hover:text-white"
          >
            Cancel
          </button>
          <span className="font-mono text-[10.5px] text-[var(--on-band-muted)]">&#8984;&#9166; save &middot; esc cancel</span>
          {mine && onRemove && (
            <button
              type="button"
              onClick={() => setConfirmRemove(true)}
              className="ctl ctl-destructive tap ml-auto inline-flex h-8 shrink-0 items-center rounded-[8px] px-2.5 text-[11.5px] font-semibold"
            >
              Remove my line
            </button>
          )}
        </div>
      </div>

      {/* A modal, not a tray (§10.1). The interruption rules say a modal is for money, for a
          deletion that cannot be rebuilt, or for failure — and this is the only delete in the
          product that qualifies, because the pack cannot write this line again. */}
      <Modal
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        tone="destructive"
        eyebrow="DELETE · YOUR LINE"
        title="Remove your line?"
        footer={{ tint: "warn", text: "kept in version history · its space refills from your files, free" }}
      >
        {/* The line itself, dressed exactly as it is on the sheet — they should be deciding about
            the words they wrote, not about the word "line". */}
        <div className="rounded-[10px] bg-[var(--signal-50)] px-3 py-2.5">
          <span aria-hidden className="mr-1.5 inline-block h-[7px] w-[7px] rounded-full border-[1.3px] border-[var(--signal-600)] align-middle" />
          <span className="text-[13.5px] leading-[1.5] text-[var(--ink-900)]">{a}</span>
          <span className="ml-1.5 font-semibold text-[var(--signal-600)]" style={{ fontSize: "0.82em" }}>you</span>
        </div>
        <p className="mt-3 text-[14px] leading-[1.55] text-[var(--ink-700)]">
          Clutch can rebuild everything else on this sheet from your files. It can&rsquo;t rebuild this.
        </p>
        <ModalActions>
          <button
            type="button"
            onClick={() => { setConfirmRemove(false); onRemove?.(); }}
            className="tap inline-flex h-[38px] items-center rounded-[9px] bg-[var(--danger)] px-4 text-[13px] font-semibold text-white transition-[background-color,transform] duration-[160ms] hover:bg-[#a93226] active:scale-[0.98]"
          >
            Remove line
          </button>
          <Button variant="secondary" size="sm" onClick={() => setConfirmRemove(false)}>Keep it</Button>
        </ModalActions>
      </Modal>
    </>
  );
}
