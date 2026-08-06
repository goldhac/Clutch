/**
 * llm-client.ts — provider-agnostic LLM interface.
 *
 * Why this abstraction:
 *  - We default to Gemini today; the architecture should let us swap
 *    to Anthropic Sonnet / OpenAI for the trust-layer step if Gemini
 *    fakes citations on real packs (Build Plan §1 / §8).
 *  - The Tighten pass in Step 7 may want a DIFFERENT model than the
 *    main pass (e.g. critique with a heavier model, generate with a
 *    cheaper one). Per-call model selection.
 *  - Easier to mock for tests.
 *
 * The interface is intentionally narrow: a single async call that
 * takes a system message + user message + a JSON schema hint, returns
 * the model's text output and usage metadata. Validation happens at the
 * Zod boundary in engine/rank.ts — not here.
 */

export interface LLMUsage {
  inputTokens?: number;
  outputTokens?: number;
  /** Provider-specific extras for logging. */
  raw?: unknown;
}

/** An image sent alongside the prompt (vision/OCR pass). */
export interface LLMImage {
  /** Raw bytes, base64-encoded (no data: prefix). */
  base64: string;
  /** e.g. "image/png", "image/jpeg". */
  mimeType: string;
}

export interface LLMRequest {
  /** System / persona — set once per call. Cached when supported. */
  system: string;
  /** User content — the per-pack instruction + extracted text. */
  user: string;
  /**
   * Optional images for a multimodal call. Used by the vision ingest pass
   * (src/parse/vision.ts) to read content that lives only as pixels —
   * chart figures, screenshotted tables, image-only slides.
   */
  images?: LLMImage[];
  /**
   * When true the provider should NOT force JSON output — the vision pass
   * wants plain transcribed text.
   */
  plainText?: boolean;
  /**
   * Optional JSON schema description for structured output. Providers
   * that support response schemas use it natively; others get it
   * injected into the prompt as guidance.
   */
  jsonOutputHint?: {
    /** Provider-specific schema. For Gemini, the responseSchema shape. */
    schema?: unknown;
    /** Plain-text instruction added to the prompt — works for every provider. */
    instruction?: string;
  };
  /** Override the default model for this call (e.g. "gemini-2.5-flash" for cheap meta). */
  model?: string;
  /** Sampling temperature (0..2). Lower = more deterministic. Default 0.3. */
  temperature?: number;
  /** Max output tokens — Gemini 2.5 Pro supports up to 65k; we cap lower. */
  maxOutputTokens?: number;
}

export interface LLMResponse {
  /** The model's text output (the JSON string, before parsing). */
  text: string;
  /** Token counts + provider-specific metadata. */
  usage: LLMUsage;
  /** Which model actually answered (provider may downgrade on quota). */
  model: string;
}

export interface LLMClient {
  /** Display name — useful for logs ("gemini", "anthropic", "openai"). */
  readonly providerName: string;
  /** The default model id when no per-call override is given. */
  readonly defaultModel: string;

  generate(req: LLMRequest): Promise<LLMResponse>;
}

/* ── A typed error so route handlers can show a meaningful message. ── */

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "LLMError";
  }
}
