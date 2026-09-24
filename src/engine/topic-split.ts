/**
 * topic-split.ts — one upload becomes a series of episodes (#6).
 *
 * This is the most expensive thing in the product to get wrong. A bad split does not waste a
 * little space the way a bad sheet line does; it spends a whole episode's credits on a topic that
 * was never a topic. So the split is deterministic, explains itself, and is shown to the student
 * to fix BEFORE anything is spent (FR-6).
 *
 * Three rules, in order:
 *
 *  1. **One source file is one topic.** The precedent is `BUILD-LOG.md` §B.6 — combining lectures
 *     dilutes focus, and a diluted episode is the failure mode of every generated podcast.
 *
 *  2. **Consecutive files with the same subject are one topic.** A real course does not obey
 *     rule 1: the test pack has `12-mt.pdf` and `13-mt.pdf`, `15-embeddings.pdf` and
 *     `16-embeddings.pdf`, `8-parsing.pdf` and `9-parsing.pdf`. Those are two-part lectures, not
 *     two topics, and splitting them makes two half-episodes that each stop mid-idea.
 *
 *  3. **A topic too thin to fill five minutes merges with its neighbour.** Padding is what makes
 *     generated audio unlistenable, and the engine will pad if asked for twenty minutes from four
 *     minutes of material. Merging is the honest alternative.
 *
 * Priority (T1/T2/T3) is not about length. It reads the student's OWN review sheets and past
 * exams: a topic those documents keep mentioning is the one to listen to first.
 */
import type { FileTag } from "./prompt";

export interface SourceFile {
  filename: string;
  tag: FileTag;
  text: string;
}

export type MergeReason = "same subject" | "too thin";

export interface Topic {
  /** Position in the course, from the order the files were given. */
  index: number;
  title: string;
  files: string[];
  chars: number;
  /** How much audio this material could support. Decides merging. */
  materialMinutes: number;
  /** How long the episode will actually be — what the student is shown. */
  episodeMinutes: number;
  priority: "T1" | "T2" | "T3";
  /** How many times the student's review sheets or past exams mention it. */
  examMentions: number;
  /** Present when this topic is more than one file, and why. */
  merged?: MergeReason;
}

/**
 * Measured, not guessed: the attention lecture's 22,031 characters of source produced a 19:35
 * episode. That is ~1,100 characters of source per minute of finished audio. One data point, so
 * treat it as an estimate — it decides only whether a topic is thin enough to merge.
 */
export const CHARS_PER_AUDIO_MINUTE = 1_100;
/** Below this, an episode is padding held together by two voices. Merge instead. */
export const MIN_TOPIC_MINUTES = 5;
/**
 * A long topic does not make a longer episode; it makes a fuller one. Measured on the real pack:
 * a lecture runs 6.7k–17.5k characters, so a single one supports roughly 6–16 minutes and a
 * two-part lecture about twenty. Past that the episode selects rather than sprawls.
 */
export const MAX_EPISODE_MINUTES = 24;
/** Above this a topic is long enough to stand alone even if its neighbour is thin. */
const SELF_SUFFICIENT_MINUTES = 12;

/** Documents that tell us what the exam cares about. */
const EXAM_TAGS: FileTag[] = ["past_exam", "review"];
/** Tag authority, mirroring the sheet engine's table (relevance.ts) so both agree. */
const TAG_AUTHORITY: Record<string, number> = {
  past_exam: 22, review: 14, homework: 10, formula_sheet: 8, slides: 6, notes: 4,
};

/**
 * Words that describe the FILE, never the subject. "introduction" is deliberately absent: an
 * intro lecture's subject IS the introduction, and stripping it left the topic with no name at all.
 */
const STOP = new Set([
  "lecture", "slides", "notes", "final", "copy", "part", "chapter", "week", "class", "session",
  "handout", "updated", "new", "draft", "v1", "v2", "rev",
]);

/**
 * The subject a filename is about: no extension, no leading lecture number, no boilerplate.
 * "12-mt.pdf" → "mt" · "Chapter 03_final.pptx" → "chapter 03" → "03"… which is why bare numbers
 * fall back to the whole name (see below).
 */
export function subjectKey(filename: string): string {
  const base = filename.replace(/\.[a-z0-9]{1,5}$/i, "");
  const words = base
    .replace(/[_\-.]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    // A leading number is a lecture index, not a subject.
    .filter((w, i) => !(i === 0 && /^\d+$/.test(w)))
    .filter((w) => !STOP.has(w));
  const key = words.filter((w) => !/^\d+$/.test(w)).join(" ");
  // "Chapter 03" has no word left once "chapter" goes: keep the number so chapters stay distinct.
  return key || words.join(" ") || base.toLowerCase();
}

/** What a student should see: the filename cleaned up, not a slug. */
export function titleOf(filename: string): string {
  const key = subjectKey(filename);
  const pretty = key.replace(/\b([a-z])/g, (m) => m.toUpperCase());
  return pretty.length > 1 ? pretty : filename.replace(/\.[a-z0-9]{1,5}$/i, "");
}

const estimateMinutes = (chars: number) => Math.round((chars / CHARS_PER_AUDIO_MINUTE) * 10) / 10;
/** What we would actually make from it: never padding, never sprawl. */
const episodeLength = (materialMinutes: number) =>
  Math.round(Math.min(MAX_EPISODE_MINUTES, Math.max(MIN_TOPIC_MINUTES, materialMinutes)));

/** Distinctive words of a topic, for asking whether the exam material mentions it. */
function topicWords(t: { title: string; files: string[] }): string[] {
  return [...new Set(
    `${t.title} ${t.files.join(" ")}`
      .toLowerCase()
      .replace(/[^a-z\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOP.has(w)),
  )];
}

export interface SplitResult {
  topics: Topic[];
  /** Plain sentences for the page: what was merged and why. */
  notes: string[];
}

export function splitTopics(files: SourceFile[]): SplitResult {
  const notes: string[] = [];
  const teaching = files.filter((f) => !EXAM_TAGS.includes(f.tag));
  // Review sheets and past exams say what matters; they are not episodes of their own.
  const examText = files
    .filter((f) => EXAM_TAGS.includes(f.tag))
    .map((f) => f.text.toLowerCase())
    .join("\n");
  if (examText) {
    const n = files.length - teaching.length;
    notes.push(`${n} review or past-exam file${n === 1 ? "" : "s"} shaped the order — ${n === 1 ? "it is" : "they are"} not made into episodes.`);
  }
  if (!teaching.length) return { topics: [], notes: [...notes, "No lecture material to turn into episodes."] };

  // ── Rule 2: consecutive files on the same subject are one topic ────────────────────────────
  const groups: { key: string; files: SourceFile[] }[] = [];
  for (const f of teaching) {
    const key = subjectKey(f.filename);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.files.push(f);
    else groups.push({ key, files: [f] });
  }

  let topics: Topic[] = groups.map((g, index) => {
    const chars = g.files.reduce((n, f) => n + f.text.length, 0);
    return {
      index,
      title: titleOf(g.files[0].filename),
      files: g.files.map((f) => f.filename),
      chars,
      materialMinutes: estimateMinutes(chars),
      episodeMinutes: episodeLength(estimateMinutes(chars)),
      priority: "T2" as const,
      examMentions: 0,
      merged: g.files.length > 1 ? ("same subject" as MergeReason) : undefined,
    };
  });
  for (const t of topics) {
    if (t.merged === "same subject") {
      notes.push(`${t.files.join(" and ")} are one topic — they are the same lecture in two parts.`);
    }
  }

  // ── Rule 3: a topic too thin to fill five minutes joins its neighbour ──────────────────────
  const merge = (a: Topic, b: Topic): Topic => ({
    index: a.index,
    title: a.title === b.title ? a.title : `${a.title} + ${b.title}`,
    files: [...a.files, ...b.files],
    chars: a.chars + b.chars,
    materialMinutes: estimateMinutes(a.chars + b.chars),
    episodeMinutes: episodeLength(estimateMinutes(a.chars + b.chars)),
    priority: "T2",
    examMentions: 0,
    merged: "too thin",
  });

  let changed = true;
  while (changed && topics.length > 1) {
    changed = false;
    for (let i = 0; i < topics.length; i++) {
      if (topics[i].materialMinutes >= MIN_TOPIC_MINUTES) continue;
      // Join whichever neighbour is smaller — merging into an already-long topic buries it.
      const prev = topics[i - 1];
      const next = topics[i + 1];
      const pick =
        !prev ? "next" :
        !next ? "prev" :
        prev.materialMinutes <= next.materialMinutes ? "prev" : "next";
      const other = pick === "prev" ? prev : next;
      if (!other) continue;
      // Do not bury a thin topic inside a long one if it can wait for a thinner neighbour.
      if (other.materialMinutes > SELF_SUFFICIENT_MINUTES && topics.some((t, j) => j !== i && t.materialMinutes < MIN_TOPIC_MINUTES)) continue;
      const [a, b] = pick === "prev" ? [other, topics[i]] : [topics[i], other];
      const joined = merge(a, b);
      notes.push(`${a.title} (${a.materialMinutes} min of material) and ${b.title} (${b.materialMinutes} min) are one episode — either alone is too thin to be worth listening to.`);
      topics.splice(Math.min(topics.indexOf(a), topics.indexOf(b)), 2, joined);
      changed = true;
      break;
    }
  }

  // ── Priority: what the student's own exam material keeps mentioning ────────────────────────
  topics = topics.map((t, index) => {
    const words = topicWords(t);
    const mentions = examText ? words.reduce((n, w) => n + (examText.split(w).length - 1), 0) : 0;
    return { ...t, index, examMentions: mentions };
  });

  const authority = (t: Topic) => {
    const tags = t.files.map((name) => teaching.find((f) => f.filename === name)?.tag ?? "slides");
    return Math.max(...tags.map((tag) => TAG_AUTHORITY[tag] ?? 4));
  };
  const scored = topics.map((t) => ({
    t,
    // Mentions dominate; authority and depth break ties. A topic the review sheet names ten times
    // outranks a longer one it never mentions.
    score: t.examMentions * 10 + authority(t) + Math.min(10, t.materialMinutes / 2),
  }));
  const ordered = [...scored].sort((a, b) => b.score - a.score);
  const t1 = Math.max(1, Math.ceil(ordered.length / 3));
  const t2 = Math.max(t1, Math.ceil((ordered.length * 2) / 3));
  ordered.forEach((s, rank) => {
    s.t.priority = rank < t1 ? "T1" : rank < t2 ? "T2" : "T3";
  });

  if (examText && ordered[0]?.t.examMentions) {
    notes.push(`"${ordered[0].t.title}" is first: your review material mentions it most.`);
  }
  // Course order is what a student expects to see; priority is a label on it.
  return { topics: topics.map((t, index) => ({ ...t, index })), notes };
}

/** What the whole series would cost, in credits: one per episode. */
export const creditsFor = (topics: Topic[]): number => topics.length;
