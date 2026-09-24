/**
 * start-with-worker.mjs — the web app and the episode worker, in one container (D4).
 *
 * Recording is ~4 minutes of waiting on a provider, so the worker does not fight Next for CPU.
 * If that ever stops being true it becomes its own Railway service and only this file goes away.
 *
 * Rules that matter in a shared container:
 *   - the WEB process is the one Railway health-checks, so if it dies, the container dies;
 *   - a worker crash must NOT take the site down — it is restarted, with a ceiling so a boot loop
 *     cannot spin for ever;
 *   - the worker only starts when it has what it needs, so a missing key is a clear log line
 *     rather than a crash loop.
 */
import { spawn } from "node:child_process";

const web = spawn("npm", ["run", "start"], { stdio: "inherit", env: process.env });
web.on("exit", (code) => {
  console.error(`[start] the web process exited (${code}); stopping the container`);
  process.exit(code ?? 1);
});

const ready = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
if (!ready) {
  console.warn(
    "[start] the episode worker is NOT running: SUPABASE_SERVICE_ROLE_KEY is required. The site " +
      "is up and sheets work; audio jobs will sit queued until it is set.",
  );
} else {
  let restarts = 0;
  const startWorker = () => {
    const worker = spawn("npx", ["tsx", "scripts/worker.ts"], { stdio: "inherit", env: process.env });
    worker.on("exit", (code) => {
      if (code === 0) return;
      restarts += 1;
      if (restarts > 10) {
        console.error("[start] the worker keeps failing; leaving it stopped so the site stays up");
        return;
      }
      const wait = Math.min(60_000, 2 ** restarts * 1000);
      console.error(`[start] worker exited (${code}); restarting in ${wait / 1000}s (attempt ${restarts})`);
      setTimeout(startWorker, wait);
    });
  };
  startWorker();
}

const bye = () => { web.kill("SIGTERM"); process.exit(0); };
process.on("SIGTERM", bye);
process.on("SIGINT", bye);
