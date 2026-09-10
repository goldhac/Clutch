"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * Modal — the v2 handoff card spec, built on native <dialog> (focus
 * trap, Esc and top-layer for free).
 *
 * Card: max-width 460, 14px radius, white, padding 28/30/26, modal
 * shadow, cl-pop entrance over a cl-fade scrim.
 *
 * The three interruption rules (from the handoff — enforce in review):
 *  1. A modal costs the user their place — only for money, deletion,
 *     or a failure the user must know about.
 *  2. Say what it costs, in the modal. Never hide the free path.
 *  3. Dismissal is always free: scrim, Esc, and the named secondary
 *     all leave state untouched.
 */

export type ModalTone = "decision" | "destructive" | "caveat";
export type FooterTint = "good" | "bad" | "warn" | "plain";

const TONE_DOT: Record<ModalTone, string> = {
  decision: "var(--signal-500)",
  destructive: "var(--conf-low)",
  caveat: "var(--verified)",
};

const FOOTER: Record<FooterTint, { bg: string; fg: string }> = {
  good: { bg: "var(--conf-high-bg2)", fg: "var(--conf-high)" },
  bad: { bg: "var(--conf-low-bg)", fg: "var(--conf-low-deep)" },
  warn: { bg: "var(--salmon)", fg: "var(--salmon-text)" },
  plain: { bg: "var(--paper)", fg: "var(--ink-500)" },
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** tone dot color: iris = a decision · red = destructive · gold = caveat */
  tone: ModalTone;
  /** mono uppercase eyebrow next to the dot, e.g. "UNLOCK · BACK PAGE" */
  eyebrow: string;
  /** Newsreader title */
  title: string;
  children: ReactNode;
  /** tinted footer strip — mono 11px, states the consequence */
  footer?: { tint: FooterTint; text: string };
  width?: number;
}

export function Modal({
  open,
  onClose,
  tone,
  eyebrow,
  title,
  children,
  footer,
  width = 460,
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // scrim click — always free
      }}
      className={
        "m-auto w-full rounded-[14px] bg-white p-0 shadow-[var(--sh-modal)] " +
        "backdrop:bg-[var(--scrim)] backdrop:backdrop-blur-[2px] " +
        "[&[open]]:animate-[cl-pop_200ms_var(--ease-pop)] " +
        "[&[open]::backdrop]:animate-[cl-fade_160ms_ease]"
      }
      style={{ maxWidth: `min(${width}px, calc(100vw - 32px))` }}
    >
      <div className="px-[30px] pb-[26px] pt-7">
        <div className="mb-4 flex items-center gap-2.5">
          <span
            aria-hidden
            className="h-[7px] w-[7px] rounded-full"
            style={{ background: TONE_DOT[tone] }}
          />
          <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-500)]">
            {eyebrow}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-[var(--r-sm)] text-[var(--ink-500)] transition-colors duration-[160ms] hover:bg-[var(--field)] hover:text-[var(--ink-900)]"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <h2
          id={titleId}
          className="font-serif text-[27px] leading-[1.12] tracking-[-0.02em] text-[var(--ink-900)]"
        >
          {title}
        </h2>

        <div className="mt-3 text-[14px] leading-[1.6] text-[var(--ink-600)]">{children}</div>
      </div>

      {footer && (
        <div
          className="border-t border-[var(--ink-150)] px-[30px] py-[13px] font-mono text-[11px]"
          style={{ background: FOOTER[footer.tint].bg, color: FOOTER[footer.tint].fg }}
        >
          {footer.text}
        </div>
      )}
    </dialog>
  );
}

/* ── 2-up option grid (unlock / credits / export) ─────────────────── */

export interface OptionTileProps {
  primary?: boolean;
  label: string;
  /** mono sub-line, e.g. "$4.99 · one sheet" */
  sub: string;
  onClick: () => void;
  disabled?: boolean;
}

export function ModalOptions({ children }: { children: ReactNode }) {
  return <div className="mt-5 grid grid-cols-2 gap-3">{children}</div>;
}

export function OptionTile({ primary, label, sub, onClick, disabled }: OptionTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        "flex flex-col items-start gap-1 rounded-[10px] px-4 py-3.5 text-left " +
        "transition-[transform,background-color,border-color] duration-[160ms] ease-[var(--ease-out)] " +
        "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 " +
        (primary
          ? "bg-[var(--ink-900)] text-white hover:bg-[var(--ink-800)]"
          : "border border-[var(--border-input)] bg-white text-[var(--ink-900)] hover:border-[var(--ink-300)] hover:bg-[var(--ink-50)]")
      }
    >
      <span className="text-[14px] font-semibold leading-tight">{label}</span>
      <span
        className={`font-mono text-[11px] ${primary ? "text-[var(--ink-300)]" : "text-[var(--ink-500)]"}`}
      >
        {sub}
      </span>
    </button>
  );
}

/* ── primary/secondary button row (delete / failures) ─────────────── */

export function ModalActions({ children }: { children: ReactNode }) {
  return <div className="mt-5 flex items-center gap-3">{children}</div>;
}
