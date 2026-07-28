/**
 * topics-color.ts — assign every block a TOPIC, and every topic a color.
 *
 * The design's power is color-by-topic: a reader sees the key ("Regression
 * = maroon") and jumps straight to the maroon blocks. Our contract doesn't
 * (yet) tag each formula/concept with a topic id, so we assign one
 * deterministically by keyword overlap against the topics[] list — the
 * same topics that lead the sheet. When the engine later emits an explicit
 * `topic` per item, this becomes the fallback.
 *
 * Pure + deterministic: same content ⇒ same assignment.
 */
import type { SheetContent } from "@/contract/sheet-content";
import type { Section } from "./relevance";

/** tk-0..tk-9 map to the topic palette in semantics.css. */
export const TOPIC_COLOR_COUNT = 10;
export const topicColorClass = (topicIndex: number): string =>
  `tk-${((topicIndex % TOPIC_COLOR_COUNT) + TOPIC_COLOR_COUNT) % TOPIC_COLOR_COUNT}`;

const STOP = new Set([
  "the", "and", "for", "with", "from", "that", "this", "when", "use", "are",
  "you", "your", "per", "not", "but", "its", "has", "had", "each", "into",
  "than", "then", "over", "all", "any", "one", "two", "get", "set", "via",
  "how", "who", "why", "what", "which", "will", "can", "may", "a", "an", "of",
  "on", "in", "to", "is", "it", "or", "as", "at", "be", "by", "we", "vs",
  "given", "using", "used", "know", "find", "show", "read", "data", "value",
  "values", "exam", "review", "lecture", "pdf", "md", "sheet", "series",
]);

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .map((t) => (t.length > 4 && t.endsWith("s") ? t.slice(0, -1) : t)) // light de-plural
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

export interface TopicAssignment {
  /** topic color class for an item by its "{section}:{index}" id. */
  colorOf(id: string): string;
  /** topic color class for topic n (topics[] order). */
  topicColor(topicIndex: number): string;
  /** the topics in order, each with its assigned color class + a count of
   * how many blocks landed under it (for the key). `name` is a SHORT label
   * for the legend; `full` is the untruncated topic name. */
  legend: { name: string; full: string; colorClass: string; count: number }[];
}

/** A compact label for the topic key: cut at the first qualifier
 * (paren / middot / arrow / plus / colon) and cap length. */
export function shortTopicLabel(name: string): string {
  // Cut at the first qualifier: a paren/middot/arrow, or a SPACE-flanked
  // +/–/—/: (so hyphenated words like "Time-series" stay whole).
  let s = name.split(/\s*[(·→]|\s+[+\-—:]\s+/)[0].trim();
  if (s.length > 26) s = s.slice(0, 24).trimEnd() + "…";
  return s || name;
}

const NEUTRAL = "tk-none";

/**
 * Assign each ranked item to the best-matching topic (by keyword overlap),
 * and hand back a color lookup + the legend.
 */
export function assignTopics(content: SheetContent): TopicAssignment {
  const topics = content.topics ?? [];
  if (topics.length === 0) {
    return {
      colorOf: () => NEUTRAL,
      topicColor: () => NEUTRAL,
      legend: [],
    };
  }

  // Weighted keywords: the topic NAME is specific ("naive", "seasonal",
  // "accuracy") so it scores high; the WHY is a broad summary that often
  // name-drops every other topic, so it only breaks ties (weight 1). This
  // stops a topic whose description mentions everything from swallowing the
  // whole sheet.
  const NAME_W = 4;
  const WHY_W = 1;
  const topicKw = topics.map((t) => {
    const w = new Map<string, number>();
    for (const tok of tokens(t.name)) w.set(tok, (w.get(tok) ?? 0) + NAME_W);
    for (const tok of tokens(t.why ?? "")) w.set(tok, (w.get(tok) ?? 0) + WHY_W);
    return w;
  });
  const counts = new Array(topics.length).fill(0);
  const byId = new Map<string, number>();

  const assign = (section: Section, index: number, text: string) => {
    const toks = tokens(text);
    let best = -1;
    let bestScore = 0;
    for (let i = 0; i < topicKw.length; i++) {
      let s = 0;
      for (const tok of toks) s += topicKw[i].get(tok) ?? 0;
      // tie-break: earlier topic wins (topics are ranked best-first)
      if (s > bestScore) { bestScore = s; best = i; }
    }
    const topicIndex = best >= 0 ? best : 0; // no overlap → lead topic
    byId.set(`${section}:${index}`, topicIndex);
    counts[topicIndex]++;
  };

  content.formulas.forEach((f, i) =>
    assign("formulas", i, `${f.name} ${f.when ?? ""} ${f.trap ?? ""} ${f.vars ?? ""}`));
  content.concepts.forEach((c, i) => assign("concepts", i, `${c.term} ${c.def}`));
  content.traps.forEach((t, i) => assign("traps", i, t.text));
  content.questions.forEach((q, i) => assign("questions", i, q.q));
  (content.tables ?? []).forEach((t, i) =>
    assign("tables", i, `${t.title} ${t.cols.join(" ")}`));

  return {
    colorOf: (id) => {
      const ti = byId.get(id);
      return ti === undefined ? NEUTRAL : topicColorClass(ti);
    },
    topicColor: (topicIndex) => topicColorClass(topicIndex),
    legend: topics.map((t, i) => ({
      name: shortTopicLabel(t.name),
      full: t.name,
      colorClass: topicColorClass(i),
      count: counts[i],
    })),
  };
}
