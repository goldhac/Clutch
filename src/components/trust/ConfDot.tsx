import type { Conf } from "@/contract/sheet-content";

/**
 * ConfDot — the filled circle showing an item's confidence tier.
 * The single most-repeated primitive in the product: next to every
 * ranked item on the sheet AND in the app's rail/list views.
 *
 * Self-contained (inline tier colors) so it renders identically inside
 * the print sheet and in app chrome — no dependency on .sheet-scoped
 * CSS. `ring` adds the soft tier-bg halo used in app-chrome rows.
 *
 *   high = green · med = gold/amber · low = red · (verified handled by
 *   VerifiedStar, not here)
 */
export interface ConfDotProps {
  conf: Conf;
  /**
   * The student wrote or edited this line (#20). It becomes a HOLLOW RING in the same slot at the
   * same size — a confidence tier is our assessment of our own line, and we have no assessment to
   * make about theirs. Filled = we checked it. Hollow = you wrote it.
   */
  mine?: boolean;
  ring?: boolean;
  /** px size for app chrome. Omit → 0.62em so it scales with the sheet's font. */
  size?: number;
  className?: string;
}

const COLOR: Record<Conf, { dot: string; bg: string }> = {
  high: { dot: "var(--conf-high)", bg: "var(--conf-high-bg)" },
  med: { dot: "var(--conf-med)", bg: "var(--conf-med-bg)" },
  low: { dot: "var(--conf-low)", bg: "var(--conf-low-bg)" },
};

const MINE_LABEL = "you wrote this";

const LABELS: Record<Conf, string> = {
  high: "high confidence",
  med: "medium confidence",
  low: "low confidence",
};

export function ConfDot({ conf, mine = false, ring = false, size, className }: ConfDotProps) {
  const c = COLOR[conf];
  const dim = size != null ? `${size}px` : "0.62em";
  return (
    <span
      className={`conf-dot ${mine ? "mine" : `conf-${conf}`}${className ? ` ${className}` : ""}`}
      style={{
        display: "inline-block",
        width: dim,
        height: dim,
        borderRadius: "50%",
        background: mine ? "transparent" : c.dot,
        border: mine ? "1.3px solid var(--signal-600)" : undefined,
        boxSizing: mine ? "border-box" : undefined,
        boxShadow: !mine && ring ? `0 0 0 3px ${c.bg}` : undefined,
        verticalAlign: "middle",
      }}
      role="img"
      aria-label={mine ? MINE_LABEL : LABELS[conf]}
    />
  );
}
