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
import { cropFigures, detectFigures, figuresFromSlides, type CroppedFigure } from "./figures";

export interface IngestResult {
  text: string;
  charCount: number;
  /** Pages (PDF) or slides (PPTX). */
  units: number;
  /** Chars contributed by the vision pass (0 when it didn't run). */
  visionChars: number;
  /** How many images were transcribed. */
  visionImages: number;
  /** Vision-pass token usage, for cost accounting (absent when it didn't run). */
  visionInputTokens?: number;
  visionOutputTokens?: number;
  /** Diagrams cut out of the document (issue #15); only when `figures` was requested. */
  figures?: CroppedFigure[];
  warnings: string[];
}

export interface IngestOptions {
  /** Turn the vision pass off (tests, cost-sensitive runs). */
  vision?: boolean;
  /** Cap the images we'll transcribe for one document. */
  maxVisionImages?: number;
  /**
   * Which pages the vision pass reads.
   *
   *   "sparse"  (default) — only pages where text extraction failed: scanned
   *             PDFs, near-empty picture pages, image-heavy low-text slides.
   *             Cheap; the sheet engine used it until 2026-09-15.
   *   "figures" — every page/slide, asking only for VISUAL content. Catches
   *             diagrams that sit on pages that also have a title and labels,
   *             which "sparse" never reads (Phase 0: 37-page attention lecture,
   *             0 chars from its Q/K/V and Transformer figures). Vector
   *             drawings are caught too, since pages are rendered, not scanned
   *             for embedded images. /api/generate, gen-cli and Clutch Audio
   *             all use this.
   */
  visionMode?: "sparse" | "figures";
  /**
   * Also locate and crop the document's diagrams so the student can place them on the
   * sheet. PDFs are cropped from the rendered page; PPTX uses the deck's embedded images. Runs alongside the figures vision pass on the same rendered
   * pages, so it adds cost (~$0.005 a lecture) but no waiting.
   */
  figures?: boolean;
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
    // Diagram hunting runs beside the reading pass; it never blocks or fails the ingest.
    const slideFigures = useVision && opts.figures
      ? figuresFromSlides(doc.slides, { documentName: filename }).catch(() => [] as CroppedFigure[])
      : Promise.resolve([] as CroppedFigure[]);

    if (useVision) {
      const figures = opts.visionMode === "figures";
      const cap = opts.maxVisionImages ?? (figures ? 60 : maxImages);
      const heavy = figures ? doc.slides.filter((sl) => sl.images.length > 0) : imageHeavySlides(doc);
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
        if (images.length >= cap) break;
      }
      if (images.length > 0) {
        try {
          const v = await transcribeImages(images, {
            documentName: filename,
            mode: figures ? "figures" : "transcribe",
          });
          if (v.text) {
            text += markVisionText(filename, v.text);
            visionChars = v.text.length;
            visionImages = v.imagesSent;
          }
          if (v.failedLabels) {
            warnings.push(
              `${filename}: vision could not read ${v.failedLabels.join(", ")} after a retry; ` +
                `diagrams there are missing.`,
            );
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
      figures: await slideFigures.then((f) => (f.length ? f : undefined)),
      warnings,
    };
  }

  // ── PDF ─────────────────────────────────────────────────────────────
  if (lower.endsWith(".pdf")) {
    const { text: baseText, pageCount, charCount } = await extractPdfText(buf);
    let text = baseText;
    let visionChars = 0;
    let visionImages = 0;

    let visionInputTokens: number | undefined;
    let visionOutputTokens: number | undefined;
    let croppedFigures: CroppedFigure[] = [];

    if (useVision) {
      const scanned = pageCount > 0 && charCount < pageCount * 100;
      // A scan has no text layer to protect, so it always gets full transcription.
      const figures = opts.visionMode === "figures" && !scanned;
      const cap = opts.maxVisionImages ?? (figures ? 60 : maxImages);
      const allPages = (n: number) => Array.from({ length: Math.min(pageCount, n) }, (_, i) => i + 1);
      const targets = scanned
        ? allPages(cap)
        : figures
          ? allPages(cap)
          : sparsePdfPages(baseText, pageCount).slice(0, cap);
      if ((scanned || figures) && pageCount > cap) {
        warnings.push(
          `${filename}: vision read pages 1–${cap} of ${pageCount}; figures after page ${cap} were not read.`,
        );
      }

      if (targets.length > 0) {
        if (!(await rasterizerAvailable())) {
          warnings.push(
            `${filename}: ${targets.length} page(s) appear to be images, but pdftoppm is not ` +
              `installed — that content was NOT read. Install poppler to enable it.`,
          );
        } else {
          try {
            // Ingest has already applied its own cap; the rasterizer's default of 12
            // would otherwise silently truncate (figures mode read pages 1–12 of 37).
            const pages = await rasterizePdf(buf, { pages: targets, maxPages: targets.length });
            if (pages.length > 0) {
              // Figure detection shares the rendered pages and runs beside the reading pass.
              const cropping = opts.figures && figures
                ? detectFigures(pages, { documentName: filename })
                    .then((d) => cropFigures(buf, d.figures))
                    .catch(() => [] as CroppedFigure[])
                : Promise.resolve([] as CroppedFigure[]);
              const v = await transcribeImages(
                pages.map((p) => ({
                  base64: p.base64,
                  mimeType: p.mimeType,
                  label: `Page ${p.page}`,
                })),
                { documentName: filename, mode: figures ? "figures" : "transcribe" },
              );
              croppedFigures = await cropping;
              visionImages = v.imagesSent;
              visionInputTokens = v.inputTokens;
              visionOutputTokens = v.outputTokens;
              if (v.text) {
                text += markVisionText(filename, v.text);
                visionChars = v.text.length;
              }
              if (v.failedLabels) {
                warnings.push(
                  `${filename}: vision could not read ${v.failedLabels.join(", ")} after a retry; ` +
                    `diagrams there are missing.`,
                );
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

    return {
      text,
      charCount: text.length,
      units: pageCount,
      visionChars,
      visionImages,
      visionInputTokens,
      visionOutputTokens,
      figures: croppedFigures.length ? croppedFigures : undefined,
      warnings,
    };
  }

  // ── Plain text / markdown ───────────────────────────────────────────
  const { text } = extractText(buf.toString("utf-8"));
  return { text, charCount: text.length, units: 0, visionChars: 0, visionImages: 0, warnings };
}
