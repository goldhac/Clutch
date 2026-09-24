/**
 * queue.ts — the `podcasts` table IS the queue (#5).
 *
 * pg-boss is gone. It wanted a direct Postgres connection, and Supabase will not show you the
 * database password after creation — only reset it, breaking anything already connected. That
 * meant a second secret and a second connection to keep alive, for a queue we were barely using:
 * retries were already off, and recovery already ran off `heartbeat_at` in this table.
 *
 * So the table does it, with the standard pattern: `claim_next_episode()` takes one row with
 * `FOR UPDATE SKIP LOCKED`, applies the per-student cap in the same statement, and marks it
 * running. Two workers polling at once can never take the same episode, and the whole thing needs
 * one secret — the service key — instead of two.
 *
 * Proven against the real database (2026-09-23): two claims for one student, the third skipping
 * them for someone else, nothing claimable returning empty, abandoned episodes recovered, and a
 * live job never stolen.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** FR-20: a student may have two episodes recording at once; the rest wait their turn. */
export const PER_USER_RUNNING = 2;
/** A `running` row whose heartbeat is older than this belongs to a worker that died. */
export const STALE_AFTER = "5 minutes";
/** How often an idle worker asks for work. Recording takes minutes; this costs nothing. */
export const POLL_MS = 5_000;

export interface ClaimedEpisode {
  podcastId: string;
  userId: string;
  seriesId: string;
}

/**
 * Take the next episode, or nothing. One statement: the cap is applied and the row is marked
 * running together, so there is no window where two workers both think they have it.
 */
export async function claimNextEpisode(db: SupabaseClient): Promise<ClaimedEpisode | null> {
  const { data, error } = await db.rpc("claim_next_episode", {
    per_user_limit: PER_USER_RUNNING,
    stale_after: STALE_AFTER,
  });
  if (error) throw new Error(`could not claim an episode: ${error.message}`);
  const row = (data as { episode_id: string; owner_id: string; series: string }[] | null)?.[0];
  return row ? { podcastId: row.episode_id, userId: row.owner_id, seriesId: row.series } : null;
}

/** Put abandoned episodes back on the queue. Returns how many were recovered. */
export async function recoverStaleEpisodes(db: SupabaseClient): Promise<number> {
  const { data, error } = await db.rpc("recover_stale_episodes", { stale_after: STALE_AFTER });
  if (error) throw new Error(`could not recover abandoned episodes: ${error.message}`);
  return (data as number | null) ?? 0;
}

/**
 * Put an episode on the queue — which, here, means creating it as `queued`.
 *
 * The partial unique index `(series_id, topic_index) where status <> 'failed'` is what makes two
 * tabs asking for the same episode safe: the second insert is rejected by the database, not by
 * anything we remembered to check.
 */
export async function enqueueEpisode(
  db: SupabaseClient,
  episode: { seriesId: string; userId: string; topic: string; topicIndex: number; priority?: "T1" | "T2" | "T3"; creditsSpent?: number },
): Promise<{ podcastId: string | null; alreadyQueued: boolean }> {
  const { data, error } = await db
    .from("podcasts")
    .insert({
      series_id: episode.seriesId,
      user_id: episode.userId,
      topic: episode.topic,
      topic_index: episode.topicIndex,
      priority: episode.priority ?? "T2",
      credits_spent: episode.creditsSpent ?? 0,
      status: "queued",
    })
    .select("id")
    .single();
  if (error) {
    // 23505 = unique violation: this topic already has a live episode. Not an error to a student.
    if (error.code === "23505") return { podcastId: null, alreadyQueued: true };
    throw new Error(`could not queue the episode: ${error.message}`);
  }
  return { podcastId: (data as { id: string }).id, alreadyQueued: false };
}

/**
 * Is this student at their limit? Kept for the UI, which wants to say "queued behind 2" without
 * asking the database to claim anything. The claim itself enforces the cap; this only describes it.
 */
export function atUserLimit(running: { heartbeat_at: string | null }[], staleAfterMs: number, now = Date.now()): boolean {
  const live = running.filter((r) => {
    if (!r.heartbeat_at) return true; // just claimed, hasn't beaten yet
    return now - new Date(r.heartbeat_at).getTime() < staleAfterMs;
  });
  return live.length >= PER_USER_RUNNING;
}
