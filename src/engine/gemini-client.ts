/**
 * gemini-client.ts — Google Gemini implementation of LLMClient.
 *
 * Why Gemini for now:
 *  - Massive input context window (1M tokens on 2.5 Pro / 2.5 Flash) —
 *    fits an entire pack (slides + review + past exam) in one call
 *    without chunking.
 *  - Native structured-output via responseMimeType + responseSchema.
 *  - Owner-provided key (GEMINI_API_KEY in ~/.zshrc).
 *
 * Honest tradeoff (see Build Plan §8): cheap models historically fail
 * at the trust layer (fake confidence, invented citations). Default is
 * Gemini 2.5 Pro for the ranking step; Step 6 + Step 7's first job
 * after wiring this up is to AUDIT real-pack runs for citation
 * authenticity. If Gemini invents sources, we either fix it in the
 * prompt, downgrade to a Pro-only path, or swap to Sonnet specifically
 * for the trust-layer step. We measure, not guess.
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { type LLMClient, type LLMRequest, type LLMResponse, LLMError } from "./llm-client";

/** Gemini 2.5 Pro — the moat model. ~1M token input, strong reasoning. */
export const GEMINI_PRO = "gemini-2.5-pro";

/** Gemini 2.5 Flash — the cheap model. Same context window, faster + cheaper. */
export const GEMINI_FLASH = "gemini-2.5-flash";

export interface GeminiOptions {
  apiKey?: string;
  defaultModel?: string;
}


/**
 * A provider hiccup is not a failed generation (2026-09-29).
 *
 * Production returned 500 "something went wrong on our side" after 37 s because Gemini answered
 * one call with `503 This model is currently experiencing high demand`. The sheet engine retried
 * only on SCHEMA failure, so a transient spike cost a student their whole sheet and blamed us for
 * it. Retrying here means every caller — generate, deepen, edit, format repair — gets the same
 * protection without each one remembering to ask for it.
 *
 * Walls are excluded deliberately. A spend cap or a depleted balance refuses the next attempt
 * exactly as it refused this one, so retrying only spends the backoff before failing anyway — and
 * the provider wraps both in the same "Error fetching from …" text, so the wall must be recognised
 * FIRST.
 */
const WALL = /spending cap|exceeded its monthly|prepayment credits|credits are depleted|\b402\b|API key|PERMISSION_DENIED|\b40[13]\b/i;
const TRANSIENT = /\b503\b|\b500\b|UNAVAILABLE|high demand|overloaded|deadline|timeout|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|fetch failed|error fetching/i;

export const isTransientProviderError = (err: unknown): boolean => {
  const m = err instanceof Error ? `${err.message} ${String((err as { cause?: unknown }).cause ?? "")}` : String(err);
  return !WALL.test(m) && TRANSIENT.test(m);
};

/** 4 tries, widening backoff. A spike usually clears in seconds; a student waits rather than loses. */
const TRIES = 4;
const BACKOFF_MS = 4_000;

export class GeminiClient implements LLMClient {
  readonly providerName = "gemini";
  readonly defaultModel: string;
  private readonly client: GoogleGenerativeAI;

  constructor(opts: GeminiOptions = {}) {
    const key = opts.apiKey ?? process.env.GEMINI_API_KEY;
    if (!key) {
      throw new LLMError(
        "GEMINI_API_KEY is not set. Add it to .env.local or your shell env.",
        "gemini",
      );
    }
    this.client = new GoogleGenerativeAI(key);
    this.defaultModel = opts.defaultModel ?? GEMINI_PRO;
  }

  async generate(req: LLMRequest): Promise<LLMResponse> {
    const modelId = req.model ?? this.defaultModel;

    // System instruction is set at model creation; user content per call.
    const model = this.client.getGenerativeModel({
      model: modelId,
      systemInstruction: req.system,
      generationConfig: {
        temperature: req.temperature ?? 0.3,
        maxOutputTokens: req.maxOutputTokens ?? 32768,
        // JSON-only mode for the ranking pass. The vision/OCR pass sets
        // plainText because it returns a transcription, not a document.
        ...(req.plainText ? {} : { responseMimeType: "application/json" }),
        // Optional schema enforcement at the provider level.
        ...(req.jsonOutputHint?.schema && !req.plainText
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            { responseSchema: req.jsonOutputHint.schema as any }
          : {}),
      },
    });

    let lastErr: unknown;
    for (let attempt = 1; attempt <= TRIES; attempt++) {
    try {
      // Multimodal when images are supplied (vision ingest); plain text
      // otherwise. Gemini takes an array of parts.
      const payload = req.images?.length
        ? [
            { text: req.user },
            ...req.images.map((img) => ({
              inlineData: { data: img.base64, mimeType: img.mimeType },
            })),
          ]
        : req.user;
      const result = await model.generateContent(
        payload as Parameters<typeof model.generateContent>[0],
      );
      const text = result.response.text();
      const usage = result.response.usageMetadata;

      return {
        text,
        model: modelId,
        finishReason: result.response.candidates?.[0]?.finishReason,
        usage: {
          inputTokens: usage?.promptTokenCount,
          outputTokens: usage?.candidatesTokenCount,
          raw: usage,
        },
      };
    } catch (err) {
      lastErr = err;
      if (attempt < TRIES && isTransientProviderError(err)) {
        console.warn(
          `[gemini] ${modelId} attempt ${attempt}/${TRIES} hit a transient provider error; ` +
            `retrying in ${(BACKOFF_MS * attempt) / 1000}s: ${(err instanceof Error ? err.message : String(err)).slice(0, 140)}`,
        );
        await new Promise((r) => setTimeout(r, BACKOFF_MS * attempt));
        continue;
      }
      throw new LLMError(
        `Gemini (${modelId}) call failed: ${err instanceof Error ? err.message : String(err)}`,
        "gemini",
        err,
      );
    }
    }
    throw new LLMError(`Gemini (${modelId}) call failed: ${String(lastErr)}`, "gemini", lastErr);
  }
}

/** Convenience: build a client from process.env.GEMINI_API_KEY. */
export function defaultGeminiClient(): GeminiClient {
  return new GeminiClient();
}
