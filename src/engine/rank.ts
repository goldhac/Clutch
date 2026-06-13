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
    const lines = result.error.issues
      .map((i) => `  • [${i.path.join(".") || "<root>"}] ${i.message}`)
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
