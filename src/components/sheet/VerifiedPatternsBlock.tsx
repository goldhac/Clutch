import type { VerifiedPattern } from "@/contract/sheet-content";
import { Citation, InlineText } from "@/components/trust";

/**
 * VerifiedPatternsBlock — the gold-tinted "★ Verified Q Patterns"
 * strip surfaced FIRST when a past exam is in the pack (Playbook §9 /
 * OutSpec §7). Highest-leverage block on the whole sheet: it's the
 * proof the prior exam actually shaped the ranking.
 *
 * Uses column-span:all so it spans the full width above the columns.
 */
export interface VerifiedPatternsBlockProps {
  patterns?: VerifiedPattern[];
}

export function VerifiedPatternsBlock({ patterns }: VerifiedPatternsBlockProps) {
  if (!patterns || patterns.length === 0) return null;
  return (
    <section className="verified-patterns">
      <h2>
        <span className="verified-star">★</span> Verified Q Patterns{" "}
        <span className="hint">(from a prior exam — drill these first)</span>
      </h2>
      <ul>
        {patterns.map((p, i) => (
          <li key={i}>
            <InlineText text={p.pattern} /> <Citation src={p.src} />
          </li>
        ))}
      </ul>
    </section>
  );
}
