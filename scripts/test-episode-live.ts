import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
/**
 * test-episode-live.ts — one real episode, end to end, for the least money it can be done for.
 *
 *   npx tsx scripts/test-episode-live.ts --spend        make one episode (COSTS REAL MONEY)
 *   npx tsx scripts/test-episode-live.ts --clean        delete what past runs left behind
 *
 * Everything else in the suite is free and deterministic. This one is not: it queues a real
 * episode, the production worker claims it, and Gemini bills for the outline, the script and the
 * voicing. So it refuses to run without --spend, and it is built to be the cheapest true test
 * available rather than a realistic one:
 *
 *   - the source is samples/audio-test/lecture.md — plain text, so there is NO vision pass to pay
 *     for, and the same bytes every time, so two runs are comparable;
 *   - it is ~6,300 characters, just over the MIN_SOURCE_CHARS floor (#21), which makes the shortest
 *     episode the product is willing to make: about six minutes against a normal twenty-four.
 *
 * Measured full-length episode: $0.59. This one should land near a quarter of that.
 *
 * It reports what was actually billed from podcast_costs rather than estimating, saves the audio to
 * listen/, and leaves the rows in place so the episode can be played in the app. Run --clean after.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { serviceClient } from "@/lib/supabase/service";
import { enqueueEpisode } from "@/worker/queue";
import { CHARS_PER_AUDIO_MINUTE, MIN_SOURCE_CHARS } from "@/engine/topic-split";

const USER = "ecfbaca9-7b0a-4994-a348-1aecfbb93726"; // gold.nwobu@gmail.com (pro)
const TITLE = "LIVE TEST — audience analysis";
const SOURCE = "samples/audio-test/lecture.md";
const TIMEOUT_MS = 45 * 60_000;

const db = serviceClient();
const money = (n: number) => `$${n.toFixed(4)}`;

async function clean() {
  const { data } = await db.from("podcast_series").select("id").eq("user_id", USER).eq("title", TITLE);
  const ids = (data ?? []).map((r) => r.id as string);
  if (!ids.length) return console.log("nothing to clean up");
  for (const id of ids) {
    await db.from("podcasts").delete().eq("series_id", id);
    await db.from("podcast_series").delete().eq("id", id);
  }
  console.log(`removed ${ids.length} test series and their episodes`);
}

async function run() {
  const text = readFileSync(SOURCE, "utf8");
  const chars = text.trim().length;
  const minutes = Math.max(5, Math.round(chars / CHARS_PER_AUDIO_MINUTE));
  console.log(`source: ${SOURCE} · ${chars} chars (floor is ${MIN_SOURCE_CHARS}) · aiming at ~${minutes} min\n`);

  const packText = `===== lecture.md [slides] =====\n${text}`;
  const topics = [{
    index: 0, title: "Audience Analysis", files: ["lecture.md"], chars,
    materialMinutes: Math.round((chars / CHARS_PER_AUDIO_MINUTE) * 10) / 10,
    episodeMinutes: minutes, priority: "T1", examMentions: 0,
  }];

  const { data: series, error } = await db
    .from("podcast_series")
    .insert({ user_id: USER, title: TITLE, topics, pack_text: packText })
    .select("id").single();
  if (error || !series) throw new Error(`could not create the series: ${error?.message}`);
  const seriesId = series.id as string;

  const q = await enqueueEpisode(db, {
    seriesId, userId: USER, topic: "Audience Analysis", topicIndex: 0, priority: "T1", creditsSpent: 1,
  });
  if (!q.podcastId) throw new Error("nothing was queued");
  console.log(`queued ${q.podcastId}\nwaiting for the production worker to claim it…\n`);

  const started = Date.now();
  let lastStage = "";
  for (;;) {
    if (Date.now() - started > TIMEOUT_MS) throw new Error(`gave up after ${TIMEOUT_MS / 60_000} minutes`);
    const { data: row } = await db
      .from("podcasts")
      .select("status, stage, error, duration_s, audio_path, refunded, credits_spent")
      .eq("id", q.podcastId).single();
    if (!row) throw new Error("the episode row disappeared");
    const where = `${row.status}${row.stage ? `/${row.stage}` : ""}`;
    if (where !== lastStage) {
      console.log(`  ${new Date().toISOString().slice(11, 19)}  ${where}`);
      lastStage = where;
    }
    if (row.status === "done" || row.status === "failed") {
      const mins = ((Date.now() - started) / 60_000).toFixed(1);
      console.log(`\n${row.status} after ${mins} min`);
      if (row.error) console.log(`  reason: ${row.error}`);
      if (row.refunded) console.log(`  credit returned`);

      const { data: costs } = await db
        .from("podcast_costs")
        .select("stage, model, input_tokens, output_tokens, audio_tokens, discarded, cost_usd, seconds")
        .eq("podcast_id", q.podcastId).order("id");
      let total = 0;
      console.log("\nwhat it cost:");
      for (const c of costs ?? []) {
        total += Number(c.cost_usd);
        const tokens = c.audio_tokens ? `${c.audio_tokens} audio tokens` : `${c.input_tokens} in / ${c.output_tokens} out`;
        console.log(`  ${String(c.stage).padEnd(9)} ${money(Number(c.cost_usd))}  ${tokens}${c.discarded ? ` · ${c.discarded} discarded take(s)` : ""}  ${Number(c.seconds).toFixed(0)}s`);
      }
      console.log(`  ${"TOTAL".padEnd(9)} ${money(total)}`);
      if (row.duration_s) {
        console.log(`\n  ${Math.floor(row.duration_s / 60)}m ${row.duration_s % 60}s of audio · ${money(total / (row.duration_s / 60))} per minute`);
      }

      if (row.audio_path) {
        const { data: file } = await db.storage.from("podcasts").download(row.audio_path);
        if (file) {
          mkdirSync("listen", { recursive: true });
          const out = `listen/live-test-${new Date().toISOString().slice(0, 10)}.mp3`;
          writeFileSync(out, Buffer.from(await file.arrayBuffer()));
          console.log(`\nsaved ${out}`);
        }
      }
      console.log(`\nseries ${seriesId} · episode ${q.podcastId}`);
      console.log(`run with --clean to remove it.`);
      return;
    }
    await new Promise((r) => setTimeout(r, 10_000));
  }
}

const arg = process.argv[2];
if (arg === "--clean") clean().catch((e) => { console.error(e.message); process.exit(1); });
else if (arg === "--spend") run().catch((e) => { console.error(`\nFAILED: ${e.message}`); process.exit(1); });
else {
  console.log("This test makes a REAL episode and costs real money (~$0.15).");
  console.log("  npx tsx scripts/test-episode-live.ts --spend");
  console.log("  npx tsx scripts/test-episode-live.ts --clean");
  process.exit(1);
}
