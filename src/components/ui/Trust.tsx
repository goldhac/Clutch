/**
 * Trust layer — the single most important pattern in the v2 redesign.
 * Anywhere the product makes a claim it shows, inline:
 *
 *   1. ConfDot      — tier-colored circle with a tint ring
 *   2. VerifiedStar — gold ★, EARNED only (a past exam in the user's
 *                     own pack asked this item)
 *   3. SourceLine   — mono filename + slide, e.g.
 *                     "lecture-databases-slides.pptx · Slide 21"
 *
 * A fake high score is a product failure, not a display bug: the score
 * must be calibrated and the star earned, or neither renders.
 */

export type ConfTier = "high" | "med" | "low";

export function tierOf(score: number): ConfTier {
  return score >= 80 ? "high" : score >= 50 ? "med" : "low";
}

const TIER = {
  high: { fill: "var(--conf-high)", tint: "var(--conf-high-bg)", deep: "var(--conf-high)" },
  med: { fill: "var(--conf-med)", tint: "var(--conf-med-bg)", deep: "var(--conf-med-deep)" },
  low: { fill: "var(--conf-low)", tint: "var(--conf-low-bg)", deep: "var(--conf-low-deep)" },
} as const;

export function ConfDot({ tier, size = 10 }: { tier: ConfTier; size?: number }) {
  const t = TIER[tier];
  return (
    <span
      aria-label={`confidence ${tier}`}
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: t.fill, boxShadow: `0 0 0 4px ${t.tint}` }}
    />
  );
}

export function VerifiedStar({ title = "exam-verified" }: { title?: string }) {
  return (
    <span title={title} aria-label={title} className="text-[13px] leading-none text-[var(--verified)]">
      ★
    </span>
  );
}

export function ConfPill({ tier }: { tier: ConfTier }) {
  const t = TIER[tier];
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-[3px] font-mono text-[12px] font-semibold"
      style={{ background: t.tint, color: t.deep }}
    >
      conf {tier}
    </span>
  );
}

export function SourceLine({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`font-mono text-[12px] text-[var(--ink-500)] ${className ?? ""}`}>
      {children}
    </span>
  );
}
