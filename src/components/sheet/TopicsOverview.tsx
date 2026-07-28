import type { Topic } from "@/contract/sheet-content";
import { Citation, ConfDot, InlineText, VerifiedStar } from "@/components/trust";

/**
 * TopicsOverview — "What's on this sheet" (the compact strip that
 * sits in the first column of the flow). Not one of the six proven
 * patterns, but load-bearing for navigation: it's the sheet's TOC.
 */
export interface TopicsOverviewProps {
  topics: Topic[];
  /** Optional topic color class per index (topics-color.ts) — renders a
   * colored bullet so this list doubles as the topic key. */
  colorClass?: (index: number) => string;
}

export function TopicsOverview({ topics, colorClass }: TopicsOverviewProps) {
  if (topics.length === 0) return null;
  return (
    <section className="topics no-break">
      <h2>On this sheet</h2>
      <ul>
        {topics.map((t, i) => (
          <li key={i} className={colorClass ? colorClass(i) : undefined}>
            {colorClass && <i className="tkdot" />}
            <VerifiedStar verified={t.verified} />
            <strong>
              <InlineText text={t.name} />
            </strong>
            <ConfDot conf={t.conf} />
            <span className="why">
              <InlineText text={t.why} />
            </span>
            <Citation src={t.src} />
          </li>
        ))}
      </ul>
    </section>
  );
}
