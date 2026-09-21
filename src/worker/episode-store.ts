/**
 * episode-store.ts — the database and storage half of the worker (#5).
 *
 * `episode-job.ts` holds the shape of the work; this holds the writes. Every query filters by
 * `user_id` explicitly even though the service key bypasses RLS — the guard rail is gone here, so
 * the code has to be right by itself.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PodcastScript } from "@/contract/podcast-script";
import type { CostRow, JobDeps, SpokenAudio, Stage } from "./episode-job";

export const BUCKET = "podcasts";
/** A row still marked `running` with a heartbeat older than this was abandoned by a dead worker. */
export const STALE_AFTER_MS = 5 * 60_000;

/** Keys are `{user_id}/{podcast_id}…` — the owner is the first path segment, which storage RLS reads. */
export const audioKey = (userId: string, podcastId: string) => `${userId}/${podcastId}.mp3`;
export const previewKey = (userId: string, podcastId: string) => `${userId}/${podcastId}-preview.mp3`;

export async function setStage(db: SupabaseClient, podcastId: string, stage: Stage): Promise<void> {
  await db.from("podcasts").update({ stage, status: "running" }).eq("id", podcastId);
}

export async function heartbeat(db: SupabaseClient, podcastId: string): Promise<void> {
  await db.from("podcasts").update({ heartbeat_at: new Date().toISOString() }).eq("id", podcastId);
}

export async function store(
  db: SupabaseClient,
  userId: string,
  podcastId: string,
  audio: SpokenAudio,
): Promise<{ audioPath: string; previewPath: string }> {
  const audioPath = audioKey(userId, podcastId);
  const previewPath = previewKey(userId, podcastId);
  // upsert: a retried job overwrites its own half-finished upload instead of erroring.
  const opts = { contentType: "audio/mpeg", upsert: true };
  const a = await db.storage.from(BUCKET).upload(audioPath, audio.mp3, opts);
  if (a.error) throw new Error(`storing the episode failed: ${a.error.message}`);
  const p = await db.storage.from(BUCKET).upload(previewPath, audio.previewMp3, opts);
  if (p.error) throw new Error(`storing the preview failed: ${p.error.message}`);
  return { audioPath, previewPath };
}

export async function finish(
  db: SupabaseClient,
  podcastId: string,
  done: { audioPath: string; previewPath: string; durationS: number; chapters: unknown; script: PodcastScript },
): Promise<void> {
  const { error } = await db
    .from("podcasts")
    .update({
      status: "done",
      stage: null,
      error: null,
      audio_path: done.audioPath,
      preview_path: done.previewPath,
      duration_s: done.durationS,
      chapters: done.chapters,
      script: done.script,
    })
    .eq("id", podcastId);
  if (error) throw new Error(`marking the episode done failed: ${error.message}`);
}

export async function fail(db: SupabaseClient, podcastId: string, message: string): Promise<void> {
  await db.from("podcasts").update({ status: "failed", stage: null, error: message }).eq("id", podcastId);
}

/**
 * Give the credit back, once.
 *
 * Conditional on `refunded = false`, so the SECOND caller updates no rows and is told it did
 * nothing. That is what makes a retried job, a duplicated message, or two racing workers safe —
 * and the database backs it up: `refunded` implies `credits_spent > 0`.
 */
export async function refund(db: SupabaseClient, podcastId: string): Promise<boolean> {
  const { data, error } = await db
    .from("podcasts")
    .update({ refunded: true })
    .eq("id", podcastId)
    .eq("refunded", false)
    .gt("credits_spent", 0)
    .select("id");
  if (error) throw new Error(`refund failed: ${error.message}`);
  return (data ?? []).length > 0;
}

export async function recordCost(db: SupabaseClient, podcastId: string, userId: string, row: CostRow): Promise<void> {
  const { error } = await db.from("podcast_costs").insert({
    podcast_id: podcastId,
    user_id: userId,
    stage: row.stage,
    model: row.model ?? null,
    input_tokens: row.inputTokens ?? 0,
    output_tokens: row.outputTokens ?? 0,
    audio_tokens: row.audioTokens ?? 0,
    discarded: row.discarded ?? 0,
    cost_usd: row.costUsd,
    seconds: row.seconds ?? null,
  });
  // A missing cost row must never fail a finished episode; it is accounting, not the product.
  if (error) console.error(`[worker] could not record cost for ${podcastId}: ${error.message}`);
}

/**
 * Delete a series, audio and all.
 *
 * Found while testing the schema (#2): **Supabase blocks DELETE on `storage.objects` from SQL**
 * (`storage.protect_delete`), so a database cascade can never remove audio. Deleting the rows
 * first would orphan every MP3 in the bucket with no way left to find them. So: list the objects,
 * remove them through the Storage API, and only then delete the row and let the cascade run.
 */
export async function deleteSeries(db: SupabaseClient, userId: string, seriesId: string): Promise<{ objectsRemoved: number }> {
  const { data: episodes, error } = await db
    .from("podcasts")
    .select("id")
    .eq("series_id", seriesId)
    .eq("user_id", userId);
  if (error) throw new Error(`could not list the episodes: ${error.message}`);

  const keys = (episodes ?? []).flatMap((e) => [audioKey(userId, e.id as string), previewKey(userId, e.id as string)]);
  let removed = 0;
  if (keys.length) {
    const { data, error: rmErr } = await db.storage.from(BUCKET).remove(keys);
    // Objects that were never written come back as misses, not errors; a real failure stops us,
    // because deleting the rows now would strand whatever is still in the bucket.
    if (rmErr) throw new Error(`could not remove the audio: ${rmErr.message}`);
    removed = (data ?? []).length;
  }
  const { error: delErr } = await db.from("podcast_series").delete().eq("id", seriesId).eq("user_id", userId);
  if (delErr) throw new Error(`could not delete the series: ${delErr.message}`);
  return { objectsRemoved: removed };
}

/** The live dependency set for `runEpisodeJob`. */
export function storeDeps(
  db: SupabaseClient,
  engine: Pick<JobDeps, "outline" | "script" | "speak">,
): JobDeps {
  return {
    async loadJob(podcastId) {
      const { data, error } = await db
        .from("podcasts")
        .select("user_id, topic, credits_spent, series_id, podcast_series(pack_text)")
        .eq("id", podcastId)
        .single();
      if (error || !data) return null;
      const series = data.podcast_series as unknown as { pack_text: string | null } | null;
      return {
        userId: data.user_id as string,
        topic: data.topic as string,
        source: series?.pack_text ?? "",
        minutes: 24,
        creditsSpent: (data.credits_spent as number) ?? 0,
      };
    },
    setStage: (id, stage) => setStage(db, id, stage),
    heartbeat: (id) => heartbeat(db, id),
    store: (userId, id, audio) => store(db, userId, id, audio),
    finish: (id, done) => finish(db, id, done),
    fail: (id, message) => fail(db, id, message),
    refund: (id) => refund(db, id),
    recordCost: (id, userId, row) => recordCost(db, id, userId, row),
    ...engine,
  };
}
