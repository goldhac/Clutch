/**
 * vision.ts — read the content that lives only as PIXELS.
 *
 * The gap this closes: our ingest extracted only a document's TEXT LAYER.
 * Anything drawn as an image was invisible to the engine — Excel
 * regression-output screenshots, chart figures, diagram-only slides,
 * scanned or handwritten notes. Real cost, observed on a real pack: the
 * ITSS 3300 Project Management deck is almost entirely image slides, so
 * "critical path" — a CONFIRMED exam topic — did not appear anywhere in
 * the extracted text. Without a classmate's email naming it, both engines
 * would have missed a guaranteed exam question.
 *
 * How it works: pages/slides that look image-heavy (little or no text for
 * their size) are rasterized (PDF) or have their embedded media pulled
 * (PPTX), then sent to the multimodal model with a TRANSCRIPTION prompt —
 * not a summarization prompt. We want the numbers, labels, table cells and
 * axis titles verbatim, because those are what the trust layer cites.
 *
 * The output is appended to the document's text with a marker so the
 * ranking engine (and the citation audit) can see where it came from.
 */
import type { LLMClient, LLMImage } from "@/engine/llm-client";
import { defaultGeminiClient } from "@/engine/gemini-client";

/** Gemini Flash is plenty for transcription and ~20× cheaper than Pro. */
const VISION_MODEL = "gemini-2.5-flash";

/** Cap per call so one monster deck can't blow the request size. */
const MAX_IMAGES_PER_CALL = 8;

const VISION_SYSTEM = `
You are an OCR + diagram-reading engine for a study-tool ingest pipeline.

You are given images of slides / document pages whose content does NOT
exist as machine-readable text. Your ONLY job is to TRANSCRIBE what is
actually visible, faithfully and completely.

RULES:
1. Transcribe VERBATIM wherever possible — titles, bullet text, labels,
   axis names, legend entries, and EVERY number you can read.
2. Tables: reproduce as markdown tables, preserving every cell. Numbers
   must be exact — they get cited downstream as fact.
3. Charts/diagrams: state the chart type, what is on each axis, the
   series names, and any printed values or callouts. Then one line on
   what it demonstrates.
4. Formulas/equations: transcribe the notation as closely as plain text
   allows (e.g. "y_hat_t = b0 + b1*t").
5. Screenshots of software output (Excel, regression summaries, query
   results): transcribe the field names and their values as a table.
6. If an image is decorative (stock photo, logo, background) or you
   cannot read it, write exactly: SKIP — no readable content.
7. NEVER invent, complete, or infer content that is not visible. Missing
   is safe; fabricated is not. Do not add commentary or study advice.

Output plain text. Start each image with "### <label>" using the label
given to you. No preamble, no summary at the end.
`.trim();

export interface VisionImage extends LLMImage {
  /** Human label used in the transcript header, e.g. "Slide 9". */
  label: string;
}

export interface VisionResult {
  /** Transcribed text, ready to append to the document's text layer. */
  text: string;
  /** How many images were actually sent. */
  imagesSent: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface VisionOptions {
  client?: LLMClient;
  model?: string;
  /** Context so the model knows the course/topic (improves label reading). */
  documentName?: string;
}

/**
 * Transcribe a batch of images. Batches of MAX_IMAGES_PER_CALL, sequential
 * (parallel calls on a personal API key hit rate limits fast).
 */
export async function transcribeImages(
  images: VisionImage[],
  opts: VisionOptions = {},
): Promise<VisionResult> {
  if (images.length === 0) return { text: "", imagesSent: 0 };

  const client = opts.client ?? defaultGeminiClient();
  const chunks: VisionImage[][] = [];
  for (let i = 0; i < images.length; i += MAX_IMAGES_PER_CALL) {
    chunks.push(images.slice(i, i + MAX_IMAGES_PER_CALL));
  }

  const parts: string[] = [];
  let inTok = 0;
  let outTok = 0;

  for (const chunk of chunks) {
    const labels = chunk.map((c, i) => `Image ${i + 1} = "${c.label}"`).join("\n");
    const user = [
      opts.documentName ? `Document: ${opts.documentName}` : "",
      `You are given ${chunk.length} image(s), in order:`,
      labels,
      "",
      "Transcribe each one under its own '### <label>' heading.",
    ]
      .filter(Boolean)
      .join("\n");

    const res = await client.generate({
      system: VISION_SYSTEM,
      user,
      images: chunk.map(({ base64, mimeType }) => ({ base64, mimeType })),
      plainText: true,
      model: opts.model ?? VISION_MODEL,
      temperature: 0.1, // transcription, not creativity
      maxOutputTokens: 8192,
    });
    parts.push(res.text.trim());
    inTok += res.usage.inputTokens ?? 0;
    outTok += res.usage.outputTokens ?? 0;
  }

  // Drop the model's own SKIP markers so they don't pollute the pack.
  const text = parts
    .join("\n\n")
    .split(/\n(?=### )/)
    .filter((block) => !/SKIP — no readable content/i.test(block))
    .join("\n")
    .trim();

  return { text, imagesSent: images.length, inputTokens: inTok, outputTokens: outTok };
}

/** Wrap a transcription so downstream steps can see its provenance. */
export function markVisionText(docName: string, text: string): string {
  if (!text.trim()) return "";
  return `\n\n===== VISION TRANSCRIPTION (image content read from ${docName}) =====\n${text}\n`;
}
