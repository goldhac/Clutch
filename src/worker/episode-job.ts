/**
 * episode-job.ts — one episode, start to finish, as a background job (#5).
 *
 *   ingest → outline → script → claims → voicing → assembling → stored → done
 *
 * Written against injected dependencies rather than imports, so the whole thing — including the
 * failure and refund paths, which are the parts that must never be wrong — can be tested without
 * a database, a queue, or a single paid model call.
 *
 * Two rules the acceptance criteria turn on:
 *
 *   **A credit is refunded exactly once.** The refund is a conditional UPDATE: it only matches a
 *   row that is not already refunded, and the database re-checks (`refunded` implies
 *   `credits_spent > 0`). A retried job, a duplicated message, or two workers racing can all call
 *   it, and at most one write lands.
 *
 *   **A killed worker leaves a recoverable row, not a stuck one.** `running` alone is not a
 *   claim — `heartbeat_at` is. A row whose heartbeat has gone cold is free to be retried.
 */
import { MIN_SOURCE_CHARS, tooThinToTeach } from "@/engine/topic-split";
import type { PodcastOutline } from "@/contract/podcast-outline";
import type { PodcastScript } from "@/contract/podcast-script";

/** Stages, in order. These are the strings the `podcasts.stage` column accepts. */
export const STAGES = ["ingest", "outline", "script", "claims", "voicing", "assembling"] as const;
export type Stage = (typeof STAGES)[number];

export interface CostRow {
  stage: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  audioTokens?: number;
  /** Renders paid for and thrown away (voice re-takes). */
  discarded?: number;
  costUsd: number;
  seconds?: number;
}

export interface SpokenAudio {
  mp3: Uint8Array;
  previewMp3: Uint8Array;
  durationSeconds: number;
  chapters: { section: string; startS: number }[];
}

/** Everything the job touches, so a test can hand it fakes. */
export interface JobDeps {
  loadJob(podcastId: string): Promise<{
    userId: string;
    topic: string;
    source: string;
    minutes: number;
    creditsSpent: number;
  } | null>;
  setStage(podcastId: string, stage: Stage): Promise<void>;
  heartbeat(podcastId: string): Promise<void>;
  /**
   * `minutes` is the length THIS topic's material supports, from the split the student approved.
   * It is a required parameter rather than an option because leaving it out is exactly the bug it
   * was added for: both engine calls default to 24 minutes, and for months every episode was
   * written to that length regardless of its topic — a six-minute topic padded to twenty-four,
   * which is the failure MIN_TOPIC_MINUTES exists to prevent, and paid for at four times the price.
   */
  outline(source: string, minutes: number, onStage: (s: Stage) => void): Promise<PodcastOutline>;
  script(outline: PodcastOutline, source: string, minutes: number, onStage: (s: Stage) => void): Promise<PodcastScript>;
  speak(script: PodcastScript, outline: PodcastOutline, onStage: (s: Stage) => void): Promise<SpokenAudio>;
  /** Returns the storage paths it wrote. */
  store(userId: string, podcastId: string, audio: SpokenAudio): Promise<{ audioPath: string; previewPath: string }>;
  finish(podcastId: string, done: { audioPath: string; previewPath: string; durationS: number; chapters: unknown; script: PodcastScript }): Promise<void>;
  fail(podcastId: string, message: string): Promise<void>;
  /** MUST be conditional on `refunded = false`. Returns whether this call was the one that refunded. */
  refund(podcastId: string): Promise<boolean>;
  recordCost(podcastId: string, userId: string, row: CostRow): Promise<void>;
}

export interface JobResult {
  status: "done" | "failed";
  message?: string;
  refunded?: boolean;
}

/**
 * What the student is told when it breaks. The technical reason goes to the logs; this goes on
 * their screen, so it says what happened to their credit and what to do — never a stack trace.
 */
export function friendlyFailure(err: unknown): string {
  // Already the right words, and more specific than anything below could be.
  if (err instanceof ThinSourceError) return err.message;
  const msg = err instanceof Error ? err.message : String(err);
  if (/spending cap|quota|RESOURCE_EXHAUSTED|\b429\b|\b402\b|Too Many Requests|prepayment credits|credits are depleted|billing/i.test(msg)) {
    // Deliberately does NOT say "try again shortly": when the provider is out of credit, retrying
    // is the one thing that cannot help, and telling a student to retry the night before an exam
    // sends them into a loop against a wall.
    return "Clutch can't record episodes right now — the problem is on our side, not with your files. Your credit has been returned, and we're on it.";
  }
  if (/GEMINI_API_KEY|api key|unauthor|forbidden|\b401\b|\b403\b/i.test(msg)) {
    return "Audio is temporarily unavailable. Your credit has been returned and nothing was charged.";
  }
  if (/ffmpeg|ENOENT/i.test(msg)) {
    return "We couldn't finish recording this episode. Your credit has been returned — please try again.";
  }
  if (/contract|schema|failed contract/i.test(msg)) {
    return "We couldn't build an episode from this material this time. Your credit has been returned — try again, or pick a narrower topic.";
  }
  return "Something went wrong making this episode. Your credit has been returned — please try again.";
}

/**
 * Thrown before the first paid call when a topic has nothing in it to teach.
 *
 * A distinct type because the message is not a guess at what went wrong — it is the exact reason,
 * and `friendlyFailure` should pass it through rather than fall back to "something went wrong".
 */
export class ThinSourceError extends Error {
  constructor(readonly topic: string, readonly chars: number) {
    super(
      `"${topic}" has only ${chars} characters of readable text — under the ${MIN_SOURCE_CHARS} ` +
        `an episode needs. Nothing was charged. This usually means the file is a scan with no text ` +
        `layer, or the wrong file. Try the original slides or notes.`,
    );
    this.name = "ThinSourceError";
  }
}

export interface RunOptions {
  /** How often to prove the worker is still alive. */
  heartbeatMs?: number;
}

export async function runEpisodeJob(podcastId: string, deps: JobDeps, opts: RunOptions = {}): Promise<JobResult> {
  const job = await deps.loadJob(podcastId);
  if (!job) return { status: "failed", message: "This episode no longer exists." };

  // While the job runs, say so regularly. A row that stops beating is one a later worker may take.
  const beat = setInterval(() => void deps.heartbeat(podcastId).catch(() => {}), opts.heartbeatMs ?? 15_000);
  const at = async (stage: Stage) => {
    await deps.setStage(podcastId, stage);
  };

  try {
    // Before anything is paid for: is there something here to teach? The outline model will
    // happily invent an episode from an empty string and bill for it (#21), so this has to be
    // asked by us, and asked first. The failure path below refunds and marks the row.
    const chars = job.source.trim().length;
    if (tooThinToTeach(chars)) throw new ThinSourceError(job.topic, chars);

    await at("outline");
    const outline = await deps.outline(job.source, job.minutes, (s) => void at(s));
    await at("script");
    const script = await deps.script(outline, job.source, job.minutes, (s) => void at(s));
    await at("voicing");
    const audio = await deps.speak(script, outline, (s) => void at(s));
    await at("assembling");
    const paths = await deps.store(job.userId, podcastId, audio);
    await deps.finish(podcastId, {
      audioPath: paths.audioPath,
      previewPath: paths.previewPath,
      durationS: audio.durationSeconds,
      chapters: audio.chapters,
      script,
    });
    return { status: "done" };
  } catch (err) {
    // The friendly message goes on the student's screen; the real one has to go SOMEWHERE, and
    // until now it went nowhere. A live episode failed on a 402 and the only trace was
    // "couldn't reach the voice service", which cost an hour of looking in the wrong place.
    console.error(
      `[episode ${podcastId}] ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
    );
    const message = friendlyFailure(err);
    // Order matters: refund first, then mark failed. If the process dies between them the row is
    // still `running` with a cold heartbeat — recoverable — rather than `failed` with the credit
    // silently kept.
    let refunded = false;
    try {
      refunded = job.creditsSpent > 0 ? await deps.refund(podcastId) : false;
    } catch {
      // A refund that could not be written must not hide the original failure.
    }
    await deps.fail(podcastId, message);
    return { status: "failed", message, refunded };
  } finally {
    clearInterval(beat);
  }
}
