import type { Topic } from "@/contract/sheet-content";
import { Citation, ConfDot, InlineText, VerifiedStar } from "@/components/trust";

/**
 * TopicsOverview — "What's on this sheet" (the compact strip that
 * sits in the first column of the flow). Not one of the six proven
 * patterns, but load-bearing for navigation: it's the sheet's TOC.
 */
export interface TopicsOverviewProps {
  topics: Topic[];
}

export function TopicsOverview({ topics }: TopicsOverviewProps) {
  if (topics.length === 0) return null;
  return (
    <section className="topics no-break">
      <h2>On this sheet</h2>
      <ul>
        {topics.map((t, i) => (
          <li key={i}>
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
