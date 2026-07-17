import type { SheetTable } from "@/contract/sheet-content";
import { Citation, InlineText } from "@/components/trust";

/**
 * CompareTable — proven pattern for "when to use X vs Y" content
 * (OutSpec §4 pattern 2). Wrapped in .no-break so a formula-adjacent
 * table doesn't get orphaned at a column boundary.
 */
export interface CompareTableProps {
  table: SheetTable;
}

export function CompareTable({ table: t }: CompareTableProps) {
  return (
    <section className="compare-table no-break">
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
      <div className="src-line">
        <Citation src={t.src} />
      </div>
    </section>
  );
}
