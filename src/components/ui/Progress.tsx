/**
 * Progress — a simple determinate bar. Used for the "confidence in
 * result" meter on /generate, and generation progress on /results
 * (Step 7's Tighten loop).
 *
 * value: 0..100
 * tone:  green (default) | indigo | gold — matches the semantic message
 */
export type ProgressTone = "green" | "indigo" | "gold";

export interface ProgressProps {
  value: number;
  tone?: ProgressTone;
  label?: string;
  rightSide?: string;
  className?: string;
}

const TONES: Record<ProgressTone, string> = {
  green: "bg-[color:var(--color-correct-green)]",
  indigo: "bg-[color:var(--color-primary-indigo)]",
  gold: "bg-[color:var(--color-exam-gold)]",
};

export function Progress({
  value,
  tone = "green",
  label,
  rightSide,
  className,
}: ProgressProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={className}>
      {(label || rightSide) && (
        <div className="mb-1 flex justify-between text-xs text-neutral-500">
          {label && <span>{label}</span>}
          {rightSide && <span>{rightSide}</span>}
        </div>
      )}
      <div
        className="h-2 w-full overflow-hidden rounded bg-neutral-200"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-full rounded transition-all ${TONES[tone]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
