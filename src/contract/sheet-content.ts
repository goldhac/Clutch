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
      /**
       * Which topics[] entry this item belongs to — MUST be an exact copy
       * of one topics[].name. Drives the topic-grouped layout + color key.
       * Optional for back-compat (older pools infer it by keyword match),
       * but the engine prompt requires it.
       */
      topic: z.string().min(1).optional(),
      /**
       * The student wrote this, or edited it (#20). The line is theirs: the citation slot renders
       * `you` whatever `src` still holds, the fitter may never trim it, and it can never carry the
       * verified star.
       *
       * `src` is deliberately kept rather than blanked. An edited line keeps the citation it came
       * from as a provenance trail — useful to the student, and to us when something looks wrong —
       * while `mine` is what the renderer and the fitter actually read. Never set by the model:
       * the engine prompt does not mention it, and a draft arriving with `mine` set would be a
       * model claiming to be the student.
       */
      mine: z.literal(true).optional(),
    })
    .strict();

  return base.superRefine((data, ctx) => {
    // Zod's generic inference widens these to `unknown` under the
    // factory; the schema guarantees their runtime types.
    const src = data.src as string;
    const conf = data.conf as Conf;
    const verified = data.verified as boolean | undefined;
    const mine = data.mine as true | undefined;

    /**
     * A line the student wrote cannot be one we verified. The star means "we checked this against
     * your files"; on their own words it would be a false claim, and the whole two-kinds-of-line
     * model rests on it never appearing there.
     *
     * conf="high" needs no separate rule: a student line's src is not exam-grade and carries no
     * ";", so `isHighConfAllowed` already refuses it below.
     */
    if (mine && verified === true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          `A student's own line cannot be verified=true — the star means Clutch checked it ` +
          `against their files, and we did not write this one.`,
        path: ["verified"],
      });
    }

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
  // trap + ex are optional — not every formula has a meaningful trap or
  // worked example (a MongoDB shell command, say). Requiring them led
  // to hallucinations under the "never invent" prompt rules; better to
  // let the model omit than fabricate.
  trap: z.string().min(1).optional(),
  ex: z.string().min(1).optional(),
});
export type Formula = z.infer<typeof FormulaSchema>;

export const ConceptSchema = rankedItem({
  term: z.string().min(1),
  def: z.string().min(1),
  /** Concrete example — the prompt demands one per definition; models
   * naturally emit it as its own field, so the contract accepts it. */
  ex: z.string().min(1).optional(),
});
export type Concept = z.infer<typeof ConceptSchema>;

export const QuestionKindSchema = z.enum(["MCQ", "short", "problem", "T/F"]);
export type QuestionKind = z.infer<typeof QuestionKindSchema>;

export const QuestionSchema = rankedItem({
  q: z.string().min(1),
  kind: QuestionKindSchema,
  /**
   * The ANSWER. Required — this is an exam-room reference sheet, not a
   * quiz. A question without its answer burns space and causes panic at
   * the exact moment the student can least afford it. (Historically this
   * field didn't exist: hand-written pools smuggled answers into `q` as
   * "→ …" while the engine emitted bare questions, so ~100% of generated
   * questions were unanswerable. Making it a required field is what
   * actually enforces the rule.)
   */
  a: z
    .string()
    .min(1, "every likely question MUST carry its answer (output spec §4)")
    // An answer that admits it doesn't know is not an answer — it's dead
    // weight on a page where space is the scarcest resource. The prompt
    // says to DROP such questions; this makes the model actually do it
    // instead of hedging ("the specific answer is unknown, but…").
    .refine(
      (a) =>
        !/\b(answer is unknown|unknown, but|cannot be determined|can't be determined|not specified in|not provided in|unclear from|see above|refer to the)\b/i.test(
          a,
        ),
      {
        message:
          "answer must actually ANSWER — no 'unknown', 'cannot be determined', or 'see above'. " +
          "If the pack doesn't support an answer, DROP the question instead.",
      },
    ),
});
export type Question = z.infer<typeof QuestionSchema>;

/* Non-ranked items (no conf — the trust layer doesn't apply): */

export const TableSchema = z
  .object({
    title: z.string().min(1),
    // The first header may be blank: a matrix table's top-left corner labels nothing
    // (co-occurrence, confusion and CKY tables — 5 rejections in the 2026-09-17 audit).
    cols: z
      .array(z.string())
      .min(2, "compare/contrast tables need ≥2 columns")
      .refine((cols) => cols.every((c, i) => i === 0 || c.trim().length > 0), {
        message: "only the first column header may be blank",
      }),
    rows: z
      .array(z.array(z.string()))
      .min(1, "table needs at least one row"),
    src: z.string().min(1),
    /** Owning topic — exact topics[].name (see rankedItem.topic). */
    topic: z.string().min(1).optional(),
    /**
     * The student wrote or edited this table (#20). Same meaning as `mine` on a ranked item:
     * reads `you`, pinned against the fitter, never ours to vouch for.
     *
     * A table needs no star rule because it has no `conf` or `verified` to begin with — the trust
     * layer never applied here. It was left out of the first pass only because the citation change
     * failed to compile, which is a description of the code, not a reason: a comparison table is
     * one of the things students most often build for themselves.
     */
    mine: z.literal(true).optional(),
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
      // "…is a mistake" and "never…" name the falsity as plainly as "is FALSE" does.
      .refine((t) => /false|incorrect|wrong|not\b|n't\b|never|mistake|myth|misconception|error\b/i.test(t), {
        message:
          'trap text must name the falsity (output spec §4): "X is FALSE because Y", ' +
          'not vague "be careful about X"',
      }),
    src: z.string().min(1),
    /** Owning topic — exact topics[].name (see rankedItem.topic). */
    topic: z.string().min(1).optional(),
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

/**
 * A diagram cut out of the student's own materials (issue #15). Attached by the server after
 * generation — the engine never writes these — and placed only when the student picks it.
 */
export const FigureSchema = z
  .object({
    id: z.string().min(1),
    caption: z.string(),
    what: z.string(),
    /** "21-attn.pdf p35" — same citation style as every other line. */
    src: z.string().min(1),
    importance: z.number(),
    /** data:image/jpeg;base64,… — capped so a sheet stays small enough to store and post. */
    image: z.string().startsWith("data:image/").max(400_000),
    w: z.number().int().positive(),
    h: z.number().int().positive(),
    /** Owning topic — exact topics[].name. */
    topic: z.string().min(1).optional(),
  })
  .strict();
export type SheetFigure = z.infer<typeof FigureSchema>;

/**
 * A student's own note (#20) — the thing that fits none of the item shapes: a mnemonic, something
 * the professor said out loud, the one step they always get wrong.
 *
 * Not a ranked item on purpose. It has no `src`, no `conf` and no `verified`, because there is
 * nothing to cite and nothing for us to check — it is theirs, it is pinned, and it renders as its
 * own block rather than impersonating a definition.
 */
export const NoteSchema = z
  .object({
    /** Stable across edits and reorders, so version history can follow one note. */
    id: z.string().min(1),
    /** The topic it belongs to, or absent for the "Your notes" group. */
    topic: z.string().min(1).optional(),
    /** Short by design: a sheet is dense, and a note that needs a paragraph belongs in their notes app. */
    text: z.string().min(1).max(400),
    createdAt: z.string().min(1),
  })
  .strict();
export type SheetNote = z.infer<typeof NoteSchema>;

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
    figures: z.array(FigureSchema).max(12).optional(),
    /** The student's own free-text blocks (#20). Optional: every sheet saved before this existed. */
    notes: z.array(NoteSchema).max(40).optional(),
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
