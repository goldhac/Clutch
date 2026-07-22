import Link from "next/link";

/**
 * Wordmark — the ink rounded-square mark (white sheet glyph) + CramSheet
 * lettering, from the design handoff. Placeholder brand until the final
 * logo lands; kept as one component so the eventual swap is one edit.
 */
export interface WordmarkProps {
  href?: string;
  size?: "sm" | "md";
  /** hide the text, mark only (favicons, tight chrome) */
  markOnly?: boolean;
  className?: string;
}

export function Mark({ px = 26 }: { px?: number }) {
  return (
    <span
      className="flex items-center justify-center rounded-[var(--r-sm)] bg-[var(--ink-900)]"
      style={{ width: px, height: px }}
      aria-hidden
    >
      <svg
        width={px * 0.58}
        height={px * 0.58}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#fff"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 4h11l5 5v11H4z" />
        <path d="M15 4v5h5" />
        <path d="M8 13h8M8 16.5h5" />
      </svg>
    </span>
  );
}

export function Wordmark({ href = "/", size = "md", markOnly, className }: WordmarkProps) {
  const px = size === "sm" ? 24 : 26;
  const text = size === "sm" ? "text-[14px]" : "text-[15px]";
  const inner = (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <Mark px={px} />
      {!markOnly && (
        <span className={`font-semibold tracking-[-0.01em] text-[var(--ink-900)] ${text}`}>
          CramSheet
        </span>
      )}
    </span>
  );
  return href ? (
    <Link href={href} className="inline-flex" aria-label="CramSheet home">
      {inner}
    </Link>
  ) : (
    inner
  );
}
