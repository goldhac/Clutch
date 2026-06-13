/**
 * parse/text.ts — pasted text passthrough.
 *
 * Trivial today; this file exists so the route handler can dispatch
 * by file extension to a single interface (extractPdfText / extractText
 * / extractPptxText[stub] / extractDocxText[stub]).
 */
export function extractText(raw: string): { text: string; charCount: number } {
  const text = raw
    .replace(/\r\n/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, charCount: text.length };
}
