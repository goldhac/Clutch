import type { Formula } from "@/contract/sheet-content";
import { Citation, ConfDot, InlineText, VerifiedStar } from "@/components/trust";

/**
 * FormulaBlock — the workhorse pattern (OutSpec §5).
 *
 * Title row: ★ (if verified) + name + confidence dot
 * Formula box: dark-bg mono. Multi-line formulas render as <pre>
 *              (engine may emit \n-separated clusters like acc/prec/rec/F1).
 * Rows: vars / use / ⚠ trap / Q worked example + citation
 *
 * `trap` and `ex` are optional in the contract; skip the row when
 * absent (a MongoDB shell command may have no meaningful worked
 * example, and forcing one would push the model to hallucinate).
 */
export interface FormulaBlockProps {
  formula: Formula;
}

export function FormulaBlock({ formula: f }: FormulaBlockProps) {
  const isMultiline = f.formula.includes("\n");
  return (
    <div className="formula-block topic">
      <div className="title">
        <VerifiedStar verified={f.verified} />
        <strong>
          <InlineText text={f.name} />
        </strong>
        <ConfDot conf={f.conf} />
      </div>
      {isMultiline ? (
        <pre className="formula">{f.formula}</pre>
      ) : (
        <div className="formula">{f.formula}</div>
      )}
      <div className="row">
        <span className="lbl">vars</span> <InlineText text={f.vars} />
      </div>
      <div className="row">
        <span className="lbl">use</span> <InlineText text={f.when} />
      </div>
      {f.trap && (
        <div className="row trap-line">
          <span className="lbl">⚠ trap</span> <InlineText text={f.trap} />
        </div>
      )}
      {f.ex ? (
        <div className="row ex-line">
          <span className="lbl">Q</span> <InlineText text={f.ex} />{" "}
          <Citation src={f.src} />
        </div>
      ) : (
        <div className="row ex-line">
          <Citation src={f.src} />
        </div>
      )}
    </div>
  );
}
