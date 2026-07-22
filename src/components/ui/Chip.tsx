import type { ReactNode } from "react";

export type ChipTone =
  | "neutral" // file tags (slides/notes), default
  | "exam" // ★ past exam · high weight (salmon)
  | "signal" // MAX density
  | "success" // verified
  | "warn" // credits low
  | "danger"
  | "ink"; // PRO

/**
 * Chip / Badge — small labels. Two roles share one component:
 *   - interactive tag chips on /generate (file tags, with optional ✕)
 *   - static status badges (Verified, PRO, MAX density, N credits)
 *
 * The salmon "exam" tone is the design's signature — ★ Past exam sits
 * on --salmon so the highest-weight file is instantly findable.
 */
export interface ChipProps {
  tone?: ChipTone;
  children: ReactNode;
  /** Renders a trailing ✕ button (tag chips). */
  onRemove?: () => void;
  removeLabel?: string;
  className?: string;
}

const TONES: Record<ChipTone, string> = {
  neutral: "bg-[var(--ink-100)] text-[var(--ink-700)]",
  exam: "bg-[var(--salmon)] text-[var(--salmon-text)]",
  signal: "bg-[var(--signal-100)] text-[var(--signal-700)]",
  success: "bg-[var(--conf-high-bg)] text-[var(--conf-high)]",
  warn: "bg-[var(--warn-bg)] text-[var(--warn)]",
  danger: "bg-[var(--danger-bg)] text-[var(--danger)]",
  ink: "bg-[var(--ink-900)] text-white",
};

export function Chip({ tone = "neutral", children, onRemove, removeLabel, className }: ChipProps) {
  return (
    <span
      className={
        `inline-flex items-center gap-1 rounded-[var(--r-full)] px-2.5 py-1 ` +
        `text-[12px] font-medium leading-none ${TONES[tone]}` +
        (className ? ` ${className}` : "")
      }
    >
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel ?? "remove"}
          className="-mr-0.5 ml-0.5 rounded-full p-0.5 opacity-60 transition-opacity hover:opacity-100"
        >
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
    </span>
  );
}
