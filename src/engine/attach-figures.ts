/**
 * attach-figures.ts — put the diagrams the ingest cut out onto the generated sheet (issue #15).
 *
 * The engine never sees or writes images. After generation the server attaches the best few
 * figures to the content and gives each a home topic, read from the topics' own citations:
 * a figure from "21-attn.pdf p35" belongs to the topic that cites "21-attn.pdf p29-36".
 */
import type { SheetContent, SheetFigure } from "@/contract/sheet-content";
import type { CroppedFigure } from "@/parse/figures";
import { augmentTopicSources } from "@/components/sheet/course-order";

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
function topicFor(
  filename: string,
  fig: { page: number; caption: string; what: string },
  topics: SheetContent["topics"],
  itemWords: Map<string, Set<string>> = new Map(),
): string | undefined {
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
    // The topic's own lines talk about the thing in the picture ("dartboard", "octagon") even when
    // neither the topic's name nor its citations do. A weak signal, capped, so it only breaks ties
    // and rescues figures that would otherwise have no home.
    const mine = itemWords.get(t.name);
    if (mine) score += Math.min(1.2, [...captionWords].filter((w) => mine.has(w)).length * 0.4);
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
  // Topics may cite only a review sheet; their lines say which deck and slides they came from.
  const located = augmentTopicSources(content);
  const itemWords = new Map<string, Set<string>>();
  for (const items of [content.formulas, content.concepts, content.questions] as { topic?: string }[][]) {
    for (const it of items) {
      if (!it.topic) continue;
      const rec = it as Record<string, unknown>;
      const bag = itemWords.get(it.topic) ?? new Set<string>();
      for (const w of words(`${rec.name ?? ""} ${rec.term ?? ""} ${rec.q ?? ""} ${rec.ex ?? ""}`)) bag.add(w);
      itemWords.set(it.topic, bag);
    }
  }
  perFile.forEach((file, fi) => {
    file.figures.forEach((f, i) => {
      if (f.importance < MIN_IMPORTANCE || f.image.length > MAX_IMAGE_CHARS) return;
      all.push({
        id: `fig-${fi}-${f.page}-${i}`,
        caption: f.caption || `Figure, p${f.page}`,
        what: f.what,
        // Same citation style the engine uses: pages for documents, slides for decks.
        src: `${file.filename} ${/\.pptx?$/i.test(file.filename) ? "Slide " : "p"}${f.page}`,
        importance: f.importance,
        image: f.image,
        w: f.w,
        h: f.h,
        topic: topicFor(file.filename, f, located, itemWords),
      });
    });
  });
  if (all.length === 0) return content;
  // Lecture slides and the notes made from them carry the same picture ("Dartboard with regions"
  // came back from both files on a real pack). Mostly the same caption words = the same figure;
  // after the sort below, the one kept is the more important.
  // Most important first; document order breaks ties so the tray reads like the course.
  const order = new Map(all.map((f, i) => [f.id, i]));
  all.sort((a, b) => b.importance - a.importance || order.get(a.id)! - order.get(b.id)!);
  const seen: { words: Set<string>; page: number; file: string }[] = [];
  const unique = all.filter((f) => {
    const mine = words(f.caption);
    const page = Number(/(\d+)$/.exec(f.src)?.[1] ?? -1);
    const file = f.src.replace(/\s+(?:p|Slide )\d+$/, "");
    const dup = mine.size > 0 && seen.some((other) => {
      const shared = [...mine].filter((w) => other.words.has(w)).length / Math.min(mine.size, other.words.size);
      // Notes made from slides keep the slide's page: same page in ANOTHER file, half the words is
      // enough. (Within one file, two figures on a page are two figures: a homework page showed
      // two different pseudocode listings.)
      return shared >= 0.75 || (other.page === page && other.file !== file && shared >= 0.5);
    });
    if (!dup) seen.push({ words: mine, page, file });
    return !dup;
  });
  return { ...content, figures: unique.slice(0, MAX_FIGURES) };
}
