/**
 * ingest-cache.ts — read a lecture once, not once per attempt.
 *
 * Extraction is deterministic: the same bytes, read with the same options, always give the same
 * text and the same figures. It is also the expensive half of making a sheet — every page is
 * rendered and sent to the vision model — so a regenerate, a retry after an error, or the same
 * deck reused in a second sheet should cost nothing and return instantly.
 *
 * Best effort in both directions: a cache miss, an unreadable row or a failed write never breaks
 * a generation, it just costs what it costs today.
 */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IngestOptions, IngestResult } from "./ingest";

/** Postgres will take more, but a row this big is slower to move than the pages are to re-read. */
const MAX_CACHED_BYTES = 6_000_000;

/** The content AND the way it was read: different options, different entry. */
export function cacheKey(buf: Buffer, opts: IngestOptions): string {
  const shape = JSON.stringify({
    v: 1, // bump when extraction changes in a way that invalidates old entries
    vision: opts.vision !== false,
    mode: opts.visionMode ?? "sparse",
    figures: !!opts.figures,
    max: opts.maxVisionImages ?? null,
  });
  return createHash("sha256").update(buf).update(shape).digest("hex");
}

export async function readCache(
  supabase: SupabaseClient,
  userId: string,
  key: string,
): Promise<IngestResult | null> {
  try {
    const { data, error } = await supabase
      .from("ingest_cache")
      .select("result")
      .eq("user_id", userId)
      .eq("cache_key", key)
      .maybeSingle();
    if (error || !data) return null;
    return (data as { result: IngestResult }).result;
  } catch {
    return null;
  }
}

export async function writeCache(
  supabase: SupabaseClient,
  userId: string,
  key: string,
  filename: string,
  result: IngestResult,
): Promise<void> {
  try {
    const payload = JSON.stringify(result);
    if (payload.length > MAX_CACHED_BYTES) return; // too big to be worth moving
    await supabase
      .from("ingest_cache")
      .upsert({ user_id: userId, cache_key: key, filename, result: JSON.parse(payload), bytes: payload.length }, { onConflict: "user_id,cache_key" });
  } catch {
    /* the sheet is already made; a cache write is not worth failing it */
  }
}
