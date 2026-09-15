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

/**
 * Batches in flight at once for one document. Figures mode reads every page,
 * so sequential batches cost ~30 s on a 37-page lecture; 4 in parallel keeps
 * it near one batch's latency while staying far under Flash's paid RPM.
 */
const VISION_CONCURRENCY = 4;

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
  /** Labels of images whose batch failed twice — their content was NOT read. */
  failedLabels?: string[];
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * Figures mode: for pages whose TEXT was already extracted. The transcribe
 * prompt above assumes nothing on the page is machine-readable and copies
 * every bullet — on a normal slide that would duplicate its text into the
 * pack. This prompt reads only what exists as a picture: diagrams, charts,
 * architecture figures, matrix/arrow drawings, image-only tables, and the
 * labels written inside them.
 */
const FIGURES_SYSTEM = `
You are a diagram-reading engine for a study-tool ingest pipeline.

Each image is a slide or document page whose ordinary TEXT (title, bullet
points, paragraphs) has ALREADY been extracted separately. Do NOT repeat it.

Your ONLY job is to capture what exists as VISUAL content:
1. Diagrams and figures: name what it depicts, every box/node and its label,
   and what the arrows or connections show (what flows into what, in what order).
2. Charts: chart type, axes, series, printed values and callouts, then one line
   on what it demonstrates.
3. Matrices, grids, heatmaps: dimensions, row/column labels, and any values.
4. Tables drawn as images: reproduce as a markdown table, every cell exact.
5. Formulas that appear only inside a figure: transcribe as closely as plain
   text allows.
6. If the page has no visual content beyond ordinary text, or the image is
   decorative (logo, stock photo, background), write exactly:
   SKIP — no visual content
7. NEVER invent or infer what is not visible. Missing is safe; fabricated is not.

Output plain text. Start each image with "### <label>" using the label given.
No preamble, no summary at the end.
`.trim();

export type VisionMode = "transcribe" | "figures";

export interface VisionOptions {
  client?: LLMClient;
  model?: string;
  /**
   * "transcribe" (default): the page has no extractable text — copy everything.
   * "figures": the text is already extracted — describe only visual content.
   */
  mode?: VisionMode;
  /** Context so the model knows the course/topic (improves label reading). */
  documentName?: string;
}

/**
 * Transcribe a batch of images. Batches of MAX_IMAGES_PER_CALL, up to
 * VISION_CONCURRENCY at a time, output kept in page order. A batch that fails
 * is retried once; if it fails again its pages are reported in failedLabels
 * and the rest still come back — one flaky call must not discard every
 * diagram in the document. Throws only when every batch failed.
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

  const callChunk = (chunk: VisionImage[]) => {
    const labels = chunk.map((c, i) => `Image ${i + 1} = "${c.label}"`).join("\n");
    const user = [
      opts.documentName ? `Document: ${opts.documentName}` : "",
      `You are given ${chunk.length} image(s), in order:`,
      labels,
      "",
      opts.mode === "figures"
        ? "For each one, under its own '### <label>' heading, describe only its visual content."
        : "Transcribe each one under its own '### <label>' heading.",
    ]
      .filter(Boolean)
      .join("\n");

    return client.generate({
      system: opts.mode === "figures" ? FIGURES_SYSTEM : VISION_SYSTEM,
      user,
      images: chunk.map(({ base64, mimeType }) => ({ base64, mimeType })),
      plainText: true,
      model: opts.model ?? VISION_MODEL,
      temperature: 0.1, // transcription, not creativity
      maxOutputTokens: 8192,
    });
  };

  type Outcome =
    | { ok: true; text: string; inTok: number; outTok: number }
    | { ok: false; error: unknown };
  const outcomes: Outcome[] = new Array(chunks.length);
  let next = 0;
  const worker = async () => {
    while (next < chunks.length) {
      const idx = next++;
      for (let attempt = 1; ; attempt++) {
        try {
          const res = await callChunk(chunks[idx]);
          outcomes[idx] = {
            ok: true,
            text: res.text.trim(),
            inTok: res.usage.inputTokens ?? 0,
            outTok: res.usage.outputTokens ?? 0,
          };
          break;
        } catch (error) {
          if (attempt >= 2) {
            outcomes[idx] = { ok: false, error };
            break;
          }
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(VISION_CONCURRENCY, chunks.length) }, worker),
  );

  if (outcomes.every((o) => !o.ok)) {
    const first = outcomes[0] as { ok: false; error: unknown };
    throw first.error instanceof Error ? first.error : new Error(String(first.error));
  }

  const parts: string[] = [];
  const failedLabels: string[] = [];
  let inTok = 0;
  let outTok = 0;
  outcomes.forEach((o, idx) => {
    if (o.ok) {
      parts.push(o.text);
      inTok += o.inTok;
      outTok += o.outTok;
    } else {
      failedLabels.push(...chunks[idx].map((c) => c.label));
    }
  });

  // Drop the model's own SKIP markers so they don't pollute the pack.
  const text = parts
    .join("\n\n")
    .split(/\n(?=### )/)
    .filter((block) => !/SKIP — no (readable|visual) content/i.test(block))
    .join("\n")
    .trim();

  return {
    text,
    imagesSent: images.length,
    failedLabels: failedLabels.length ? failedLabels : undefined,
    inputTokens: inTok,
    outputTokens: outTok,
  };
}

/** Wrap a transcription so downstream steps can see its provenance. */
export function markVisionText(docName: string, text: string): string {
  if (!text.trim()) return "";
  return `\n\n===== VISION TRANSCRIPTION (image content read from ${docName}) =====\n${text}\n`;
}
