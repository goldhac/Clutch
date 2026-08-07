/**
 * rank.ts — the engine orchestrator.
 *
 * Input: a pack of parsed files + the 3 controls (exam type / density /
 * priority) + optional course context.
 * Output: a Zod-validated SheetContent ready for the renderer.
 *
 * Flow:
 *   buildSystemPrompt + buildUserPrompt
 *   → LLMClient.generate (JSON-mode, structured)
 *   → JSON.parse
 *   → SheetContentSchema.safeParse
 *   → on schema failure → retry ONCE with the error message appended
 *   → throw EngineError if still invalid.
 *
 * The retry-on-validation-error is a cheap fix for "model emitted
 * conf:high without verified/exam-grade/multi-source". Step 7's
 * Tighten pass does deeper critique + score/9.1 lift.
 */
import {
  parseSheetContent,
  safeParseSheetContent,
  type SheetContent,
} from "@/contract/sheet-content";
import { defaultGeminiClient } from "./gemini-client";
import { type LLMClient } from "./llm-client";
import {
  buildSystemPrompt,
  buildUserPrompt,
  type EnginePromptInput,
} from "./prompt";
import { sanitizeForTrust, type PackFileMeta } from "./sanitize";

export class EngineError extends Error {
  constructor(
    message: string,
    public readonly raw?: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "EngineError";
  }
}

export interface GenerateResult {
  content: SheetContent;
  meta: {
    model: string;
    inputTokens?: number;
    outputTokens?: number;
    /** Did we have to retry once after a Zod failure? */
    retried: boolean;
    /** Items where the sanitize pass had to strip verified / downgrade conf. */
    sanitizedItems: number;
    /** verifiedPatterns dropped because the past_exam they cited was empty. */
    droppedPatterns: number;
  };
  /** User-visible warnings (unreadable PDFs, downgraded verified flags, etc.) */
  warnings: string[];
}

export interface GenerateOptions {
  /** Override the default LLMClient (e.g. for tests or model swaps). */
  client?: LLMClient;
}

/**
 * The single function the UI / API route calls.
 *
 * Throws EngineError on irrecoverable validation failure — the route
 * handler renders a meaningful 422 / 500 from it.
 */
export async function generateSheet(
  input: EnginePromptInput,
  opts: GenerateOptions = {},
): Promise<GenerateResult> {
  const client = opts.client ?? defaultGeminiClient();
  const system = buildSystemPrompt();
  const user = buildUserPrompt(input);

  const packMeta: PackFileMeta[] = input.pack.map((f) => ({
    filename: f.filename,
    tag: f.tag,
    charCount: f.text.length,
  }));

  const first = await client.generate({ system, user, temperature: 0.3 });

  const firstParse = tryParseJsonAndValidate(first.text);
  if (firstParse.ok) {
    const sanitized = sanitizeForTrust(firstParse.value, packMeta);
    return {
      content: sanitized.content,
      warnings: sanitized.warnings,
      meta: {
        model: first.model,
        inputTokens: first.usage.inputTokens,
        outputTokens: first.usage.outputTokens,
        retried: false,
        sanitizedItems: sanitized.stripped,
        droppedPatterns: sanitized.droppedPatterns,
      },
    };
  }

  // Validation failed — retry ONCE with the error appended so the model
  // can self-correct (typically a trust-rule violation or schema slip).
  const retryUser = `${user}

──────

YOUR PREVIOUS RESPONSE FAILED VALIDATION:
${firstParse.error}

Fix every error above and emit a NEW, full, valid JSON object. Do not
explain or apologize — just emit the corrected JSON.`;

  const second = await client.generate({
    system,
    user: retryUser,
    temperature: 0.2,
  });

  const secondParse = tryParseJsonAndValidate(second.text);
  if (!secondParse.ok) {
    throw new EngineError(
      `Engine output failed validation after retry: ${secondParse.error}`,
      second.text,
    );
  }

  const sanitized = sanitizeForTrust(secondParse.value, packMeta);
  return {
    content: sanitized.content,
    warnings: sanitized.warnings,
    meta: {
      model: second.model,
      inputTokens: (first.usage.inputTokens ?? 0) + (second.usage.inputTokens ?? 0),
      outputTokens: (first.usage.outputTokens ?? 0) + (second.usage.outputTokens ?? 0),
      retried: true,
      sanitizedItems: sanitized.stripped,
      droppedPatterns: sanitized.droppedPatterns,
    },
  };
}

/* ────────────────────────────────────────────────────────────────────
 * Top-up pass (docs/09 §5) — deepen an under-supplied pool.
 *
 * Observed: gemini-2.5-pro plateaus at ~55 items per call regardless
 * of the POOL TARGET counts. A 2-page (front/back) sheet needs ~100+.
 * The fix is a SECOND engine call that sees the existing items' names
 * and is told to mine ONLY new material. Merge = existing first (rank
 * preserved), new items appended per section, name-level dedup.
 * ──────────────────────────────────────────────────────────────────── */

function poolInventory(c: SheetContent): string {
  const lines: string[] = [];
  const push = (label: string, names: string[]) => {
    if (names.length) lines.push(`${label}: ${names.join(" | ")}`);
  };
  push("topics", c.topics.map((t) => t.name));
  push("formulas", c.formulas.map((f) => f.name));
  push("concepts", c.concepts.map((k) => k.term));
  push("traps", c.traps.map((t) => t.text.slice(0, 60)));
  push("questions", c.questions.map((q) => q.q.slice(0, 60)));
  push("tables", (c.tables ?? []).map((t) => t.title));
  return lines.join("\n");
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function mergePools(base: SheetContent, extra: SheetContent): SheetContent {
  const seen = {
    topics: new Set(base.topics.map((t) => norm(t.name))),
    formulas: new Set(base.formulas.map((f) => norm(f.name))),
    concepts: new Set(base.concepts.map((k) => norm(k.term))),
    traps: new Set(base.traps.map((t) => norm(t.text.slice(0, 60)))),
    questions: new Set(base.questions.map((q) => norm(q.q.slice(0, 60)))),
    tables: new Set((base.tables ?? []).map((t) => norm(t.title))),
  };
  return {
    ...base,
    topics: [...base.topics, ...extra.topics.filter((t) => !seen.topics.has(norm(t.name)))],
    formulas: [...base.formulas, ...extra.formulas.filter((f) => !seen.formulas.has(norm(f.name)))],
    concepts: [...base.concepts, ...extra.concepts.filter((k) => !seen.concepts.has(norm(k.term)))],
    traps: [...base.traps, ...extra.traps.filter((t) => !seen.traps.has(norm(t.text.slice(0, 60))))],
    questions: [...base.questions, ...extra.questions.filter((q) => !seen.questions.has(norm(q.q.slice(0, 60))))],
    tables: [...(base.tables ?? []), ...(extra.tables ?? []).filter((t) => !seen.tables.has(norm(t.title)))],
  };
}

/**
 * One deepening pass: same pack, same controls, but the model sees the
 * existing pool's item names and emits ONLY new items. Returns the
 * merged, re-validated pool.
 */
export async function deepenSheet(
  input: EnginePromptInput,
  existing: SheetContent,
  opts: GenerateOptions = {},
): Promise<GenerateResult> {
  const client = opts.client ?? defaultGeminiClient();
  const system = buildSystemPrompt();
  const user = `${buildUserPrompt(input)}

──────

TOP-UP PASS — the pool below ALREADY EXISTS. Your entire job in this
call is to DEEPEN it with material you did not itemize last time:
worked examples summarized instead of split out, lecture definitions
skipped, regression-output rows, chart-choice rules, T/F statements,
each past-exam question as its own entry.

EXISTING POOL (do NOT repeat or rephrase any of these):
${poolInventory(existing)}

Emit the SAME full JSON schema, but every array contains ONLY NEW
items (title/examFormat may repeat; emit "verifiedPatterns": [] —
already captured). Minimums for THIS call: 8 formulas, 8 concepts,
5 traps, 8 questions, 2 tables — all with real numbers and citations
from the pack, ranked best-first.`;

  const packMeta: PackFileMeta[] = input.pack.map((f) => ({
    filename: f.filename,
    tag: f.tag,
    charCount: f.text.length,
  }));

  const first = await client.generate({ system, user, temperature: 0.4 });
  let parse = tryParseJsonAndValidate(first.text);
  let used = first;

  // Retry ONCE with the errors appended — same self-correction the main
  // pass gets. Without it a single stray key (e.g. an extra "context"
  // field the strict schema rejects) throws away a whole top-up call.
  if (!parse.ok) {
    const retry = await client.generate({
      system,
      user: `${user}

──────

YOUR PREVIOUS RESPONSE FAILED VALIDATION:
${parse.error}

Fix every error above and emit a NEW, full, valid JSON object. Emit ONLY
the schema's fields — no extra keys. Do not explain or apologize.`,
      temperature: 0.2,
    });
    parse = tryParseJsonAndValidate(retry.text);
    used = retry;
    if (!parse.ok) {
      throw new EngineError(`Top-up pass failed validation after retry: ${parse.error}`, retry.text);
    }
  }

  const sanitized = sanitizeForTrust(parse.value, packMeta);
  const merged = safeParseSheetContent(mergePools(existing, sanitized.content));
  if (!merged.success) {
    throw new EngineError(`Merged pool failed validation: ${merged.error}`);
  }
  return {
    content: merged.data,
    warnings: sanitized.warnings,
    meta: {
      model: used.model,
      inputTokens: (first.usage.inputTokens ?? 0) + (used === first ? 0 : (used.usage.inputTokens ?? 0)),
      outputTokens: (first.usage.outputTokens ?? 0) + (used === first ? 0 : (used.usage.outputTokens ?? 0)),
      retried: used !== first,
      sanitizedItems: sanitized.stripped,
      droppedPatterns: sanitized.droppedPatterns,
    },
  };
}

type ParseResult =
  | { ok: true; value: SheetContent }
  | { ok: false; error: string };

function tryParseJsonAndValidate(raw: string): ParseResult {
  // Strip code fences if the model added them despite being told not to.
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    return {
      ok: false,
      error: `Not valid JSON: ${e instanceof Error ? e.message : String(e)}. ` +
        `First 200 chars: ${cleaned.slice(0, 200)}`,
    };
  }

  const result = safeParseSheetContent(parsed);
  if (!result.success) {
    // Include the OFFENDING VALUE, not just the path. "traps.5.text is
    // bad" gives the model nothing to work with on retry; quoting the
    // actual sentence lets it rewrite exactly that one.
    const at = (path: (string | number)[]): unknown =>
      path.reduce<unknown>(
        (acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[String(k)] : undefined),
        parsed,
      );
    const lines = result.error.issues
      .map((i) => {
        const val = at(i.path);
        const shown =
          typeof val === "string"
            ? ` — you wrote: "${val.slice(0, 160)}"`
            : val === undefined
              ? ""
              : ` — you wrote: ${JSON.stringify(val).slice(0, 160)}`;
        return `  • [${i.path.join(".") || "<root>"}] ${i.message}${shown}`;
      })
      .join("\n");
    return { ok: false, error: lines };
  }
  return { ok: true, value: result.data };
}

/**
 * Re-export so callers can `parseSheetContent` without importing from
 * the contract module directly — keeps the engine the single owner.
 */
export { parseSheetContent };

/* ────────────────────────────────────────────────────────────────────
 * Tweak pass — the user's "make a little edit" feature (tiered).
 *
 * Free tier steers the deterministic composer (priority/examType — no
 * engine call). The paid tier gets THIS: a free-text instruction applied
 * to the pool by the model as a SMALL edit, re-validated by the same
 * contract (trust rules, answers, topics) so a tweak can't degrade the
 * sheet below the quality bar.
 * ──────────────────────────────────────────────────────────────────── */

export async function tweakSheet(
  existing: SheetContent,
  instruction: string,
  opts: GenerateOptions = {},
): Promise<GenerateResult> {
  const client = opts.client ?? defaultGeminiClient();
  const system = buildSystemPrompt();
  const user = `TWEAK PASS — a student asked for a small edit to their
existing sheet. Below is the CURRENT pool (already validated + cited).

Apply the instruction as a TARGETED EDIT, not a rebuild:
- Touch only what the instruction implies; keep everything else
  byte-identical (same wording, same src, same conf/verified).
- "shorter X" → rewrite those items tighter, never drop the answer/example.
- "more X" → add new items of that kind, same citation rules as always —
  ONLY from knowledge already evidenced in the existing pool's content;
  if you can't cite it from the pool, don't add it.
- "remove/less X" → delete the lowest-value matching items.
- Keep every "topic" tag a valid topics[].name. Keep every question's "a".
- If the instruction is unsafe, unrelated to the sheet, or asks you to
  invent uncited material, apply nothing and return the pool unchanged.

INSTRUCTION FROM THE STUDENT:
"${instruction.replace(/"/g, "'").slice(0, 500)}"

CURRENT POOL:
${JSON.stringify(existing)}

Emit the FULL edited JSON object (same schema, no extra keys).`;

  const first = await client.generate({ system, user, temperature: 0.3 });
  let parse = tryParseJsonAndValidate(first.text);
  let used = first;
  if (!parse.ok) {
    const retry = await client.generate({
      system,
      user: `${user}

──────

YOUR PREVIOUS RESPONSE FAILED VALIDATION:
${parse.error}

Fix every error above and emit a NEW, full, valid JSON object.`,
      temperature: 0.2,
    });
    parse = tryParseJsonAndValidate(retry.text);
    used = retry;
    if (!parse.ok) {
      throw new EngineError(`Tweak pass failed validation after retry: ${parse.error}`, retry.text);
    }
  }

  return {
    content: parse.value,
    warnings: [],
    meta: {
      model: used.model,
      inputTokens: (first.usage.inputTokens ?? 0) + (used === first ? 0 : (used.usage.inputTokens ?? 0)),
      outputTokens: (first.usage.outputTokens ?? 0) + (used === first ? 0 : (used.usage.outputTokens ?? 0)),
      retried: used !== first,
      sanitizedItems: 0,
      droppedPatterns: 0,
    },
  };
}
