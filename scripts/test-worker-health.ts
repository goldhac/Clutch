/**
 * test-worker-health.ts — a worker that cannot work must not report itself healthy (#5).
 *   npx tsx scripts/test-worker-health.ts
 *
 * Railway restarts an unhealthy service and leaves a healthy one alone, so this is the difference
 * between a broken worker being noticed and a queue silently backing up for a day.
 */
import assert from "node:assert/strict";
import { healthBody } from "@/worker/health";
import type { WorkerStats } from "@/worker/loop";

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log(`  ok  ${name}`); };

const NOW = Date.parse("2026-09-24T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const stats = (over: Partial<WorkerStats> = {}): WorkerStats => ({
  startedAt: ago(60_000), polls: 10, lastPollAt: ago(5_000), claimed: 0, done: 0, failed: 0,
  recovered: 0, current: null, lastError: null, stopping: false, ...over,
});

ok("a worker polling normally is healthy", () => {
  const b = healthBody(stats(), NOW);
  assert.equal(b.healthy, true);
  assert.equal(b.role, "worker");
  assert.equal(b.secondsSinceLastPoll, 5);
  assert.equal(b.uptimeSeconds, 60);
});

ok("a worker that has not reached the database in five minutes is NOT healthy", () => {
  assert.equal(healthBody(stats({ lastPollAt: ago(6 * 60_000) }), NOW).healthy, false);
});

ok("recording an episode is working, even though it polls nothing meanwhile", () => {
  // The real failure this prevents: a 30-minute episode looking like a dead worker and being
  // restarted mid-job.
  const b = healthBody(stats({ lastPollAt: ago(30 * 60_000), current: "ep-1" }), NOW);
  assert.equal(b.healthy, true);
  assert.equal(b.current, "ep-1");
});

ok("a worker that has never managed a poll is only healthy while nothing has failed", () => {
  assert.equal(healthBody(stats({ lastPollAt: null, polls: 0 }), NOW).healthy, true);
  assert.equal(healthBody(stats({ lastPollAt: null, polls: 0, lastError: "bad service key" }), NOW).healthy, false);
});

ok("a stopping worker stops claiming to be healthy", () => {
  assert.equal(healthBody(stats({ stopping: true }), NOW).healthy, false);
});

ok("the body carries the numbers that explain a problem", () => {
  const b = healthBody(stats({ claimed: 4, done: 3, failed: 1, recovered: 2, lastError: "timeout" }), NOW);
  assert.equal(b.claimed, 4);
  assert.equal(b.done, 3);
  assert.equal(b.failed, 1);
  assert.equal(b.recovered, 2);
  assert.equal(b.lastError, "timeout");
});

console.log(`${n} checks passed`);
