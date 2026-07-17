/**
 * VerifiedStar — the ★ prefix used on items a prior exam in the pack
 * directly confirmed. Rendered in exam-gold to stand out.
 *
 * Only rendered when `verified === true` — if false/undefined this is
 * a no-op returning null (safe to sprinkle everywhere).
 */
export interface VerifiedStarProps {
  verified?: boolean;
  className?: string;
}

export function VerifiedStar({ verified, className }: VerifiedStarProps) {
  if (!verified) return null;
  return (
    <span
      className={`verified-star${className ? ` ${className}` : ""}`}
      title="exam-verified"
      aria-label="exam-verified"
    >
      ★
    </span>
  );
}
