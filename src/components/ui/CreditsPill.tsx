/**
 * CreditsPill — the app-chrome credits indicator. Amber when low (≤1),
 * neutral otherwise, ink when it's a plan/pass. A tiny filled dot leads
 * so it reads as a status at a glance.
 */
export interface CreditsPillProps {
  credits: number;
  /** e.g. "Sprint Pass" — overrides the count display with a plan label. */
  planLabel?: string;
  className?: string;
}

export function CreditsPill({ credits, planLabel, className }: CreditsPillProps) {
  const low = credits <= 1 && !planLabel;
  const tone = planLabel
    ? "bg-[var(--ink-900)] text-white"
    : low
      ? "bg-[var(--warn-bg)] text-[var(--warn)]"
      : "bg-[var(--ink-100)] text-[var(--ink-700)]";
  const dot = planLabel ? "bg-white" : low ? "bg-[var(--warn)]" : "bg-[var(--conf-high)]";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[var(--r-full)] px-2.5 py-1 text-[12px] font-medium ${tone}${className ? ` ${className}` : ""}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      {planLabel ?? `${credits} credit${credits === 1 ? "" : "s"}`}
    </span>
  );
}
