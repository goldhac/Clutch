/**
 * pdf-verify.ts — programmatic enforcement of the "one page is sacred" rule.
 *
 * The single most important hard rule in the entire system
 * (Build Plan §0 / Handoff rule 1 / Output Spec §10):
 *
 *   Every MAX sheet MUST fit on exactly one A4 landscape page. If we
 *   can't guarantee that programmatically, the product is broken,
 *   regardless of how nice the renderer looks.
 *
 * This module reads the PDF byte stream after Chromium emits it and
 * asserts the page count matches what was requested. Throws a typed
 * error that the route surface can catch + display.
 *
 * Implementation uses pdf-lib (pure JS, no system deps) — the spec
 * suggested pypdf via python3, but in-process keeps the deploy footprint
 * smaller and avoids a python dependency.
 */
import { PDFDocument } from "pdf-lib";

export class PageCountError extends Error {
  constructor(
    public readonly expected: number,
    public readonly actual: number,
    public readonly density: string,
  ) {
    super(
      `Page count mismatch for density="${density}": expected ${expected}, got ${actual}. ` +
        `This is the hard "one page is sacred" rule firing. The renderer or the ` +
        `content is over-density; either trim the sample (Step 7 Tighten will do ` +
        `this automatically once the engine ships) or use a less dense mode.`,
    );
    this.name = "PageCountError";
  }
}

/**
 * Read a PDF byte stream and return its page count.
 *
 * Wrapped in its own function so callers can log/measure rendering time
 * separately from verification time (useful when we wire metrics).
 */
export async function pdfPageCount(buf: Uint8Array | ArrayBuffer): Promise<number> {
  const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
  return doc.getPageCount();
}

/**
 * Throw PageCountError if a rendered PDF has the wrong page count.
 *
 * Use this RIGHT AFTER Playwright's `page.pdf()` returns and BEFORE the
 * PDF is persisted or returned to the client. We never want to serve
 * a sheet that broke the constraint.
 *
 * @param buf       The PDF byte stream from Playwright's `page.pdf()`.
 * @param expected  The expected page count: 1 for single-page (default),
 *                  2 for the front/back variant (Playbook §9, Step 5).
 * @param density   Just metadata for the error message ("max", etc.).
 */
export async function assertPageCount(
  buf: Uint8Array | ArrayBuffer,
  expected: number,
  density: string,
): Promise<void> {
  const actual = await pdfPageCount(buf);
  if (actual !== expected) {
    throw new PageCountError(expected, actual, density);
  }
}
