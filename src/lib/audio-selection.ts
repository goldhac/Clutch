/**
 * audio-selection.ts — what a student is allowed to change about their topic split (#6).
 *
 * Lives beside the route rather than in it because it is the part worth testing on its own: these
 * numbers are handed straight to the worker, which uses them to decide what material an episode is
 * spoken from and how long it speaks. A UI bug or a hand-written request must not be able to ask
 * for a 200-minute episode, an episode about no files, or two topics claiming one index.
 */
import { MAX_EPISODE_MINUTES, MIN_TOPIC_MINUTES, tooThinToTeach, type Topic } from "@/engine/topic-split";

const PRIORITIES = new Set(["T1", "T2", "T3"]);
const MAX_TOPIC_TITLE = 300;
const MERGE_REASONS = new Set(["same subject", "too thin", "joined by hand"]);

/**
 * Accept an edited split only if every topic is still a usable instruction to the worker: a real
 * index, a title, the files it covers, and a length inside the range an episode can be. A student
 * dragging topics around in the UI cannot talk us into a 200-minute episode or one about no files.
 */
export function sanitizeTopics(raw: unknown): Topic[] | null {
  if (!Array.isArray(raw) || !raw.length) return null;
  const out: Topic[] = [];
  const seen = new Set<number>();
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const t = item as Record<string, unknown>;
    const index = t.index;
    const title = typeof t.title === "string" ? t.title.trim() : "";
    const files = Array.isArray(t.files) ? t.files.filter((f): f is string => typeof f === "string") : [];
    if (!Number.isInteger(index) || (index as number) < 0) return null;
    if (seen.has(index as number)) return null;
    seen.add(index as number);
    if (!title || title.length > MAX_TOPIC_TITLE) return null;
    if (!files.length) return null;
    const minutes = Number(t.episodeMinutes);
    if (!Number.isFinite(minutes) || minutes < MIN_TOPIC_MINUTES || minutes > MAX_EPISODE_MINUTES) return null;
    const priority = typeof t.priority === "string" && PRIORITIES.has(t.priority) ? t.priority : "T2";
    out.push({
      index: index as number,
      title,
      files,
      chars: Number.isFinite(Number(t.chars)) ? Number(t.chars) : 0,
      materialMinutes: Number.isFinite(Number(t.materialMinutes)) ? Number(t.materialMinutes) : minutes,
      episodeMinutes: Math.round(minutes),
      priority: priority as Topic["priority"],
      examMentions: Number.isFinite(Number(t.examMentions)) ? Number(t.examMentions) : 0,
      merged: MERGE_REASONS.has(t.merged as string) ? (t.merged as Topic["merged"]) : undefined,
    });
  }
  return out;
}

/**
 * Which topics are worth offering, and what to say about the ones that are not (#21).
 *
 * The worker refuses a thin topic before it spends (episode-job.ts) — that is the gate that
 * protects the credit. This is the earlier, kinder half: a student should be told on the page that
 * a chapter is unreadable, not after they have ticked it and waited for a queued job to fail.
 *
 * `usable` is empty with `topics` non-empty only when the whole pack is unreadable, which is a
 * refusal rather than a filter — almost always a scan with no text layer.
 */
export function offerableTopics(topics: Topic[]): { usable: Topic[]; note: string | null } {
  const usable = topics.filter((t) => !tooThinToTeach(t.chars));
  const thin = topics.filter((t) => tooThinToTeach(t.chars));
  if (!thin.length) return { usable, note: null };
  const named = thin.map((t) => `"${t.title}"`).join(", ");
  return {
    usable,
    note:
      `${named} ${thin.length === 1 ? "has" : "have"} too little readable text to make an episode ` +
      `from, so ${thin.length === 1 ? "it is" : "they are"} not offered.`,
  };
}
