import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
/**
 * test-audio-select.ts — choosing episodes, and what the worker then reads (#6).
 *   npx tsx scripts/test-audio-select.ts
 *
 * Two halves. The first is pure: what a student may change about their split. The second runs
 * against the REAL database with a real series, because the thing most worth proving — that an
 * episode is handed its own topic's material and its own length — is a join across two tables and
 * a jsonb column, and a fake would have proved only that the fake agrees with me.
 *
 * Everything it creates, it deletes.
 */
import assert from "node:assert/strict";
import { sanitizeTopics } from "@/lib/audio-selection";
import { enqueueEpisode } from "@/worker/queue";
import { serviceClient } from "@/lib/supabase/service";
import { storeDeps } from "@/worker/episode-store";
import { MAX_EPISODE_MINUTES, MIN_TOPIC_MINUTES } from "@/engine/topic-split";

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log(`  ok  ${name}`); };
const okAsync = async (name: string, fn: () => Promise<void>) => { await fn(); n++; console.log(`  ok  ${name}`); };

const topic = (over: Record<string, unknown> = {}) => ({
  index: 0, title: "Attention", files: ["21-attn.pdf"], chars: 22000,
  materialMinutes: 20, episodeMinutes: 20, priority: "T1", examMentions: 3, ...over,
});

// ── pure: what may be edited ────────────────────────────────────────────────────────────────
ok("a normal edited split is accepted", () => {
  const r = sanitizeTopics([topic(), topic({ index: 1, title: "Parsing", files: ["8-parsing.pdf"] })]);
  assert.ok(r);
  assert.equal(r.length, 2);
  assert.equal(r[1].title, "Parsing");
});

ok("a renamed topic keeps its files", () => {
  const r = sanitizeTopics([topic({ title: "Attention (midterm)" })]);
  assert.equal(r?.[0].title, "Attention (midterm)");
  assert.deepEqual(r?.[0].files, ["21-attn.pdf"]);
});

ok("a topic about no files is refused", () => {
  assert.equal(sanitizeTopics([topic({ files: [] })]), null);
});

ok("an episode longer than we can fill is refused", () => {
  assert.equal(sanitizeTopics([topic({ episodeMinutes: MAX_EPISODE_MINUTES + 1 })]), null);
  assert.equal(sanitizeTopics([topic({ episodeMinutes: 200 })]), null);
});

ok("an episode too short to be worth listening to is refused", () => {
  assert.equal(sanitizeTopics([topic({ episodeMinutes: MIN_TOPIC_MINUTES - 1 })]), null);
  assert.equal(sanitizeTopics([topic({ episodeMinutes: 0 })]), null);
});

ok("two topics cannot claim the same index", () => {
  assert.equal(sanitizeTopics([topic(), topic({ title: "Other" })]), null);
});

ok("junk is refused rather than coerced", () => {
  assert.equal(sanitizeTopics([]), null);
  assert.equal(sanitizeTopics(null), null);
  assert.equal(sanitizeTopics("all of them"), null);
  assert.equal(sanitizeTopics([topic({ index: -1 })]), null);
  assert.equal(sanitizeTopics([topic({ index: 1.5 })]), null);
  assert.equal(sanitizeTopics([topic({ title: "" })]), null);
  assert.equal(sanitizeTopics([topic({ title: "x".repeat(301) })]), null);
  assert.equal(sanitizeTopics([topic({ episodeMinutes: "twenty" })]), null);
});

ok("an unknown priority becomes T2 instead of being written to the database", () => {
  assert.equal(sanitizeTopics([topic({ priority: "T9" })])?.[0].priority, "T2");
  assert.equal(sanitizeTopics([topic({ priority: 7 })])?.[0].priority, "T2");
});

ok("a made-up merge reason is dropped, a real one is kept", () => {
  assert.equal(sanitizeTopics([topic({ merged: "because I said so" })])?.[0].merged, undefined);
  assert.equal(sanitizeTopics([topic({ merged: "too thin" })])?.[0].merged, "too thin");
});

ok("a fractional length is rounded, not rejected", () => {
  assert.equal(sanitizeTopics([topic({ episodeMinutes: 12.4 })])?.[0].episodeMinutes, 12);
});

// ── against the real database ────────────────────────────────────────────────────────────────
const USER = "ecfbaca9-7b0a-4994-a348-1aecfbb93726"; // gold.nwobu@gmail.com (pro)

async function main() {
  const db = serviceClient();
  const pack = [
    { name: "8-parsing.pdf", tag: "slides", text: "Dependency parsing. Arc-standard transitions." },
    { name: "9-parsing.pdf", tag: "slides", text: "Graph-based parsing. Eisner's algorithm." },
    { name: "21-attn.pdf", tag: "slides", text: "Scaled dot-product attention. Softmax over QK^T." },
  ];
  const packText = pack.map((f) => `===== ${f.name} [${f.tag}] =====\n${f.text}`).join("\n\n");
  const topics = [
    { index: 0, title: "Parsing", files: ["8-parsing.pdf", "9-parsing.pdf"], chars: 90,
      materialMinutes: 18, episodeMinutes: 18, priority: "T1", examMentions: 4, merged: "same subject" },
    { index: 1, title: "Attn", files: ["21-attn.pdf"], chars: 50,
      materialMinutes: 7, episodeMinutes: 7, priority: "T2", examMentions: 1 },
  ];

  const { data: series, error } = await db
    .from("podcast_series")
    .insert({ user_id: USER, title: "TEST #6 selection — safe to delete", topics, pack_text: packText })
    .select("id").single();
  if (error || !series) throw new Error(`could not create the test series: ${error?.message}`);
  const seriesId = series.id as string;
  console.log(`\n  (real series ${seriesId})`);

  try {
    let attnEpisode = "";

    await okAsync("only the chosen topic is queued, not the whole series", async () => {
      const r = await enqueueEpisode(db, {
        seriesId, userId: USER, topic: "Attn", topicIndex: 1, priority: "T2", creditsSpent: 1,
      });
      assert.ok(r.podcastId, "nothing was queued");
      assert.equal(r.alreadyQueued, false);
      attnEpisode = r.podcastId;
      const { data: rows } = await db.from("podcasts").select("topic_index").eq("series_id", seriesId);
      assert.deepEqual((rows ?? []).map((x) => x.topic_index), [1], "an unchosen topic was queued too");
    });

    await okAsync("asking twice makes one episode, not two", async () => {
      const again = await enqueueEpisode(db, {
        seriesId, userId: USER, topic: "Attn", topicIndex: 1, priority: "T2", creditsSpent: 1,
      });
      assert.equal(again.alreadyQueued, true);
      assert.equal(again.podcastId, null);
      const { count } = await db
        .from("podcasts").select("id", { count: "exact", head: true })
        .eq("series_id", seriesId).eq("topic_index", 1);
      assert.equal(count, 1);
    });

    await okAsync("the credit spent is recorded on the episode it paid for", async () => {
      const { data } = await db.from("podcasts").select("credits_spent, refunded, priority").eq("id", attnEpisode).single();
      assert.equal(data?.credits_spent, 1);
      assert.equal(data?.refunded, false);
      assert.equal(data?.priority, "T2");
    });

    // The point of the whole feature: the worker must be handed ONE topic.
    const deps = storeDeps(db, {
      outline: async () => { throw new Error("not called"); },
      script: async () => { throw new Error("not called"); },
      speak: async () => { throw new Error("not called"); },
    });

    await okAsync("the worker is handed one topic's material, at that topic's length", async () => {
      const job = await deps.loadJob(attnEpisode);
      assert.ok(job, "the job did not load");
      assert.equal(job.minutes, 7, "the episode took the series-wide length instead of its own");
      assert.ok(job.source.includes("Scaled dot-product attention"), "its own lecture is missing");
      assert.ok(!job.source.includes("Eisner"), "another topic's lecture leaked in");
      assert.ok(!job.source.includes("Arc-standard"), "another topic's lecture leaked in");
      assert.ok(job.source.length < packText.length, "it got the whole pack");
      assert.equal(job.creditsSpent, 1);
    });

    await okAsync("a merged topic is handed both of its files, in order", async () => {
      const r = await enqueueEpisode(db, {
        seriesId, userId: USER, topic: "Parsing", topicIndex: 0, priority: "T1", creditsSpent: 1,
      });
      assert.ok(r.podcastId);
      const job = await deps.loadJob(r.podcastId);
      assert.ok(job);
      assert.equal(job.minutes, 18);
      assert.ok(job.source.includes("Arc-standard"), "part one is missing");
      assert.ok(job.source.includes("Eisner"), "part two is missing");
      assert.ok(!job.source.includes("Scaled dot-product"), "another topic leaked in");
      assert.ok(job.source.indexOf("Arc-standard") < job.source.indexOf("Eisner"), "the parts are out of order");
    });

    await okAsync("a topic whose files are gone falls back to the whole pack rather than nothing", async () => {
      await db.from("podcast_series")
        .update({ topics: [{ index: 0, title: "Parsing", files: ["renamed.pdf"], episodeMinutes: 18 }] })
        .eq("id", seriesId);
      const { data: row } = await db.from("podcasts").select("id").eq("series_id", seriesId).eq("topic_index", 0).single();
      const job = await deps.loadJob(row!.id as string);
      assert.ok(job);
      assert.equal(job.source, packText, "it should speak from everything rather than nothing");
      await db.from("podcast_series").update({ topics }).eq("id", seriesId);
    });
  } finally {
    await db.from("podcasts").delete().eq("series_id", seriesId);
    await db.from("podcast_series").delete().eq("id", seriesId);
    const { count } = await db.from("podcast_series").select("id", { count: "exact", head: true }).eq("id", seriesId);
    console.log(`  (cleaned up — series rows left: ${count ?? 0})`);
  }

  console.log(`\n${n} checks passed`);
}
main().catch((e) => { console.error(`\nFAILED: ${e instanceof Error ? e.message : e}`); process.exit(1); });
