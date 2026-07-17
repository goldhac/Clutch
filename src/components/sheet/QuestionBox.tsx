import type { Question } from "@/contract/sheet-content";
import { Citation, ConfDot, InlineText, VerifiedStar } from "@/components/trust";

/**
 * QuestionBox — the .qq indigo-left-rule box (OutSpec §4 pattern 6).
 * kind chip (MCQ/short/problem/T/F) + ★ + question + conf dot + citation.
 */
export interface QuestionBoxProps {
  question: Question;
}

export function QuestionBox({ question: q }: QuestionBoxProps) {
  return (
    <li className="qq">
      <VerifiedStar verified={q.verified} />
      <span className="kind">{q.kind}</span> <InlineText text={q.q} />{" "}
      <ConfDot conf={q.conf} />
      <Citation src={q.src} />
    </li>
  );
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
