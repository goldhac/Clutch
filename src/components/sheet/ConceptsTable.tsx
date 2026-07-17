import type { Concept } from "@/contract/sheet-content";
import { Citation, ConfDot, InlineText, VerifiedStar } from "@/components/trust";

/**
 * ConceptsTable — the "Memorize cold" section (OutSpec §4 pattern 3).
 * Uses the .kvtable variant: indigo first column, tight rows, three
 * columns (Term / Def / conf-dot + citation).
 */
export interface ConceptsTableProps {
  concepts: Concept[];
}

export function ConceptsTable({ concepts }: ConceptsTableProps) {
  if (concepts.length === 0) return null;
  return (
    <section className="concepts">
      <h2>Memorize cold</h2>
      <table className="kvtable">
        <thead>
          <tr>
            <th>Term</th>
            <th>Def</th>
            <th>·</th>
          </tr>
        </thead>
        <tbody>
          {concepts.map((c, i) => (
            <tr key={i}>
              <td className="term">
                <VerifiedStar verified={c.verified} />
                <strong>
                  <InlineText text={c.term} />
                </strong>
              </td>
              <td>
                <InlineText text={c.def} />
              </td>
              <td className="meta">
                <ConfDot conf={c.conf} />
                <Citation src={c.src} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
