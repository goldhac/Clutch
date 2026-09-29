import type { SheetTable } from "@/contract/sheet-content";
import { Citation, InlineText } from "@/components/trust";

/**
 * CompareTable — proven pattern for "when to use X vs Y" content
 * (OutSpec §4 pattern 2). Wrapped in .no-break so a formula-adjacent
 * table doesn't get orphaned at a column boundary.
 *
 * The markup itself lives in CompareTableBody, which the fitted sheet
 * views render directly — they must NOT get the .no-break wrapper,
 * because their FitLeaf already owns break behavior.
 */
export interface CompareTableProps {
  table: SheetTable;
}

export function CompareTableBody({ table: t }: CompareTableProps) {
  return (
    <div className="compare-table">
      <h3>
        <InlineText text={t.title} />
      </h3>
      <table>
        <thead>
          <tr>
            {t.cols.map((c, i) => (
              <th key={i}>
                <InlineText text={c} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci}>
                  <InlineText text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {/*
        The wrapper class changes with ownership, not just the marker inside it. `.src-line` is
        hidden wholesale when the student turns sources off, which would take a `you` nested inside
        it along for the ride — the table would silently stop saying it was theirs (#20).
      */}
      <div className={t.mine ? "src-line-mine" : "src-line"}>
        <Citation src={t.src} mine={t.mine} />
      </div>
    </div>
  );
}

export function CompareTable({ table }: CompareTableProps) {
  return (
    <section className="no-break">
      <CompareTableBody table={table} />
    </section>
  );
}
