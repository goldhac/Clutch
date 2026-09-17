/**
 * format-repair.ts — make a format sheet actually have the format's shape (issue #11).
 *
 * The contract audit showed the prompt is followed most of the time, not always: one
 * multiple-choice sheet in three came back without the "not X: why" half of its answers,
 * and one True/False sheet was 7 TRUE / 17 FALSE. A prompt rule can't fix what a prompt
 * rule already failed to do, so this checks the shape and, only when it is off, asks the
 * edit engine for a small patch — Flash, a few seconds, edits to questions only, each one
 * validated like any other edit. Best effort: on any failure the sheet ships as it was.
 */
import type { SheetContent } from "@/contract/sheet-content";
import { applyOps, proposeEdit } from "./edit";
import type { ExamFormat } from "./prompt";

const NOT_X = /—\s*not\b|\bnot\s+[^:]{2,80}:/i;

export function formatShape(content: SheetContent) {
  const tf = content.questions.filter((q) => q.kind === "T/F");
  const falseN = tf.filter((q) => /^\s*false\b/i.test(q.a)).length;
  const mcq = content.questions.filter((q) => q.kind === "MCQ");
  return {
    tf: tf.length,
    falseShare: tf.length ? falseN / tf.length : 0.5,
    mcq: mcq.length,
    mcqWithDistractor: mcq.filter((q) => NOT_X.test(q.a)).length,
  };
}

export async function repairForFormat(
  content: SheetContent,
  format: ExamFormat,
  opts: { packText?: string; files?: string[] } = {},
): Promise<{ content: SheetContent; repaired: string | null }> {
  const shape = formatShape(content);
  let instruction: string | null = null;

  if (format === "multiple-choice" && shape.mcq >= 4 && shape.mcqWithDistractor < shape.mcq * 0.6) {
    instruction =
      "Edit every MCQ question whose answer lacks it: keep the correct answer, then append " +
      "' — not <the most tempting wrong option>: <why it is wrong>', grounded in the pack. Change nothing else.";
  } else if (format === "true-false" && shape.tf >= 8 && (shape.falseShare > 0.6 || shape.falseShare < 0.4)) {
    // Direction comes from which side of even the split is on — never from the trigger threshold
    // (at 0.63 FALSE a stale "> 0.65" here rewrote TRUE statements and made the split worse).
    const many = shape.falseShare > 0.5 ? "FALSE" : "TRUE", few = many === "FALSE" ? "TRUE" : "FALSE";
    const n = Math.round(Math.abs(shape.falseShare - 0.5) * shape.tf);
    instruction =
      `Rebalance the T/F questions: rewrite ${n} of the ${many} statements as ${few} statements about the same fact ` +
      `(answer starts '${few} —'), keeping each citation. Change nothing else.`;
  }
  if (!instruction) return { content, repaired: null };

  try {
    const p = await Promise.race([
      proposeEdit(content, instruction, opts),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("format repair timed out")), 45_000)),
    ]);
    // Only what was asked for: edits to questions. Anything else the model volunteered is ignored.
    const ops = p.ops.filter((o) => o.op === "edit" && o.section === "questions");
    if (!ops.length) return { content, repaired: null };
    const next = applyOps(content, ops);
    const after = formatShape(next);
    // A repair that leaves the shape worse than it found it is thrown away.
    const worse =
      format === "true-false"
        ? Math.abs(after.falseShare - 0.5) > Math.abs(shape.falseShare - 0.5)
        : after.mcqWithDistractor < shape.mcqWithDistractor;
    if (worse) {
      return { content, repaired: `discarded (made it worse: FALSE share ${shape.falseShare.toFixed(2)}→${after.falseShare.toFixed(2)} · MCQ with distractor ${shape.mcqWithDistractor}→${after.mcqWithDistractor})` };
    }
    return { content: next, repaired: `${format}: ${ops.length} question(s) reshaped · FALSE share ${shape.falseShare.toFixed(2)}→${after.falseShare.toFixed(2)} · MCQ with distractor ${shape.mcqWithDistractor}/${shape.mcq}→${after.mcqWithDistractor}/${after.mcq}` };
  } catch (e) {
    return { content, repaired: `skipped (${e instanceof Error ? e.message.slice(0, 80) : "error"})` };
  }
}
