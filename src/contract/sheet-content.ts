/**
 * SheetContent — the engine's output contract, the renderer's input.
 *
 * Source of truth: docs/05-BUILD-PLAN.md §4 + docs/02-OUTPUT-SPEC.md §6.
 *
 * The model owns "what matters and how to phrase it tersely". This file
 * owns the shape of what it's allowed to say. Trust is the moat: every
 * ranked item carries a confidence dot + a source citation, and this
 * schema REJECTS a claim of high confidence that isn't backed by exam
 * evidence or multi-source corroboration.
 *
 *   - Renderer mapping: conf → green/gold/gray dot · verified → ★ prefix
 *     · src → small italic citation.
 *   - Density is a render argument, NOT part of this content.
 */
import { z } from "zod";

/* ──────────────────────────────────────────────────────────────────────
 * Confidence + the trust rule
 * ────────────────────────────────────────────────────────────────────── */

export const ConfSchema = z.enum(["high", "med", "low"]);
export type Conf = z.infer<typeof ConfSchema>;

/**
 * The trust rule (docs/02-OUTPUT-SPEC.md §6):
 *
 *   "Never emit a `high` confidence on weak (single-source, no-exam)
 *    signal. Weak signal → low + 'possible'."
 *
 * `conf: "high"` is accepted iff at least one of:
 *   - `verified === true`  (a prior exam directly confirms this item;
 *                           renderer adds the ★ prefix)
 *   - `src` mentions exam-grade evidence (exam, final, midterm, quiz,
 *                                          prior)
 *   - `src` contains a ";" delimiter, signalling multi-source
 *                                      corroboration (engine convention)
 *
 * Anything else → the schema rejects, the engine must downgrade to
 * "med" or "low". This stops the model from faking confidence — wrong
 * "highly likely" is the failure that kills retention.
 */
const EXAM_GRADE_RX = /\b(exam|final|midterm|quiz|prior)\b/i;

export function isHighConfAllowed(src: string, verified?: boolean): boolean {
  if (verified === true) return true;
  if (EXAM_GRADE_RX.test(src)) return true;
  if (src.includes(";")) return true;
  return false;
}

/**
 * Factory: build a Zod object schema that has the three "ranked-item"
 * fields (src, conf, verified) AND the trust rule attached.
 *
 * `extra` is the item-specific shape — name+why for a topic, formula+
 * vars+when+trap+ex for a formula, etc.
 */
function rankedItem<S extends z.ZodRawShape>(extra: S) {
  const base = z
    .object({
      ...extra,
      src: z.string().min(1, "src citation required (e.g. 'Slide 14', 'Past exam 2024 Q5')"),
      conf: ConfSchema,
      verified: z.boolean().optional(),
    })
    .strict();

  return base.superRefine((data, ctx) => {
    // Zod's generic inference widens these to `unknown` under the
    // factory; the schema guarantees their runtime types.
    const src = data.src as string;
    const conf = data.conf as Conf;
    const verified = data.verified as boolean | undefined;
    if (conf === "high" && !isHighConfAllowed(src, verified)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          `Trust rule: conf="high" requires verified=true OR an exam-grade src ` +
          `(mentioning exam/final/midterm/quiz/prior) OR multi-source citation ` +
          `using ";" as separator. Got src="${src}", verified=${verified ?? "undefined"}. ` +
          `Downgrade to "med" or "low".`,
        path: ["conf"],
      });
    }
  });
}

/* ──────────────────────────────────────────────────────────────────────
 * Item schemas
 * ────────────────────────────────────────────────────────────────────── */

export const TopicSchema = rankedItem({
  name: z.string().min(1),
  why: z.string().min(1),
});
export type Topic = z.infer<typeof TopicSchema>;

export const FormulaSchema = rankedItem({
  name: z.string().min(1),
  formula: z.string().min(1), // mono-rendered formula body
  vars: z.string().min(1), // variable definitions
  when: z.string().min(1), // when-to-use rule
  trap: z.string().min(1), // one-line trap
  ex: z.string().min(1), // micro example question
});
export type Formula = z.infer<typeof FormulaSchema>;

export const ConceptSchema = rankedItem({
  term: z.string().min(1),
  def: z.string().min(1),
});
export type Concept = z.infer<typeof ConceptSchema>;

export const QuestionKindSchema = z.enum(["MCQ", "short", "problem", "T/F"]);
export type QuestionKind = z.infer<typeof QuestionKindSchema>;

export const QuestionSchema = rankedItem({
  q: z.string().min(1),
  kind: QuestionKindSchema,
});
export type Question = z.infer<typeof QuestionSchema>;

/* Non-ranked items (no conf — the trust layer doesn't apply): */

export const TableSchema = z
  .object({
    title: z.string().min(1),
    cols: z.array(z.string().min(1)).min(2, "compare/contrast tables need ≥2 columns"),
    rows: z
      .array(z.array(z.string()))
      .min(1, "table needs at least one row"),
    src: z.string().min(1),
  })
  .strict()
  .superRefine((data, ctx) => {
    for (let i = 0; i < data.rows.length; i++) {
      if (data.rows[i].length !== data.cols.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `row ${i} has ${data.rows[i].length} cells; cols has ${data.cols.length}`,
          path: ["rows", i],
        });
      }
    }
  });
export type SheetTable = z.infer<typeof TableSchema>;

/** Named "X is FALSE because Y" callouts — inherently high-trust. */
export const TrapSchema = z
  .object({
    text: z
      .string()
      .min(1)
      .refine((t) => /false|incorrect|wrong|not\b/i.test(t), {
        message:
          'trap text must name the falsity (output spec §4): "X is FALSE because Y", ' +
          'not vague "be careful about X"',
      }),
    src: z.string().min(1),
  })
  .strict();
export type Trap = z.infer<typeof TrapSchema>;

/** Verified-exam-refactor output — surfaced FIRST on the sheet when present. */
export const VerifiedPatternSchema = z
  .object({
    pattern: z.string().min(1),
    src: z.string().min(1),
  })
  .strict();
export type VerifiedPattern = z.infer<typeof VerifiedPatternSchema>;

export const ExamFormatSchema = z
  .object({
    mix: z.string().min(1), // e.g. "8 MCQ (40%), 4 short (40%), 2 problems (20%)"
    time: z.string().optional(),
    openBook: z.boolean().optional(),
    notes: z.string().optional(),
  })
  .strict();
export type ExamFormat = z.infer<typeof ExamFormatSchema>;

/* ──────────────────────────────────────────────────────────────────────
 * Top-level SheetContent
 * ────────────────────────────────────────────────────────────────────── */

export const SheetContentSchema = z
  .object({
    title: z
      .string()
      .min(1)
      .refine(
        (t) =>
          /reference sheet|exam sheet|cheat ?sheet/i.test(t) || t.length >= 3,
        { message: "title should describe the sheet (e.g. 'Stats — Midterm 1 Reference Sheet')" },
      ),
    examFormat: ExamFormatSchema.optional(),
    verifiedPatterns: z.array(VerifiedPatternSchema).optional(),
    topics: z.array(TopicSchema),
    formulas: z.array(FormulaSchema),
    concepts: z.array(ConceptSchema),
    tables: z.array(TableSchema).optional(),
    traps: z.array(TrapSchema),
    questions: z.array(QuestionSchema),
  })
  .strict();

export type SheetContent = z.infer<typeof SheetContentSchema>;

/**
 * Parse + validate untrusted JSON (the model's output) into a typed
 * SheetContent. Throws a ZodError with all issues on failure — the
 * engine wraps this in a retry/repair loop in Step 6.
 */
export function parseSheetContent(input: unknown): SheetContent {
  return SheetContentSchema.parse(input);
}

/** Non-throwing variant for callers that want to format their own errors. */
export function safeParseSheetContent(input: unknown) {
  return SheetContentSchema.safeParse(input);
}
