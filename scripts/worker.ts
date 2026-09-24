import { config as loadDotenv } from "dotenv";
loadDotenv({ path: ".env.local", quiet: true });
/**
 * worker.ts — the episode worker (#5).
 *
 *   npx tsx scripts/worker.ts        (locally, in a terminal)
 *
 * In production this is the start command of its own Railway service, chosen by CLUTCH_ROLE in
 * scripts/railway-start.mjs. It is deliberately NOT started by the web server: a worker that
 * shares the site's process takes the site down when it dies, and cannot be restarted or scaled
 * without restarting the site.
 *
 * When PORT is set it also serves its health on that port — Railway decides a deploy succeeded by
 * asking for "/" over HTTP, so without it the service would never come up.
 */
import { runWorkerLoop, workerStats } from "@/worker/loop";
import { startHealthServer } from "@/worker/health";

async function main() {
  const port = Number(process.env.PORT);
  if (Number.isFinite(port) && port > 0) {
    await startHealthServer(workerStats, port);
    console.log(`[worker] health on :${port}`);
  }
  await runWorkerLoop();
}

main().catch((e) => {
  console.error("[worker] could not start:", e instanceof Error ? e.message : e);
  process.exit(1);
});
