/**
 * source-key.ts — the COMPACT source style (issue #13 follow-up).
 *
 * A citation is mostly filename: "22-bert.pdf p18-28; 23-pretrained.pdf p2".
 * Compact keeps the part that proves the line — the page — and swaps the
 * filename for a circled number explained once in the footer:
 *
 *     ①p18-28; ②p2          ① 22-bert.pdf · ② 23-pretrained.pdf
 *
 * Applied to the DATA before compose, so the composer's height estimates and the
 * fitter both see the shorter text and refill the page.
 */
import type { SheetContent } from "@/contract/sheet-content";

const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
const marker = (i: number) => CIRCLED[i] ?? `(${i + 1})`;
const FILE_RX = /[A-Za-z0-9][\w .()&+-]*?\.(?:pdf|pptx?|docx?|md|txt)\b/gi;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export interface SourceKey {
  /** Files in marker order: files[0] is ①. */
  files: string[];
  compact(src: string): string;
}

export function buildSourceKey(content: SheetContent, packFiles: { name: string }[] = []): SourceKey {
  const files: string[] = packFiles.map((f) => f.name);
  const seen = new Set(files.map((f) => f.toLowerCase()));
  // Sheets saved without pack metadata: collect the filenames the citations themselves mention.
  const allSrc = [
    ...content.topics, ...content.formulas, ...content.concepts, ...content.questions,
    ...content.traps, ...(content.tables ?? []), ...(content.verifiedPatterns ?? []),
  ].map((x) => x.src);
  for (const src of allSrc) {
    for (const m of src.matchAll(FILE_RX)) {
      const name = m[0].trim();
      if (!seen.has(name.toLowerCase())) { seen.add(name.toLowerCase()); files.push(name); }
    }
  }

  // Longest names first so "chapter 1.pdf" never eats part of "chapter 10.pdf".
  const patterns = files
    .map((name, i) => ({ i, name, stem: name.replace(/\.[a-z0-9]{1,5}$/i, "") }))
    .sort((a, b) => b.name.length - a.name.length)
    .map((f) => ({ i: f.i, rx: new RegExp(`${esc(f.name)}|${esc(f.stem)}(?![\\w-])`, "gi") }));

  const used = new Set<number>();
  const compact = (src: string) => {
    let out = src;
    for (const p of patterns) out = out.replace(p.rx, () => { used.add(p.i); return marker(p.i); });
    return out
      .replace(/([①-⑳]|\(\d+\))[\s,:]+/g, "$1")
      .replace(/\bslides?\s*/gi, "s")
      .replace(/\bpages?\s*/gi, "p")
      .replace(/\bpp?\.\s*/gi, "p")
      .replace(/\s{2,}/g, " ")
      .trim();
  };
  return { files, compact };
}

/** "① 22-bert.pdf · ② 23-pretrained.pdf" — only files some citation actually uses. */
export function sourceKeyLine(key: SourceKey, content: SheetContent): string {
  const text = JSON.stringify(content);
  return key.files
    .map((name, i) => ({ name, m: marker(i) }))
    .filter((f) => text.includes(f.m))
    .map((f) => `${f.m} ${f.name}`)
    .join(" · ");
}
