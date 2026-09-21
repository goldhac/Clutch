/**
 * queue.ts — one job per episode (#5).
 *
 * pg-boss on the Postgres we already have, so there is no second piece of infrastructure to run,
 * back up or lose. It keeps its own schema; nothing here touches the app's tables.
 *
 * **One job per EPISODE, not per series.** A 14-topic series is 14 jobs. That is the whole point:
 * one topic failing leaves the other thirteen untouched, and a student can retry the one that
 * broke instead of re-recording a set that mostly worked.
 */
import { PgBoss } from "pg-boss";

export const QUEUE = "episode";
/** FR-20: a student may have two episodes recording at once; the rest wait their turn. */
export const PER_USER_RUNNING = 2;

export interface EpisodeJob {
  podcastId: string;
  userId: string;
}

let boss: PgBoss | null = null;

export async function getBoss(): Promise<PgBoss> {
  if (boss) return boss;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "The queue needs DATABASE_URL (the Postgres connection string). Supabase dashboard → " +
        "Project Settings → Database → Connection string → URI, with the pooler port. Add it to " +
        ".env.local and to the Railway service.",
    );
  }
  boss = new PgBoss({ connectionString, schema: "pgboss" });
  boss.on("error", (e: unknown) => console.error("[queue]", e));
  await boss.start();
  await boss.createQueue(QUEUE);
  return boss;
}

export async function enqueueEpisode(job: EpisodeJob): Promise<string | null> {
  const b = await getBoss();
  // The singleton key is the episode itself: two tabs asking for the same episode enqueue once.
  // The partial unique index in the schema is the second line of defence, on the row.
  return b.send(QUEUE, job, { singletonKey: job.podcastId, retryLimit: 0 });
}

/**
 * Is this student already at their limit?
 *
 * Counted from the `podcasts` table rather than the queue, because that is where the truth is:
 * a row is `running` from the moment the worker picks it up until it finishes, and a row whose
 * heartbeat went cold is not really running at all.
 */
export function atUserLimit(running: { heartbeat_at: string | null }[], staleAfterMs: number, now = Date.now()): boolean {
  const live = running.filter((r) => {
    if (!r.heartbeat_at) return true; // just claimed, hasn't beaten yet
    return now - new Date(r.heartbeat_at).getTime() < staleAfterMs;
  });
  return live.length >= PER_USER_RUNNING;
}

export async function stopBoss(): Promise<void> {
  if (!boss) return;
  await boss.stop({ graceful: true });
  boss = null;
}
