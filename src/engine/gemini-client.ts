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
        // Native JSON-only mode — Gemini will refuse non-JSON output.
        responseMimeType: "application/json",
        // Optional schema enforcement at the provider level.
        ...(req.jsonOutputHint?.schema
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            { responseSchema: req.jsonOutputHint.schema as any }
          : {}),
      },
    });

    try {
      const result = await model.generateContent(req.user);
      const text = result.response.text();
      const usage = result.response.usageMetadata;

      return {
        text,
        model: modelId,
        usage: {
          inputTokens: usage?.promptTokenCount,
          outputTokens: usage?.candidatesTokenCount,
          raw: usage,
        },
      };
    } catch (err) {
      throw new LLMError(
        `Gemini (${modelId}) call failed: ${err instanceof Error ? err.message : String(err)}`,
        "gemini",
        err,
      );
    }
  }
}

/** Convenience: build a client from process.env.GEMINI_API_KEY. */
export function defaultGeminiClient(): GeminiClient {
  return new GeminiClient();
}
