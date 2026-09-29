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
                <ConfDot conf={c.conf} mine={c.mine} />
                <Citation src={c.src} mine={c.mine} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/**
 * ConceptRow — the same concept as a row-block rather than a table row.
 *
 * Not a variant of ConceptsTable: that renders a <table>, this renders a div the fitter can
 * measure and move on its own. The sheet views use THIS one; the table is the standalone
 * presentation.
 *
 * It lives here because it lived twice — copied into FittedSheet and TwoPageSheet — and the copies
 * cost three real bugs in one day (2026-09-29): the `you` marker on an edited line rendered from
 * neither copy, and before that the same duplication hid the table marker and hid the fitter's
 * pinning rule from the default view. A component rendered in two places belongs in one.
 */
export function ConceptRow({ concept: c }: { concept: Concept }) {
  return (
    <div className="concept-row">
      <div className="term">
        <VerifiedStar verified={c.verified} />
        <strong><InlineText text={c.term} /></strong>
      </div>
      <div className="def">
        <InlineText text={c.def} />
        {c.ex && (
          <span className="cex"> Example: <InlineText text={c.ex} /></span>
        )}
      </div>
      <div className="meta">
        <ConfDot conf={c.conf} mine={c.mine} />
        <Citation src={c.src} mine={c.mine} />
      </div>
    </div>
  );
}
