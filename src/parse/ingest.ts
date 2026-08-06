/**
 * ingest.ts — one entry point that reads a document COMPLETELY:
 * its text layer plus, when needed, the content that only exists as
 * pixels (via the vision pass).
 *
 * Decision rule — only pay for vision where text extraction actually
 * failed, so a normal text-native pack costs nothing extra:
 *
 *   PPTX  → slides that carry pictures but almost no text
 *   PDF   → pages whose text density is far below the document average
 *           (an image-only page in an otherwise typed document), or a
 *           whole PDF that yielded almost no text at all (a scan)
 *
 * Everything else takes the plain text path unchanged.
 */
import { extractPdfText } from "./pdf";
import { extractText } from "./text";
import { extractPptx, imageHeavySlides, type PptxDoc } from "./pptx";
import { rasterizePdf, rasterizerAvailable } from "./rasterize";
import { markVisionText, transcribeImages, type VisionImage } from "./vision";

export interface IngestResult {
  text: string;
  charCount: number;
  /** Pages (PDF) or slides (PPTX). */
  units: number;
  /** Chars contributed by the vision pass (0 when it didn't run). */
  visionChars: number;
  /** How many images were transcribed. */
  visionImages: number;
  warnings: string[];
}

export interface IngestOptions {
  /** Turn the vision pass off (tests, cost-sensitive runs). */
  vision?: boolean;
  /** Cap the images we'll transcribe for one document. */
  maxVisionImages?: number;
}

/** A PDF page with far less text than its neighbours is a picture page. */
function sparsePdfPages(text: string, pageCount: number): number[] {
  if (pageCount <= 1) return [];
  // pdf-parse joins pages with \f (form feed) — when present, use it.
  const pages = text.split("\f");
  if (pages.length < pageCount) return [];
  const lens = pages.map((p) => p.trim().length);
  const avg = lens.reduce((a, b) => a + b, 0) / lens.length;
  const threshold = Math.max(80, avg * 0.25);
  const out: number[] = [];
  lens.forEach((len, i) => {
    if (len < threshold) out.push(i + 1);
  });
  return out;
}

export async function ingestDocument(
  filename: string,
  buf: Buffer,
  opts: IngestOptions = {},
): Promise<IngestResult> {
  const useVision = opts.vision !== false;
  const maxImages = opts.maxVisionImages ?? 10;
  const warnings: string[] = [];
  const lower = filename.toLowerCase();

  // ── PPTX ────────────────────────────────────────────────────────────
  if (lower.endsWith(".pptx")) {
    const doc: PptxDoc = extractPptx(buf);
    let text = doc.text;
    let visionChars = 0;
    let visionImages = 0;

    if (useVision) {
      const heavy = imageHeavySlides(doc);
      const images: VisionImage[] = [];
      for (const s of heavy) {
        // Largest image on the slide is the content one.
        const best = [...s.images].sort((a, b) => b.bytes - a.bytes)[0];
        if (best) {
          images.push({
            base64: best.base64,
            mimeType: best.mimeType,
            label: `Slide ${s.index}`,
          });
        }
        if (images.length >= maxImages) break;
      }
      if (images.length > 0) {
        try {
          const v = await transcribeImages(images, { documentName: filename });
          if (v.text) {
            text += markVisionText(filename, v.text);
            visionChars = v.text.length;
            visionImages = v.imagesSent;
          }
        } catch (e) {
          warnings.push(
            `${filename}: vision pass failed (${e instanceof Error ? e.message : String(e)}); ` +
              `image-only slides were not read.`,
          );
        }
      }
    }

    return {
      text,
      charCount: text.length,
      units: doc.slideCount,
      visionChars,
      visionImages,
      warnings,
    };
  }

  // ── PDF ─────────────────────────────────────────────────────────────
  if (lower.endsWith(".pdf")) {
    const { text: baseText, pageCount, charCount } = await extractPdfText(buf);
    let text = baseText;
    let visionChars = 0;
    let visionImages = 0;

    if (useVision) {
      const scanned = pageCount > 0 && charCount < pageCount * 100;
      const sparse = scanned ? [] : sparsePdfPages(baseText, pageCount);
      const targets = scanned
        ? Array.from({ length: Math.min(pageCount, maxImages) }, (_, i) => i + 1)
        : sparse.slice(0, maxImages);

      if (targets.length > 0) {
        if (!(await rasterizerAvailable())) {
          warnings.push(
            `${filename}: ${targets.length} page(s) appear to be images, but pdftoppm is not ` +
              `installed — that content was NOT read. Install poppler to enable it.`,
          );
        } else {
          try {
            const pages = await rasterizePdf(buf, { pages: targets });
            if (pages.length > 0) {
              const v = await transcribeImages(
                pages.map((p) => ({
                  base64: p.base64,
                  mimeType: p.mimeType,
                  label: `Page ${p.page}`,
                })),
                { documentName: filename },
              );
              if (v.text) {
                text += markVisionText(filename, v.text);
                visionChars = v.text.length;
                visionImages = v.imagesSent;
              }
            }
          } catch (e) {
            warnings.push(
              `${filename}: vision pass failed (${e instanceof Error ? e.message : String(e)}); ` +
                `image-only pages were not read.`,
            );
          }
        }
      }
    }

    return { text, charCount: text.length, units: pageCount, visionChars, visionImages, warnings };
  }

  // ── Plain text / markdown ───────────────────────────────────────────
  const { text } = extractText(buf.toString("utf-8"));
  return { text, charCount: text.length, units: 0, visionChars: 0, visionImages: 0, warnings };
}
