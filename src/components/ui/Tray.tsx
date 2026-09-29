"use client";

/**
 * Tray — the panel that free, reversible work happens in (editing-flow handoff §4).
 *
 * Six of these were hand-built before it existed — the topic rail, the line editor, version
 * history, the diagram picker, the chat, and the add form — sharing only a background colour and
 * an entrance animation. Each re-implemented its own header, close affordance and padding, which
 * is how they drifted.
 *
 * **Tray is not Modal, and the difference is the point.** A tray is free, reversible work: the
 * sheet stays live behind it, there is no scrim, and nothing is trapped. A modal is for money, for
 * deleting something that cannot be rebuilt, or for failure — it takes a light surface, a scrim,
 * and the student's full attention. Putting "remove a topic" in a modal would say that removing a
 * topic is dangerous. It is not; it is free and it comes straight back.
 *
 * Anchored to its opener by default, with a notch pointing at it, so the panel and the button that
 * summoned it read as one object. The line editor has no opener — it is summoned by clicking a
 * line on the sheet — so it centres instead, and the edited line is ringed on the sheet to make
 * the same connection from the other end.
 */
import { useEffect, useRef, type ReactNode } from "react";

export interface TrayProps {
  title: string;
  /** Small mono figure beside the title — "4 of 5 on", "20 saves". */
  count?: string;
  /** One sentence under the title, when the tray needs to explain itself. */
  description?: ReactNode;
  /**
   * The consequence strip. Always states what this tray costs — "free · instant · nothing
   * rebuilds your sheet" — because a panel full of buttons should say so before it is used, not
   * after.
   */
  footer?: ReactNode;
  /**
   * A control that belongs beside the close button rather than in the body — the chat's "undo
   * last edit", which has to stay reachable while the thread scrolls.
   */
  headerAction?: ReactNode;
  /**
   * Pinned under the scrolling body, above the footer. The chat's chips and composer live here:
   * they must not scroll away with the thread, and they are not consequence copy.
   */
  below?: ReactNode;
  width?: number;
  /** `opener` hangs it above the button that opened it; `center` is for trays with no opener. */
  anchor?: "opener" | "center";
  onClose: () => void;
  children: ReactNode;
}

export function Tray({
  title,
  count,
  description,
  footer,
  headerAction,
  below,
  width = 520,
  anchor = "opener",
  onClose,
  children,
}: TrayProps) {
  const ref = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // Remember where focus came from so it can go back — a keyboard user who opens a tray from
    // the dock and closes it should not be returned to the top of the document.
    restoreTo.current = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>(
      'input, textarea, select, button:not([data-tray-close]), [tabindex]:not([tabindex="-1"])',
    );
    first?.focus();
    return () => restoreTo.current?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // A modal, if one is open, owns Escape first — the page handles that ordering.
      e.stopPropagation();
      onClose();
    };
    const el = ref.current;
    el?.addEventListener("keydown", onKey);
    return () => el?.removeEventListener("keydown", onKey);
  }, [onClose]);

  const centred = anchor === "center";

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={title}
      style={{ width, maxWidth: "calc(100vw - 32px)" }}
      className={
        "tray pointer-events-auto relative animate-[cl-rise_220ms_var(--ease-pop)] rounded-[14px] " +
        "bg-[var(--band-2)] text-[var(--on-band)] " +
        "shadow-[0_24px_60px_rgba(17,17,20,.45),0_0_0_1px_var(--band-line)]"
      }
    >
      {/* The notch: a rotated square tucked under the bottom edge, pointing at the opener. Absent
          when centred, because there is nothing below to point at. */}
      {!centred && (
        <span
          aria-hidden
          className="absolute bottom-[-6px] left-1/2 -ml-[6px] h-3 w-3 rotate-45 bg-[var(--band-2)] shadow-[1px_1px_0_var(--band-line)]"
        />
      )}

      <div className="flex items-start gap-3 py-3.5 pl-[18px] pr-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h2 className="text-[14px] font-semibold text-[var(--on-band)]">{title}</h2>
            {count && (
              <span className="font-mono text-[11px] text-[var(--on-band-muted)]">{count}</span>
            )}
          </div>
        </div>
        {headerAction}
        <button
          type="button"
          data-tray-close
          onClick={onClose}
          aria-label="Close"
          className="ctl ctl-square tap -mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-[var(--on-band-muted)] hover:bg-white/[0.08] hover:text-white"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {description && (
        <p className="px-[18px] pb-2.5 text-[12.5px] leading-[1.5] text-[var(--on-band-muted)]">
          {description}
        </p>
      )}

      <div className="flex max-h-[52vh] min-h-0 flex-col gap-0.5 overflow-y-auto px-2 pb-2">{children}</div>

      {below}

      {footer && (
        <div className="border-t border-[var(--band-line)] px-[18px] py-[11px] font-mono text-[11px] text-[var(--on-band-muted)]">
          {footer}
        </div>
      )}
    </div>
  );
}
