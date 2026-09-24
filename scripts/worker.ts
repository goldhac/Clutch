import { config as loadDotenv } from "dotenv";
loadDotenv({ path: ".env.local", quiet: true });
/**
 * worker.ts — run the episode worker on its own, in a terminal (#5).
 *
 *   npx tsx scripts/worker.ts
 *
 * In production the same loop starts with the web server (src/instrumentation.ts). This is for
 * watching it work, and for running it somewhere else if it ever needs its own machine.
 */
import { runWorkerLoop } from "@/worker/loop";

runWorkerLoop().catch((e) => {
  console.error("[worker] could not start:", e instanceof Error ? e.message : e);
  process.exit(1);
});
