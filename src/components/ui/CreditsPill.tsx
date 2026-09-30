/**
 * CreditsPill — the app-chrome credits indicator. Amber when low (≤1),
 * neutral otherwise, ink when it's a plan/pass. A tiny filled dot leads
 * so it reads as a status at a glance.
 */
export interface CreditsPillProps {
  credits: number;
  /** e.g. "Sprint Pass" — overrides the count display with a plan label. */
  planLabel?: string;
  /** Ink is for a plan that was paid for; neutral is for a state the student is simply in. */
  planTone?: "ink" | "neutral";
  className?: string;
}

export function CreditsPill({ credits, planLabel, planTone = "ink", className }: CreditsPillProps) {
  const low = credits <= 1 && !planLabel;
  const tone = planLabel
    ? planTone === "neutral"
      ? "bg-[var(--ink-100)] text-[var(--ink-700)]"
      : "bg-[var(--band)] text-white"
    : low
      ? "bg-[var(--warn-bg)] text-[var(--warn)]"
      : "bg-[var(--ink-100)] text-[var(--ink-700)]";
  const dot = planLabel
    ? planTone === "neutral" ? "bg-[var(--ink-400)]" : "bg-white"
    : low ? "bg-[var(--warn)]" : "bg-[var(--conf-high)]";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[var(--r-full)] px-2.5 py-1 text-[12px] font-medium ${tone}${className ? ` ${className}` : ""}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      {planLabel ?? `${credits} credit${credits === 1 ? "" : "s"}`}
    </span>
  );
}
