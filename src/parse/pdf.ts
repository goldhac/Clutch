/**
 * parse/pdf.ts — PDF → plain text extraction.
 *
 * pdf-parse is a thin wrapper around pdf.js. Good enough for slide
 * decks + review guides + past exams. Bad at heavy diagrams / image-
 * only PDFs (no OCR) — those need the PPTX path or pdfjs-dist with a
 * dedicated extractor. We accept that tradeoff for v1.
 */
// @ts-expect-error — @types/pdf-parse v1 mismatches the v2 runtime; the
// .pdf() default export is correct at runtime.
import pdfParse from "pdf-parse";

export interface ExtractedPDF {
  text: string;
  pageCount: number;
  charCount: number;
}

export async function extractPdfText(buffer: Buffer | Uint8Array): Promise<ExtractedPDF> {
  // pdf-parse expects a Node Buffer.
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  // pdf.js writes font-decoding warnings to console.log directly
  // ("Warning: TT: undefined function: 32" etc.). They're not actionable
  // and they pollute CLI stdout for JSON piping — swallow them just for
  // the duration of the parse.
  const origLog = console.log;
  console.log = () => {};
  let result: { text?: string; numpages?: number };
  try {
    result = await pdfParse(buf);
  } finally {
    console.log = origLog;
  }
  const text = normalizeText(result.text ?? "");
  return {
    text,
    pageCount: result.numpages ?? 0,
    charCount: text.length,
  };
}

/**
 * Drop excessive whitespace + page-marker artifacts that hurt the LLM's
 * token budget without adding signal. Conservative — we don't want to
 * destroy structure the model relies on.
 */
function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/ /g, " ") // non-breaking spaces → regular
    .replace(/[\t ]+/g, " ") // collapse runs of tabs/spaces
    .replace(/\n{3,}/g, "\n\n") // collapse triple-or-more newlines
    .trim();
}
