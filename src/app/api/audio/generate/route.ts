/**
 * /api/audio/generate — queue episodes for the topics the student chose (#6).
 *
 * This is where money moves, so it is the careful one:
 *
 *   **It queues a SUBSET.** The student edited the split on /audio and ticked what they want. A
 *   course with fourteen topics should not cost fourteen credits because the default was "all".
 *
 *   **The edited split is saved before anything is queued.** The worker reads `podcast_series.topics`
 *   to know which files an episode covers and how long it should be (episode-store.ts loadJob), so
 *   if the student merged two topics by hand and we queued against the old split, the episode would
 *   be spoken from the wrong material. Save first, queue second.
 *
 *   **A duplicate request cannot make a duplicate episode.** The partial unique index on
 *   (series_id, topic_index) rejects the second insert in the database, so two tabs, a double-click
 *   and a retried fetch all collapse to one episode. `alreadyQueued` is reported, not treated as an
 *   error — the student asked for an episode and an episode exists.
 *
 * Nothing here runs the pipeline. It queues, and the worker claims (queue.ts).
 */
import { type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { enqueueEpisode } from "@/worker/queue";
import type { Topic } from "@/engine/topic-split";
import { sanitizeTopics } from "@/lib/audio-selection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One credit per episode, per docs/11. A crash course is 3 and is not built yet. */
const CREDITS_PER_EPISODE = 1;
/**
 * How many episodes one request may queue. The per-student running cap (PER_USER_RUNNING = 2) only
 * limits how many record AT ONCE, not how many are paid for, so the spend needs its own ceiling.
 * Twelve is a full course's worth of lectures.
 */
const MAX_EPISODES_PER_REQUEST = 12;
const PRIORITIES = new Set(["T1", "T2", "T3"]);

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer().catch(() => null);
  if (!supabase) return bad("Sign in to make episodes.", 401);
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user;
  if (!user) return bad("Sign in to make episodes.", 401);

  // Same entitlement as /api/edit and /api/tweak: audio is a Pro feature. There is no credits
  // ledger yet (#14), so what was spent is recorded per episode on the row it paid for.
  if (process.env.NODE_ENV === "production") {
    const { data: profile } = await supabase.from("profiles").select("tier").eq("id", user.id).single();
    if (profile?.tier !== "pro") {
      return bad("Study episodes are a Pro feature. Upgrade to unlock.", 403);
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad("expected a JSON body");
  }
  const b = (body ?? {}) as { seriesId?: unknown; topicIndexes?: unknown; topics?: unknown };

  const seriesId = typeof b.seriesId === "string" ? b.seriesId.trim() : "";
  if (!seriesId) return bad("seriesId required");
  if (!Array.isArray(b.topicIndexes) || !b.topicIndexes.length) {
    return bad("Pick at least one topic to turn into an episode.");
  }
  const chosen = [...new Set(b.topicIndexes.filter((n): n is number => Number.isInteger(n) && n >= 0))];
  if (!chosen.length) return bad("topicIndexes must be whole numbers");
  if (chosen.length > MAX_EPISODES_PER_REQUEST) {
    return bad(
      `That's ${chosen.length} episodes at once. Pick up to ${MAX_EPISODES_PER_REQUEST} — ` +
        `you can come back for the rest.`,
    );
  }

  // The series must be theirs. RLS would enforce it, but a 404 that says so beats an empty result.
  const { data: series, error: readErr } = await supabase
    .from("podcast_series")
    .select("id, topics")
    .eq("id", seriesId)
    .eq("user_id", user.id)
    .single();
  if (readErr || !series) return bad("We couldn't find that upload. Try preparing it again.", 404);

  // The split the student edited wins over the one we proposed — but only after it is checked,
  // because these numbers decide what the worker reads and how long it speaks for.
  const stored = Array.isArray(series.topics) ? (series.topics as Topic[]) : [];
  let topics = stored;
  if (b.topics !== undefined) {
    const edited = sanitizeTopics(b.topics);
    if (!edited) return bad("that topic list isn't in a shape we can use");
    topics = edited;
    const { error: upErr } = await supabase
      .from("podcast_series")
      .update({ topics: edited, updated_at: new Date().toISOString() })
      .eq("id", seriesId)
      .eq("user_id", user.id);
    if (upErr) {
      // Do NOT queue against a split we failed to save: the worker would read the old one.
      console.error(`[/api/audio/generate] could not save the edited split: ${upErr.message}`);
      return bad("We couldn't save your changes, so nothing was queued and nothing was charged.", 503);
    }
  }
  if (!topics.length) return bad("That upload has no topics to make episodes from.", 422);

  const byIndex = new Map(topics.map((t) => [t.index, t]));
  const unknown = chosen.filter((ix) => !byIndex.has(ix));
  if (unknown.length) return bad(`no topic at ${unknown.join(", ")} in that upload`);

  // Queue in the order the student sees them, so episode 1 is the first one to record.
  const queued: { topicIndex: number; topic: string; podcastId: string | null; alreadyQueued: boolean }[] = [];
  for (const ix of [...chosen].sort((a, b2) => a - b2)) {
    const t = byIndex.get(ix)!;
    try {
      const r = await enqueueEpisode(supabase, {
        seriesId,
        userId: user.id,
        topic: t.title,
        topicIndex: ix,
        priority: PRIORITIES.has(t.priority) ? t.priority : "T2",
        creditsSpent: CREDITS_PER_EPISODE,
      });
      queued.push({ topicIndex: ix, topic: t.title, ...r });
    } catch (e) {
      // One topic failing to queue must not lose the ones that did. Report it and carry on.
      console.error(`[/api/audio/generate] topic ${ix} did not queue: ${(e as Error).message}`);
      queued.push({ topicIndex: ix, topic: t.title, podcastId: null, alreadyQueued: false });
    }
  }

  const made = queued.filter((q) => q.podcastId).length;
  const already = queued.filter((q) => q.alreadyQueued).length;
  const failed = queued.filter((q) => !q.podcastId && !q.alreadyQueued).length;
  console.log(
    `[/api/audio/generate] series=${seriesId} asked=${chosen.length} queued=${made} ` +
      `already=${already} failed=${failed}`,
  );
  if (!made && failed) {
    return bad("We couldn't queue those episodes. Nothing was charged. Please try again.", 503);
  }

  return Response.json({
    seriesId,
    episodes: queued,
    // Only new episodes cost anything; one already queued was paid for the first time.
    creditsSpent: made * CREDITS_PER_EPISODE,
    alreadyQueued: already,
  });
}

function bad(msg: string, status = 400) {
  console.warn(`[/api/audio/generate] ${status} ${msg}`);
  return new Response(msg, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
