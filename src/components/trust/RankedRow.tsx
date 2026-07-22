import type { Conf } from "@/contract/sheet-content";
import { ConfDot } from "./ConfDot";
import { VerifiedStar } from "./VerifiedStar";
import { Citation } from "./Citation";

/**
 * RankedRow — the "most-likely-tested" list row (design's trust-layer
 * signature). dot + ★ + title + mono citation + rank badge. Appears in
 * the results rail and anywhere ranked items are listed in the app
 * (as opposed to the print sheet, which composes these inline).
 */
export interface RankedRowProps {
  rank?: number;
  title: string;
  conf: Conf;
  verified?: boolean;
  src: string;
  className?: string;
}

export function RankedRow({ rank, title, conf, verified, src, className }: RankedRowProps) {
  return (
    <div
      className={`flex items-start gap-2.5 rounded-[var(--r-md)] border border-[var(--ink-150)] bg-white px-3 py-2.5 shadow-[var(--sh-xs)]${className ? ` ${className}` : ""}`}
    >
      <span className="mt-1 shrink-0">
        <ConfDot conf={conf} ring size={9} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--ink-900)]">
          <VerifiedStar verified={verified} />
          <span className="truncate">{title}</span>
        </div>
        <Citation src={src} className="mt-0.5 block" />
      </div>
      {rank != null && (
        <span className="shrink-0 font-mono text-[11px] font-semibold text-[var(--ink-400)]">
          #{rank}
        </span>
      )}
    </div>
  );
}
