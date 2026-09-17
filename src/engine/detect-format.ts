/**
 * detect-format.ts — read the exam format off a past exam (issue #11).
 *
 * A student who uploads last year's exam should not also have to tell us it was
 * True/False. No model call: exams announce their format in their layout — option lines
 * "(a) … (b) …", "True or False", "Calculate …". When no format clearly dominates, the
 * answer is "mixed", which is also what we did before.
 */
import type { ExamFormat } from "./prompt";

export interface FormatSignals { mcq: number; tf: number; problem: number; short: number }

export function detectExamFormat(text: string): { format: ExamFormat; signals: FormatSignals } {
  const lines = text.split(/\r?\n/);
  let optionLines = 0, tf = 0, problem = 0, short = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^\(?[a-eA-E][).]\s+\S/.test(line)) optionLines++;
    if (/\btrue\s*(\/|or)\s*false\b|\bT\s*\/\s*F\b|^\(?\s*(true|false|t|f)\s*\)?\s*[_:.)-]/i.test(line)) tf++;
    if (/\b(calculate|compute|derive|solve|evaluate|find the (value|probability|number|derivative|integral)|show that|how many)\b/i.test(line)) problem++;
    if (/\b(explain|describe|define|discuss|compare|briefly|in one or two sentences|what is meant by|why does|why is)\b/i.test(line)) short++;
  }
  // Four option lines make one multiple-choice question.
  const signals: FormatSignals = { mcq: Math.round(optionLines / 4), tf, problem, short };
  const total = signals.mcq + signals.tf + signals.problem + signals.short;
  if (total < 4) return { format: "mixed", signals };
  const share = (n: number) => n / total;
  // One format must clearly dominate; otherwise the exam really is mixed.
  if (share(signals.tf) >= 0.55) return { format: "true-false", signals };
  if (share(signals.mcq) >= 0.55) return { format: "multiple-choice", signals };
  if (share(signals.problem) >= 0.55) return { format: "problems", signals };
  if (share(signals.short) >= 0.6) return { format: "short-answer", signals };
  return { format: "mixed", signals };
}
