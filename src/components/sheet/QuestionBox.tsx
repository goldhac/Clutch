import type { Question } from "@/contract/sheet-content";
import { Citation, ConfDot, InlineText, VerifiedStar } from "@/components/trust";

/**
 * QuestionBox — the .qq indigo-left-rule box (OutSpec §4 pattern 6).
 * kind chip (MCQ/short/problem/T/F) + ★ + question + conf dot + citation.
 */
export interface QuestionBoxProps {
  question: Question;
  /** When true, render just the inner content (no <li> wrapper) — the
   * caller (FittedSheet's FitLeaf) supplies the <li className="qq">. */
  bare?: boolean;
}

export function QuestionBox({ question: q, bare = false }: QuestionBoxProps) {
  // A True/False sheet prints FALSE statements on purpose. Mark the verdict BEFORE the statement
  // so a skimming eye never takes a false claim for a fact. Hidden with the answers (self-test).
  const verdict = q.kind === "T/F" ? /^\s*(true|false)\b/i.exec(q.a)?.[1].toLowerCase() : undefined;
  // Claim check: in a FALSE statement the lie usually lives in one absolute word. Mark it, so the
  // sheet teaches the pattern ("always" → look for the exception), not just this one answer.
  const statement =
    verdict === "false" && !q.q.includes("*")
      ? q.q.replace(/\b(always|never|all|none|only|every|must|cannot|entirely|solely|exclusively|any|no)\b/i, "*$1*")
      : q.q;
  const inner = (
    <>
      <VerifiedStar verified={q.verified} />
      {verdict && (
        <span className={`verdict v-${verdict}`} aria-label={verdict === "false" ? "False statement" : "True statement"}>
          {verdict === "false" ? "✗" : "✓"}
        </span>
      )}
      <span className="kind">{q.kind}</span> <InlineText text={statement} />{" "}
      <span className="ans">
        <span className="ans-arrow">→</span> <InlineText text={q.a} />
      </span>{" "}
      <ConfDot conf={q.conf} />
      <Citation src={q.src} />
    </>
  );
  if (bare) return inner;
  return <li className="qq">{inner}</li>;
}

/** Batched — the "Likely questions" section. */
export function QuestionsSection({ questions }: { questions: Question[] }) {
  if (questions.length === 0) return null;
  return (
    <section className="qa-section">
      <h2>Likely questions</h2>
      <ul className="qa-list">
        {questions.map((q, i) => (
          <QuestionBox key={i} question={q} />
        ))}
      </ul>
    </section>
  );
}
