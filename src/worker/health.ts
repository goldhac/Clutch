/**
 * health.ts — a worker you can ask whether it is working (#5).
 *
 * The worker runs as its own Railway service, and Railway decides a deploy succeeded by asking for
 * `/` over HTTP. A worker has no HTTP, so without this its deploy is marked failed and Railway
 * restarts it forever — the service would never come up at all.
 *
 * It answers the harder question too. "The process is alive" and "the process is doing its job"
 * look identical from outside: a worker whose every poll fails on a bad service key sits there
 * healthy and silent while the queue backs up. So the body reports when it last completed a poll
 * and what the last error was, and a worker that has not managed a poll in five minutes calls
 * itself unhealthy rather than waiting for someone to notice.
 */
import { createServer, type Server } from "node:http";
import type { WorkerStats } from "./loop";

/**
 * Long enough that a single long episode cannot trip it — the loop polls only between jobs, and a
 * job runs 20-40 minutes — so "no poll" is judged against the job it is running, not the clock.
 */
const STALE_POLL_MS = 5 * 60_000;

export function healthBody(stats: WorkerStats, now = Date.now()) {
  const since = stats.lastPollAt ? now - new Date(stats.lastPollAt).getTime() : null;
  // Recording IS working, even though it polls nothing while it does.
  const busy = stats.current !== null;
  const healthy =
    !stats.stopping && (busy || since === null ? stats.lastError === null : since < STALE_POLL_MS);
  return {
    role: "worker" as const,
    healthy,
    ...stats,
    secondsSinceLastPoll: since === null ? null : Math.round(since / 1000),
    uptimeSeconds: Math.round((now - new Date(stats.startedAt).getTime()) / 1000),
  };
}

/**
 * Serve the health body on PORT. Returns the server so a caller can close it; resolves once it is
 * listening, because Railway starts asking as soon as the container is up.
 */
export function startHealthServer(stats: WorkerStats, port: number): Promise<Server> {
  const server = createServer((req, res) => {
    const body = healthBody(stats);
    // Every path answers: Railway's healthcheckPath is shared with the web service and points at
    // "/", while a human looking for trouble will type /healthz.
    res.writeHead(body.healthy ? 200 : 503, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body, null, 2));
    void req;
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}
