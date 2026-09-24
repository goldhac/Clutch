/**
 * test-episode-job.ts — the job's failure and refund paths (#5).
 *   npx tsx scripts/test-episode-job.ts
 *
 * No database, no queue, no paid call: the job is written against injected dependencies precisely
 * so the parts that must never be wrong can be tested in milliseconds.
 */
import assert from "node:assert/strict";
import type { PodcastOutline } from "@/contract/podcast-outline";
import type { PodcastScript } from "@/contract/podcast-script";
import { friendlyFailure, runEpisodeJob, type JobDeps } from "@/worker/episode-job";
import { atUserLimit, PER_USER_RUNNING } from "@/worker/queue";
import { MIN_SOURCE_CHARS } from "@/engine/topic-split";
import { STALE_AFTER_MS } from "@/worker/episode-store";

let n = 0;
const ok = (name: string, fn: () => void | Promise<void>) => fn instanceof Function
  ? Promise.resolve(fn()).then(() => { n++; console.log(`  ok  ${name}`); })
  : undefined;

const OUTLINE = { title: "T" } as unknown as PodcastOutline;
const SCRIPT = { title: "T", summary: "S", lines: [] } as unknown as PodcastScript;
const AUDIO = { mp3: new Uint8Array(3), previewMp3: new Uint8Array(2), durationSeconds: 60, chapters: [] };

/**
 * A source with enough in it to be worth an episode. Was "lecture text" — twelve characters — which
 * every test happily recorded, and which the real pipeline would now refuse before spending (#21).
 * A fixture that cannot happen in production tests nothing about production.
 */
const REAL_SOURCE = "Scaled dot-product attention weights values by query-key similarity. ".repeat(100);

/** A fake worker environment that records everything it was asked to do. */
function fakeDeps(over: Partial<JobDeps> = {}, creditsSpent = 1) {
  const calls: string[] = [];
  let refundedOnce = false;
  const deps: JobDeps = {
    loadJob: async () => ({ userId: "u1", topic: "Attention", source: REAL_SOURCE, minutes: 24, creditsSpent }),
    setStage: async (_id, stage) => { calls.push(`stage:${stage}`); },
    heartbeat: async () => { calls.push("beat"); },
    outline: async () => OUTLINE,
    script: async () => SCRIPT,
    speak: async () => AUDIO,
    store: async () => ({ audioPath: "u1/p1.mp3", previewPath: "u1/p1-preview.mp3" }),
    finish: async () => { calls.push("finish"); },
    fail: async (_id, m) => { calls.push(`fail:${m.slice(0, 24)}`); },
    // The real one is a conditional UPDATE; this mirrors its contract exactly.
    refund: async () => { if (refundedOnce) { calls.push("refund:noop"); return false; } refundedOnce = true; calls.push("refund:done"); return true; },
    recordCost: async () => { calls.push("cost"); },
    ...over,
  };
  return { deps, calls };
}

(async () => {
  await ok("a clean run walks the stages and finishes", async () => {
    const { deps, calls } = fakeDeps();
    const r = await runEpisodeJob("p1", deps, { heartbeatMs: 10_000 });
    assert.equal(r.status, "done");
    assert.deepEqual(calls.filter((c) => c.startsWith("stage:")), ["stage:outline", "stage:script", "stage:voicing", "stage:assembling"]);
    assert.ok(calls.includes("finish"));
    assert.ok(!calls.some((c) => c.startsWith("refund")), "a successful episode must not refund");
  });

  await ok("a failure refunds once and marks the row failed", async () => {
    const { deps, calls } = fakeDeps({ speak: async () => { throw new Error("tts 500"); } });
    const r = await runEpisodeJob("p1", deps);
    assert.equal(r.status, "failed");
    assert.equal(r.refunded, true);
    assert.equal(calls.filter((c) => c === "refund:done").length, 1);
    assert.ok(calls.some((c) => c.startsWith("fail:")));
  });

  await ok("refunding twice is impossible — the second call writes nothing", async () => {
    const { deps } = fakeDeps({ speak: async () => { throw new Error("tts 500"); } });
    const first = await runEpisodeJob("p1", deps);
    const second = await runEpisodeJob("p1", deps); // a retried or duplicated job
    assert.equal(first.refunded, true);
    assert.equal(second.refunded, false, "the second run must not refund again");
  });

  await ok("an episode that cost nothing is not refunded", async () => {
    const { deps, calls } = fakeDeps({ speak: async () => { throw new Error("boom"); } }, 0);
    const r = await runEpisodeJob("p1", deps);
    assert.equal(r.refunded, false);
    assert.ok(!calls.some((c) => c.startsWith("refund")), "nothing was spent, so nothing is returned");
  });

  await ok("the credit is returned even when marking it failed throws", async () => {
    const { deps, calls } = fakeDeps({
      script: async () => { throw new Error("contract"); },
      fail: async () => { throw new Error("db down"); },
    });
    await assert.rejects(() => runEpisodeJob("p1", deps));
    assert.ok(calls.includes("refund:done"), "the refund must happen before the row is marked");
  });

  await ok("a refund that fails does not hide the original error", async () => {
    const { deps, calls } = fakeDeps({
      speak: async () => { throw new Error("tts 500"); },
      refund: async () => { throw new Error("refund write failed"); },
    });
    const r = await runEpisodeJob("p1", deps);
    assert.equal(r.status, "failed");
    assert.equal(r.refunded, false);
    assert.ok(calls.some((c) => c.startsWith("fail:")), "the student is still told");
  });

  await ok("a missing episode fails cleanly instead of throwing", async () => {
    const { deps } = fakeDeps({ loadJob: async () => null });
    const r = await runEpisodeJob("gone", deps);
    assert.equal(r.status, "failed");
    assert.match(r.message ?? "", /no longer exists/);
  });

  await ok("the student is told what happened, never the stack trace", () => {
    assert.match(friendlyFailure(new Error("[429 Too Many Requests] exceeded its monthly spending cap")), /credit has been returned/);
    assert.match(friendlyFailure(new Error("ffmpeg ENOENT")), /credit has been returned/);
    assert.match(friendlyFailure(new Error("script failed contract at lines")), /credit has been returned/);
    for (const m of ["tts 500", "ECONNRESET", "whatever"]) {
      const said = friendlyFailure(new Error(m));
      assert.ok(!said.includes(m), `the raw error "${m}" must not reach the student`);
      assert.match(said, /credit has been returned/);
    }
  });

  await ok(`a student may record ${PER_USER_RUNNING} at once, and no more`, () => {
    const fresh = () => ({ heartbeat_at: new Date().toISOString() });
    assert.equal(atUserLimit([], STALE_AFTER_MS), false);
    assert.equal(atUserLimit([fresh()], STALE_AFTER_MS), false);
    assert.equal(atUserLimit([fresh(), fresh()], STALE_AFTER_MS), true);
    // A row just claimed has not beaten yet; it still counts.
    assert.equal(atUserLimit([{ heartbeat_at: null }, fresh()], STALE_AFTER_MS), true);
  });

  await ok("a killed worker frees the slot once its heartbeat goes cold", () => {
    const cold = { heartbeat_at: new Date(Date.now() - STALE_AFTER_MS - 1000).toISOString() };
    const fresh = { heartbeat_at: new Date().toISOString() };
    assert.equal(atUserLimit([cold, cold], STALE_AFTER_MS), false, "two dead jobs must not block a student for ever");
    assert.equal(atUserLimit([cold, fresh], STALE_AFTER_MS), false);
  });

  // ── #21: nothing is paid for until we know there is something to teach ──────────────────────
  await ok("an empty pack is refused BEFORE the first paid call, and the credit comes back", async () => {
    let paid = 0;
    const { deps, calls } = fakeDeps({
      loadJob: async () => ({ userId: "u1", topic: "Smoke", source: "", minutes: 5, creditsSpent: 1 }),
      outline: async () => { paid++; return OUTLINE; },
      script: async () => { paid++; return SCRIPT; },
      speak: async () => { paid++; return AUDIO; },
    });
    const r = await runEpisodeJob("p1", deps);
    assert.equal(r.status, "failed");
    assert.equal(paid, 0, "a paid call was made against an empty pack");
    assert.equal(r.refunded, true);
    assert.ok(calls.includes("refund:done"));
    // It must not even claim to have started: the row never reaches the outline stage.
    assert.ok(!calls.includes("stage:outline"), "the row was marked as outlining without outlining");
  });

  await ok("the refusal says what is wrong with the file, not 'something went wrong'", async () => {
    const { calls } = fakeDeps();
    void calls;
    const { deps, calls: c2 } = fakeDeps({
      loadJob: async () => ({ userId: "u1", topic: "Chapter 3", source: "a scan", minutes: 5, creditsSpent: 1 }),
    });
    const r = await runEpisodeJob("p1", deps);
    assert.ok(r.message?.includes("Chapter 3"), "the student is not told which file");
    assert.ok(/text layer|scan/i.test(r.message ?? ""), "the likely cause is not named");
    assert.ok(/nothing was charged/i.test(r.message ?? ""), "the credit is not accounted for");
    assert.ok(c2.some((x) => x.startsWith("fail:")));
  });

  await ok("the episode is written to ITS topic's length, not a default 24 minutes", async () => {
    // The bug this covers: both engine calls default to 24 minutes, and nothing passed the
    // topic's own length, so a 6-minute topic was written — and billed — as a 24-minute one.
    const asked: number[] = [];
    const { deps } = fakeDeps({
      loadJob: async () => ({ userId: "u1", topic: "Short", source: REAL_SOURCE, minutes: 6, creditsSpent: 1 }),
      outline: async (_s, minutes) => { asked.push(minutes); return OUTLINE; },
      script: async (_o, _s, minutes) => { asked.push(minutes); return SCRIPT; },
    });
    assert.equal((await runEpisodeJob("p1", deps)).status, "done");
    assert.deepEqual(asked, [6, 6], "the engine was not told how long the episode should be");
  });

  await ok("just over the floor is allowed through", async () => {
    let paid = 0;
    const { deps } = fakeDeps({
      loadJob: async () => ({ userId: "u1", topic: "Thin but real", source: "x".repeat(MIN_SOURCE_CHARS), minutes: 5, creditsSpent: 1 }),
      outline: async () => { paid++; return OUTLINE; },
    });
    const r = await runEpisodeJob("p1", deps);
    assert.equal(r.status, "done");
    assert.equal(paid, 1);
  });

  await ok("whitespace is not material", async () => {
    const { deps } = fakeDeps({
      loadJob: async () => ({ userId: "u1", topic: "Blank", source: " \n\t".repeat(9999), minutes: 5, creditsSpent: 1 }),
    });
    assert.equal((await runEpisodeJob("p1", deps)).status, "failed");
  });

  console.log(`\n${n} checks passed`);
})().catch((e) => { console.error(e); process.exit(1); });
