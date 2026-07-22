import type { ReactNode } from "react";

export type CalloutVariant = "info" | "warn" | "danger" | "success" | "exam";

/**
 * Callout — app-chrome notice. Leading icon + tinted background + a
 * hairline border of the tint's own hue.
 *
 * NOTE: deliberately NOT a side-stripe (border-left accent) — that's an
 * impeccable-banned pattern in app UI. (The SHEET's trap-callout keeps
 * its left rule; that's the proven print artifact, different rules.)
 */
export interface CalloutProps {
  variant?: CalloutVariant;
  title?: string;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
}

const STYLES: Record<CalloutVariant, { wrap: string; icon: string }> = {
  info: {
    wrap: "bg-[var(--info-bg)] border-[var(--info)]/20 text-[var(--info)]",
    icon: "text-[var(--info)]",
  },
  warn: {
    wrap: "bg-[var(--warn-bg)] border-[var(--warn)]/25 text-[var(--warn)]",
    icon: "text-[var(--warn)]",
  },
  danger: {
    wrap: "bg-[var(--danger-bg)] border-[var(--danger)]/25 text-[var(--danger)]",
    icon: "text-[var(--danger)]",
  },
  success: {
    wrap: "bg-[var(--success-bg)] border-[var(--success)]/25 text-[var(--success)]",
    icon: "text-[var(--success)]",
  },
  exam: {
    wrap: "bg-[var(--salmon)] border-[var(--salmon-line)] text-[var(--salmon-text)]",
    icon: "text-[var(--salmon-text)]",
  },
};

const DEFAULT_ICON: Record<CalloutVariant, ReactNode> = {
  info: <PathIcon d="M12 16v-4M12 8h.01" circle />,
  warn: <PathIcon d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />,
  danger: <PathIcon d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />,
  success: <PathIcon d="M20 6 9 17l-5-5" />,
  exam: <span aria-hidden>★</span>,
};

function PathIcon({ d, circle }: { d: string; circle?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {circle && <circle cx="12" cy="12" r="10" />}
      <path d={d} />
    </svg>
  );
}

export function Callout({ variant = "info", title, icon, children, className }: CalloutProps) {
  const s = STYLES[variant];
  return (
    <div
      className={`flex gap-2.5 rounded-[var(--r-md)] border px-3 py-2.5 text-[13px] ${s.wrap}${className ? ` ${className}` : ""}`}
      role={variant === "danger" ? "alert" : undefined}
    >
      <span className={`mt-px shrink-0 ${s.icon}`}>{icon ?? DEFAULT_ICON[variant]}</span>
      <div className="min-w-0 text-[var(--ink-800)]">
        {title && <div className="font-semibold text-[var(--ink-900)]">{title}</div>}
        {children}
      </div>
    </div>
  );
}
