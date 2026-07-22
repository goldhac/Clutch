/**
 * Progress — determinate bar. Two uses:
 *   - the "confidence in result" meter on /generate (gradient med→high,
 *     climbs with ds-climb)
 *   - generation progress on the loading screen
 *
 * The confidence gradient (--conf-med → --conf-high) is a design
 * signature: the bar literally warms toward green as trust rises.
 */
export type ProgressTone = "confidence" | "signal" | "ink";

export interface ProgressProps {
  value: number; // 0..100
  tone?: ProgressTone;
  label?: string;
  rightSide?: string;
  /** Animate the fill from 0 on mount (ds-climb). Default true. */
  climb?: boolean;
  className?: string;
}

const FILL: Record<ProgressTone, string> = {
  confidence:
    "bg-[linear-gradient(90deg,var(--conf-med),var(--conf-high))]",
  signal: "bg-[var(--signal-500)]",
  ink: "bg-[var(--ink-900)]",
};

export function Progress({
  value,
  tone = "confidence",
  label,
  rightSide,
  climb = true,
  className,
}: ProgressProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={className}>
      {(label || rightSide) && (
        <div className="mb-1.5 flex items-center justify-between text-[13px]">
          {label && <span className="text-[var(--ink-600)]">{label}</span>}
          {rightSide && (
            <span className="font-mono text-[12px] font-medium text-[var(--ink-800)]">
              {rightSide}
            </span>
          )}
        </div>
      )}
      <div
        className="h-2 w-full overflow-hidden rounded-[var(--r-full)] bg-[var(--ink-150)]"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-full rounded-[var(--r-full)] ${FILL[tone]}`}
          style={{
            width: `${pct}%`,
            transition: "width var(--dur-slow) var(--ease-out)",
            animation: climb ? "ds-climb var(--dur-slow) var(--ease-out)" : undefined,
          }}
        />
      </div>
    </div>
  );
}
