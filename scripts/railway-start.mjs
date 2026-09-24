/**
 * railway-start.mjs — one image, two jobs (#5).
 *
 * The web service and the episode worker are built from the same repo, so they share one
 * railway.json and therefore one start command. This is that command: it reads CLUTCH_ROLE and
 * starts the right thing.
 *
 *   CLUTCH_ROLE=worker   the episode worker  (scripts/worker.ts)
 *   anything else        the Next.js server  (next start)
 *
 * Why not start the worker from inside the web server (src/instrumentation.ts)? Two reasons, one
 * of them already paid for: Next compiles instrumentation for the edge runtime as well as node,
 * where node:child_process cannot exist, which broke a deploy on 2026-09-22. And a worker sharing
 * the site's process takes the site down with it when it dies.
 *
 * Plain .mjs on purpose — it runs before anything is compiled, so it must not need tsx itself.
 */
import { spawn } from "node:child_process";

const role = (process.env.CLUTCH_ROLE ?? "web").trim().toLowerCase();
const [cmd, args] =
  role === "worker"
    ? ["npx", ["tsx", "scripts/worker.ts"]]
    : ["npx", ["next", "start"]];

console.log(`[start] role=${role} → ${cmd} ${args.join(" ")}`);

const child = spawn(cmd, args, { stdio: "inherit", env: process.env });

// Railway stops a container with SIGTERM. Pass it on and let the child decide what to finish:
// the worker uses it to stop claiming without abandoning the episode it is recording.
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => child.kill(sig));
}
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
child.on("error", (e) => {
  console.error(`[start] could not start ${cmd}:`, e.message);
  process.exit(1);
});
