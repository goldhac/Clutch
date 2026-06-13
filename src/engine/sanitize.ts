/**
 * sanitize.ts — post-processor that enforces trust-layer authenticity
 * the Zod schema alone CAN'T enforce.
 *
 * Why this exists (the moat-breaking case caught in the first smoke
 * test): a past_exam-tagged PDF that's image-only/scanned extracts to
 * <100 chars. Gemini still emits `verified: true` items citing it
 * — inferring question numbers from the filename, not the content.
 * That's the "I lied about the exam" failure mode the product can't
 * survive. Zod can't catch it because the SCHEMA is satisfied (src is
 * a string, verified is a boolean).
 *
 * What we do:
 *  1. Identify pack files that won't pass a content-availability check:
 *       past_exam tag AND text.length < MIN_PAST_EXAM_CHARS
 *  2. For any item whose `src` cites one of those files:
 *       - strip `verified: true`
 *       - if `conf === "high"` would no longer pass the trust rule
 *         (no exam-grade keyword, no ";"), downgrade to "med"
 *  3. Drop verifiedPatterns entries that cite those files
 *  4. Emit human-readable warnings the UI shows the student
 *
 * Also: warn (without downgrading) on any non-past-exam file that
 * extracted to very few chars — the student should know we couldn't
 * read it well, even if the engine didn't try to fake verification.
 */
import type { SheetContent } from "@/contract/sheet-content";
import { isHighConfAllowed } from "@/contract/sheet-content";
import type { PackFile } from "./prompt";

/** Below this length, treat a past_exam file as "no content available". */
export const MIN_PAST_EXAM_CHARS = 100;

/** Below this length, warn the student that the file barely read. */
export const MIN_USEFUL_CHARS = 500;

export interface PackFileMeta {
  filename: string;
  tag: PackFile["tag"];
  charCount: number;
}

export interface SanitizeResult {
  content: SheetContent;
  warnings: string[];
  /** How many ranked items had verified=true stripped. */
  stripped: number;
  /** verifiedPatterns dropped because the past exam they cite was empty. */
  droppedPatterns: number;
}

/**
 * Returns true if `src` plausibly cites `filename`.
 *
 * Substring match against the filename and its extension-less stem.
 * False positives are acceptable here — stripping a real verified flag
 * is OK; faking one isn't.
 */
function citationMatchesFile(src: string, filename: string): boolean {
  const s = src.toLowerCase();
  const fn = filename.toLowerCase();
  const stem = fn.replace(/\.[a-z0-9]+$/i, "");
  return s.includes(fn) || s.includes(stem);
}

/**
 * Generic "past exam" phrasings that don't name a specific file. The
 * prompt now instructs the model to ALWAYS include the filename; this
 * is the defensive catch when it doesn't.
 */
const GENERIC_PAST_EXAM_RX =
  /\b(past[ -]?exam|past[ -]?quiz|past[ -]?midterm|past[ -]?final|prior[ -]?(exam|quiz|midterm|final)|previous[ -]?exam)\b/i;

export function sanitizeForTrust(
  content: SheetContent,
  packMeta: PackFileMeta[],
): SanitizeResult {
  const warnings: string[] = [];
  let stripped = 0;
  let droppedPatterns = 0;

  // ── Step 1: identify untrustworthy past_exam files ──
  // Also track whether ANY past_exam file in the pack has real content
  // — if none do, generic "Past Exam" citations can be stripped too.
  const untrustworthy = new Set<string>(); // lower-cased filename
  const allPastExams = packMeta.filter((f) => f.tag === "past_exam");
  const anyPastExamHasContent = allPastExams.some(
    (f) => f.charCount >= MIN_PAST_EXAM_CHARS,
  );
  for (const f of packMeta) {
    if (f.tag === "past_exam" && f.charCount < MIN_PAST_EXAM_CHARS) {
      untrustworthy.add(f.filename.toLowerCase());
      warnings.push(
        `"${f.filename}" was tagged as a past exam but only ${f.charCount} characters of text could be extracted ` +
          `(probably an image-only / scanned PDF). Any items the engine claimed were verified by this file have been ` +
          `auto-downgraded. For best results, use a text-based PDF, or paste the exam questions as plain text.`,
      );
    } else if (f.tag !== "past_exam" && f.charCount < MIN_USEFUL_CHARS) {
      warnings.push(
        `"${f.filename}" extracted only ${f.charCount} characters — it may be image-heavy or scanned. ` +
          `The engine relied on whatever text it could read.`,
      );
    }
  }
  if (untrustworthy.size === 0) {
    return { content, warnings, stripped: 0, droppedPatterns: 0 };
  }

  // ── Step 2: strip verified + downgrade conf for cited items ──
  // Three triggers count as "cites a low-content past exam":
  //   1. src includes the filename/stem of an untrustworthy file
  //   2. src uses generic "Past Exam" phrasing AND no past_exam file
  //      in the pack has real content (engine can't be backed by any)
  //   3. always strip if the src matches both — covers mixed phrasing
  const fix = <T extends { src: string; conf?: string; verified?: boolean }>(item: T): T => {
    const matchesUntrustworthy = Array.from(untrustworthy).some((fn) =>
      citationMatchesFile(item.src, fn),
    );
    const matchesGeneric =
      !anyPastExamHasContent && GENERIC_PAST_EXAM_RX.test(item.src);
    const cites = matchesUntrustworthy || matchesGeneric;
    if (!cites) return item;
    let changed = false;
    const next = { ...item };
    if (next.verified === true) {
      next.verified = false;
      changed = true;
    }
    if (next.conf === "high") {
      // The Zod trust rule needs verified=true OR exam-grade-src OR
      // ";"-multisource. We just removed verified. If neither of the
      // other paths is true, downgrade.
      if (!isHighConfAllowed(next.src, false)) {
        next.conf = "med";
        changed = true;
      }
    }
    if (changed) stripped++;
    return next;
  };

  const sanitized: SheetContent = {
    ...content,
    topics: content.topics.map(fix),
    formulas: content.formulas.map(fix),
    concepts: content.concepts.map(fix),
    questions: content.questions.map(fix),
  };

  // ── Step 3: drop verifiedPatterns whose only evidence is empty ──
  if (sanitized.verifiedPatterns) {
    const before = sanitized.verifiedPatterns.length;
    sanitized.verifiedPatterns = sanitized.verifiedPatterns.filter((vp) => {
      const matchesUntrustworthy = Array.from(untrustworthy).some((fn) =>
        citationMatchesFile(vp.src, fn),
      );
      const matchesGeneric =
        !anyPastExamHasContent && GENERIC_PAST_EXAM_RX.test(vp.src);
      return !(matchesUntrustworthy || matchesGeneric);
    });
    droppedPatterns = before - sanitized.verifiedPatterns.length;
    if (droppedPatterns > 0) {
      warnings.push(
        `Dropped ${droppedPatterns} "verified Q pattern${droppedPatterns === 1 ? "" : "s"}" because the past-exam file they cited had no readable text.`,
      );
    }
    // If we emptied the array, omit it entirely — the renderer treats
    // empty + undefined identically, but undefined is cleaner.
    if (sanitized.verifiedPatterns.length === 0) {
      delete sanitized.verifiedPatterns;
    }
  }

  return { content: sanitized, warnings, stripped, droppedPatterns };
}
