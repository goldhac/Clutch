import Link from "next/link";

/**
 * Wordmark — the real Clutch mark (v2 handoff, colorway B "system
 * palette"): a study sheet with a folded gold corner, three ruled lines
 * and an iris lightning bolt. Inlined from
 * design/v2-handoff/assets/brand/clutch-icon-ink.svg so it can be
 * recolored for ink grounds.
 *
 * Chrome usage per the brand spec: icon ~19×24 beside Geist 600
 * wordmark at 15px, letter-spacing -0.01em, gap 9px. The full lockup
 * SVGs in public/brand/ are for marketing exports only.
 */
export interface WordmarkProps {
  href?: string;
  size?: "sm" | "md";
  /** hide the text, mark only (favicons, tight chrome) */
  markOnly?: boolean;
  /** render for a dark (ink) ground — outline flips to white */
  onInk?: boolean;
  className?: string;
}

export function Mark({ px = 24, onInk = false }: { px?: number; onInk?: boolean }) {
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 600 600"
      aria-hidden
      className="shrink-0"
    >
      <g transform="translate(65 30) scale(1.12)">
        <path
          fill={onInk ? "#ffffff" : "var(--ink-900)"}
          fillRule="evenodd"
          d="M70 70 Q70 40 100 40 H300 L390 130 V420 Q390 450 360 450 H100 Q70 450 70 420 Z M110 85 V405 H350 V155 H285 Q260 155 260 130 V85 Z"
        />
        <path fill="var(--verified)" d="M270 45 L385 155 H290 Q270 155 270 135 Z" />
        <path fill="var(--signal-500)" d="M235 155 L145 310 H225 L190 460 L330 275 H245 Z" />
        <rect fill="var(--signal-500)" x="120" y="125" width="105" height="14" rx="7" />
        <rect fill="var(--signal-500)" x="120" y="165" width="80" height="14" rx="7" />
        <rect fill="var(--signal-500)" x="120" y="205" width="58" height="14" rx="7" />
      </g>
    </svg>
  );
}

export function Wordmark({ href = "/", size = "md", markOnly, onInk, className }: WordmarkProps) {
  const px = size === "sm" ? 22 : 26;
  const text = size === "sm" ? "text-[14px]" : "text-[15px]";
  const inner = (
    <span className={`inline-flex items-center gap-[9px] ${className ?? ""}`}>
      <Mark px={px} onInk={onInk} />
      {!markOnly && (
        <span
          className={`font-semibold tracking-[-0.01em] ${text} ${
            onInk ? "text-white" : "text-[var(--ink-900)]"
          }`}
        >
          Clutch
        </span>
      )}
    </span>
  );
  return href ? (
    <Link href={href} className="inline-flex" aria-label="Clutch home">
      {inner}
    </Link>
  ) : (
    inner
  );
}
