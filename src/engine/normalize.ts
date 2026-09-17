/**
 * normalize.ts — deterministic clean-up of the model's draft BEFORE validation.
 *
 * Measured 2026-09-17 (scripts/contract-audit.ts, six packs): 4 of 6 first
 * drafts broke the contract, and nearly every break was one of four slips the
 * prompt already forbids in plain words — so another sentence in the prompt
 * won't fix them, but code can, without loosening any rule:
 *
 *   31×  conf:"high" with no exam evidence   → downgraded to "med" (the rule's
 *        own remedy; sanitizeForTrust does the same thing after validation)
 *   17×  question without a "kind"           → inferred from the question text
 *   16×  conf:"medium"                       → "med"
 *    3×  trap carrying a "conf" key          → removed (traps are unranked)
 *
 * Every change here is conservative: confidence only ever goes DOWN, nothing
 * is invented, and an item that is genuinely broken (no citation, no answer)
 * is left for validation to reject.
 */
import { isHighConfAllowed } from "@/contract/sheet-content";

const RANKED = ["topics", "formulas", "concepts", "questions"] as const;

const CONF_SYNONYMS: Record<string, "high" | "med" | "low"> = {
  high: "high", hi: "high", h: "high",
  med: "med", medium: "med", mid: "med", moderate: "med", m: "med",
  low: "low", lo: "low", l: "low",
};

function inferKind(q: string, a: string): "MCQ" | "short" | "problem" | "T/F" {
  if (/^\s*(true or false|t\/f|true\/false)\b/i.test(q) || /^\s*(true|false)\b/i.test(a)) return "T/F";
  if (/(^|\s)\(?[a-d][).]\s+\S/i.test(q) && /(^|\s)\(?[b-d][).]\s+\S/i.test(q)) return "MCQ";
  if (/\b(calculate|compute|derive|solve|how many|what is the value|find the (value|probability|number))\b/i.test(q)) return "problem";
  return "short";
}

function normalizeKind(raw: unknown): "MCQ" | "short" | "problem" | "T/F" | null {
  if (typeof raw !== "string") return null;
  const k = raw.trim().toLowerCase().replace(/[\s_-]+/g, " ");
  if (["mcq", "multiple choice", "multiple choice question", "mc"].includes(k)) return "MCQ";
  if (["t/f", "tf", "t f", "true/false", "true false", "true or false"].includes(k)) return "T/F";
  if (["short", "short answer", "conceptual", "definition", "explain", "essay"].includes(k)) return "short";
  if (["problem", "calculation", "numerical", "computation", "worked problem"].includes(k)) return "problem";
  return null;
}

export interface NormalizeReport {
  confRespelled: number;
  confDowngraded: number;
  kindsFilled: number;
  trapKeysRemoved: number;
  /** Sections the model left out because the course has none (e.g. no formulas in a healthcare course). */
  sectionsFilled: number;
}

/** Mutates `draft` in place. Safe on anything: non-objects and odd shapes are left alone. */
export function normalizeDraft(draft: unknown): NormalizeReport {
  const report: NormalizeReport = { confRespelled: 0, confDowngraded: 0, kindsFilled: 0, trapKeysRemoved: 0, sectionsFilled: 0 };
  if (!draft || typeof draft !== "object") return report;
  const root = draft as Record<string, unknown>;

  // "This course has no formulas" arrives as a missing (or null) key, and the contract wants a
  // list. Seen on production 2026-09-17: a healthcare pack paid a whole 80 s retry for it.
  // Only on a whole sheet (it has topics) — never topics or questions, whose absence means a
  // truncated draft, which should still fail.
  if (Array.isArray(root.topics)) {
    for (const key of ["formulas", "concepts", "traps"]) {
      if (root[key] === undefined || root[key] === null) { root[key] = []; report.sectionsFilled++; }
    }
  }

  for (const key of RANKED) {
    const arr = root[key];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      const it = item as Record<string, unknown>;

      if (typeof it.conf === "string") {
        const mapped = CONF_SYNONYMS[it.conf.trim().toLowerCase()];
        if (mapped && mapped !== it.conf) { it.conf = mapped; report.confRespelled++; }
      }
      if (it.conf === "high" && typeof it.src === "string" && !isHighConfAllowed(it.src, it.verified === true)) {
        it.conf = "med";
        report.confDowngraded++;
      }

      if (key === "questions") {
        const kind = normalizeKind(it.kind);
        if (kind) {
          if (kind !== it.kind) { it.kind = kind; report.kindsFilled++; }
        } else if (typeof it.q === "string") {
          it.kind = inferKind(it.q, typeof it.a === "string" ? it.a : "");
          report.kindsFilled++;
        }
      }
    }
  }

  // Traps are inherently high-trust callouts with no confidence field.
  if (Array.isArray(root.traps)) {
    for (const t of root.traps) {
      if (t && typeof t === "object" && "conf" in (t as object)) {
        delete (t as Record<string, unknown>).conf;
        report.trapKeysRemoved++;
      }
    }
  }
  return report;
}
