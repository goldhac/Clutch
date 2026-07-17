import type { ReactNode } from "react";

export type CalloutVariant = "info" | "warn" | "danger" | "success" | "exam";

/**
 * Callout — the app-chrome equivalent of the sheet's .box variants
 * (which live in semantics.css scoped under .sheet). Reuses the same
 * palette but with app-friendly padding + radius.
 *
 * info    → indigo    (neutral notice)
 * warn    → orange    (heads-up, "we couldn't read this file")
 * danger  → red       (something failed, retry needed)
 * success → green     (confirmation)
 * exam    → gold      (past-exam / verified accents)
 */
export interface CalloutProps {
  variant?: CalloutVariant;
  title?: string;
  children: ReactNode;
  className?: string;
}

const STYLES: Record<CalloutVariant, string> = {
  info: "border-[color:var(--color-primary-indigo)] bg-indigo-50 text-indigo-900",
  warn: "border-[color:var(--color-warning-orange)] bg-amber-50 text-amber-900",
  danger: "border-[color:var(--color-strong-red)] bg-red-50 text-red-900",
  success: "border-[color:var(--color-correct-green)] bg-green-50 text-green-900",
  exam: "border-[color:var(--color-exam-gold)] bg-yellow-50 text-yellow-900",
};

export function Callout({
  variant = "info",
  title,
  children,
  className,
}: CalloutProps) {
  return (
    <div
      className={
        `rounded border-l-4 px-3 py-2 text-sm ${STYLES[variant]}` +
        (className ? ` ${className}` : "")
      }
      role={variant === "danger" ? "alert" : undefined}
    >
      {title && <strong className="mr-1 font-semibold">{title}</strong>}
      {children}
    </div>
  );
}
