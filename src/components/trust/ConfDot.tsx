import type { Conf } from "@/contract/sheet-content";

/**
 * ConfDot — the small colored circle that shows an item's confidence.
 * The single most-repeated primitive in the whole product: it appears
 * next to every ranked item on the sheet AND in the app's rail views.
 *
 * high  = green   (trusted, past-exam or multi-source backed)
 * med   = gold    (worth studying but not exam-verified)
 * low   = gray    (background material)
 */
export interface ConfDotProps {
  conf: Conf;
  className?: string;
}

const LABELS: Record<Conf, string> = {
  high: "high confidence",
  med: "medium confidence",
  low: "low confidence",
};

export function ConfDot({ conf, className }: ConfDotProps) {
  return (
    <span
      className={`conf-dot conf-${conf}${className ? ` ${className}` : ""}`}
      aria-label={LABELS[conf]}
      role="img"
    />
  );
}
