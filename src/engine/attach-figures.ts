/**
 * attach-figures.ts — put the diagrams the ingest cut out onto the generated sheet (issue #15).
 *
 * The engine never sees or writes images. After generation the server attaches the best few
 * figures to the content and gives each a home topic, read from the topics' own citations:
 * a figure from "21-attn.pdf p35" belongs to the topic that cites "21-attn.pdf p29-36".
 */
import type { SheetContent, SheetFigure } from "@/contract/sheet-content";
import type { CroppedFigure } from "@/parse/figures";

/** Keep the sheet small enough for sessionStorage, the saved row and the PDF POST. */
const MAX_FIGURES = 8;
const MIN_IMPORTANCE = 3;
const MAX_IMAGE_CHARS = 400_000;

const stemOf = (name: string) => name.toLowerCase().replace(/\.[a-z0-9]{1,5}$/, "");

/** Page ranges a citation part mentions: "p18-28, p31" → [[18,28],[31,31]]. */
function pageRanges(part: string): [number, number][] {
  const out: [number, number][] = [];
  for (const m of part.matchAll(/(?:\bpp?\.?|\bpages?|\bslides?|\bsl\.?|\bs)\s*(\d{1,4})(?:\s*[-–]\s*(\d{1,4}))?/gi)) {
    const a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
    out.push([Math.min(a, b), Math.max(a, b)]);
  }
  return out;
}

// Words every diagram description uses; they would pull figures toward any "… Architecture" topic.
const STOP = new Set([
  "with", "from", "that", "this", "between", "using", "showing", "shows", "diagram", "figure", "illustrating",
  "illustrates", "example", "overview", "architecture", "network", "networks", "model", "models", "mechanism", "block",
]);
const words = (t: string) =>
  new Set(t.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4 && !STOP.has(w)).map((w) => w.slice(0, 7)));

/**
 * A figure's home topic. Two signals, because page numbers alone mislead: decks with
 * animation builds print "29/31" on PDF page 35, and the engine cites the printed number.
 *   - words shared between the figure's caption and the topic's NAME (strongest)
 *   - the figure's page falling in, or near, a range the topic cites
 */
function topicFor(filename: string, fig: { page: number; caption: string; what: string }, topics: SheetContent["topics"]): string | undefined {
  const stem = stemOf(filename);
  // The caption NAMES the figure; the description lists its parts (a Transformer diagram's
  // description mentions multi-head attention), so it counts for much less.
  const captionWords = words(fig.caption);
  const figWords = words(`${fig.caption} ${fig.what}`);
  // A word in most topic names ("attention" in an attention lecture) says nothing: weight by rarity.
  const nameWords = topics.map((t) => words(t.name));
  const whyWords = topics.map((t) => words(t.why));
  const rarity = (w: string, sets: Set<string>[]) => 1 / Math.max(1, sets.filter((set) => set.has(w)).length);
  let best: { name: string; score: number } | undefined;
  topics.forEach((t, i) => {
    let score = 0;
    for (const w of nameWords[i]) {
      if (captionWords.has(w)) score += 2 * rarity(w, nameWords);
      else if (figWords.has(w)) score += 0.4 * rarity(w, nameWords);
    }
    for (const w of whyWords[i]) if (figWords.has(w) && !nameWords[i].has(w)) score += 0.5 * rarity(w, whyWords);
    let distance = Infinity;
    for (const part of t.src.toLowerCase().split(";")) {
      if (!part.includes(stem)) continue;
      for (const [a, b] of pageRanges(part.replace(stem, ""))) {
        distance = Math.min(distance, fig.page < a ? a - fig.page : fig.page > b ? fig.page - b : 0);
      }
    }
    if (distance <= 4) score += 2 * (1 - distance / 5);
    if (score > 0 && (!best || score > best.score)) best = { name: t.name, score };
  });
  return best?.name;
}

export function attachFigures(
  content: SheetContent,
  perFile: { filename: string; figures: CroppedFigure[] }[],
): SheetContent {
  const all: SheetFigure[] = [];
  perFile.forEach((file, fi) => {
    file.figures.forEach((f, i) => {
      if (f.importance < MIN_IMPORTANCE || f.image.length > MAX_IMAGE_CHARS) return;
      all.push({
        id: `fig-${fi}-${f.page}-${i}`,
        caption: f.caption || `Figure, p${f.page}`,
        what: f.what,
        src: `${file.filename} p${f.page}`,
        importance: f.importance,
        image: f.image,
        w: f.w,
        h: f.h,
        topic: topicFor(file.filename, f, content.topics),
      });
    });
  });
  if (all.length === 0) return content;
  // Most important first; document order breaks ties so the tray reads like the course.
  const order = new Map(all.map((f, i) => [f.id, i]));
  all.sort((a, b) => b.importance - a.importance || order.get(a.id)! - order.get(b.id)!);
  return { ...content, figures: all.slice(0, MAX_FIGURES) };
}
