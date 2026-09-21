import { config as loadDotenv } from "dotenv";
loadDotenv({ path: ".env.local", quiet: true });
/**
 * worker.ts — the process that records episodes (#5).
 *
 *   npx tsx scripts/worker.ts
 *
 * Runs beside the web app in the same Railway container (D4). Recording is about four minutes of
 * mostly waiting on a provider, so it does not fight the web process for CPU; if that ever stops
 * being true, this file moves to its own service and nothing else changes.
 *
 * It does three things on a loop:
 *   1. takes episode jobs off the queue and runs them;
 *   2. recovers episodes abandoned by a worker that died mid-job;
 *   3. writes what every stage cost, including the takes that were thrown away.
 */
import type { PodcastOutline } from "@/contract/podcast-outline";
import type { PodcastScript } from "@/contract/podcast-script";
import { GEMINI_FLASH, GEMINI_PRO } from "@/engine/gemini-client";
import { outlineEpisode, writeScript } from "@/engine/podcast";
import { speak, TTS_MODEL } from "@/engine/tts";
import { serviceClient } from "@/lib/supabase/service";
import { runEpisodeJob, type CostRow, type JobDeps, type Stage } from "@/worker/episode-job";
import { STALE_AFTER_MS, storeDeps, recordCost } from "@/worker/episode-store";
import { getBoss, QUEUE, stopBoss, type EpisodeJob } from "@/worker/queue";

/** Gemini list prices, ai.google.dev, checked 2026-09-19. */
const PRICE: Record<string, { in: number; out: number }> = {
  [GEMINI_PRO]: { in: 1.25, out: 10 },
  [GEMINI_FLASH]: { in: 0.3, out: 2.5 },
};
/** TTS bills audio output; 2.5 Flash TTS is $10 / 1M. */
const TTS_PER_M = 10;

const log = (m: string) => console.log(`[worker] ${new Date().toISOString().slice(11, 19)} ${m}`);

async function main() {
  const db = serviceClient();
  const boss = await getBoss();
  log(`listening on "${QUEUE}"`);

  await boss.work<EpisodeJob>(QUEUE, { batchSize: 1 }, async ([job]) => {
    const { podcastId } = job.data;
    const started = Date.now();
    log(`${podcastId}: starting`);

    // Costs are collected per stage and written as they land, so a job that dies halfway still
    // leaves behind what it already spent.
    const bill = async (userId: string, row: CostRow) => recordCost(db, podcastId, userId, row);
    let userId = "";

    const engine: Pick<JobDeps, "outline" | "script" | "speak"> = {
      outline: async (source, onStage) => {
        onStage("outline" as Stage);
        const t = Date.now();
        let inTok = 0, outTok = 0;
        const result = await outlineEpisode(source, {
          onUsage: (_s, u) => { inTok += u.inputTokens ?? 0; outTok += u.outputTokens ?? 0; },
        });
        await bill(userId, {
          stage: "outline", model: GEMINI_PRO, inputTokens: inTok, outputTokens: outTok,
          costUsd: (inTok * PRICE[GEMINI_PRO].in + outTok * PRICE[GEMINI_PRO].out) / 1e6,
          seconds: (Date.now() - t) / 1000,
        });
        return result;
      },
      script: async (outline, source, onStage) => {
        onStage("script" as Stage);
        const t = Date.now();
        const tally: Record<string, { in: number; out: number }> = {};
        const result = await writeScript(outline as PodcastOutline, source, {
          onUsage: (stage, u) => {
            const k = stage === "claims" ? GEMINI_FLASH : GEMINI_PRO;
            tally[k] = { in: (tally[k]?.in ?? 0) + (u.inputTokens ?? 0), out: (tally[k]?.out ?? 0) + (u.outputTokens ?? 0) };
          },
          onProgress: (stage) => onStage((stage === "claims" ? "claims" : "script") as Stage),
        });
        for (const [model, t2] of Object.entries(tally)) {
          await bill(userId, {
            stage: model === GEMINI_FLASH ? "claims" : "script", model,
            inputTokens: t2.in, outputTokens: t2.out,
            costUsd: (t2.in * PRICE[model].in + t2.out * PRICE[model].out) / 1e6,
            seconds: (Date.now() - t) / 1000,
          });
        }
        return result.script;
      },
      speak: async (script: PodcastScript, outline: PodcastOutline, onStage) => {
        onStage("voicing" as Stage);
        const t = Date.now();
        let audioTokens = 0, discardedTokens = 0, discarded = 0, checkIn = 0, checkOut = 0;
        const audio = await speak(script.lines, (l) => outline.beats[l.beat]?.section ?? "", {
          onAudioUsage: (u) => {
            audioTokens += u.audioTokens;
            if (u.discarded) { discardedTokens += u.audioTokens; discarded++; }
          },
          onCheckUsage: (u) => { checkIn += u.inputTokens; checkOut += u.outputTokens; },
        });
        // Billed on EVERYTHING generated, discarded takes included: they were paid for.
        await bill(userId, {
          stage: "voicing", model: TTS_MODEL, audioTokens, discarded,
          costUsd: (audioTokens / 1e6) * TTS_PER_M + (checkIn * PRICE[GEMINI_FLASH].in + checkOut * PRICE[GEMINI_FLASH].out) / 1e6,
          seconds: (Date.now() - t) / 1000,
        });
        if (discardedTokens) log(`${podcastId}: ${discarded} discarded take(s), ${discardedTokens} audio tokens paid for and thrown away`);
        return audio;
      },
    };

    const deps = storeDeps(db, engine);
    const loaded = await deps.loadJob(podcastId);
    userId = loaded?.userId ?? "";
    const result = await runEpisodeJob(podcastId, deps);
    log(`${podcastId}: ${result.status}${result.refunded ? " · credit returned" : ""} · ${((Date.now() - started) / 1000).toFixed(0)}s`);
  });

  // Recovery: a row still `running` with a cold heartbeat belongs to a worker that died.
  const sweep = setInterval(() => {
    void (async () => {
      const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString();
      const { data } = await db
        .from("podcasts")
        .select("id, user_id")
        .eq("status", "running")
        .or(`heartbeat_at.is.null,heartbeat_at.lt.${cutoff}`)
        .limit(5);
      for (const row of data ?? []) {
        log(`recovering abandoned episode ${row.id}`);
        // Back to queued, then re-enqueued: the partial unique index still guards against doubles.
        await db.from("podcasts").update({ status: "queued", stage: null, heartbeat_at: null }).eq("id", row.id);
        await boss.send(QUEUE, { podcastId: row.id as string, userId: row.user_id as string }, { singletonKey: row.id as string, retryLimit: 0 });
      }
    })().catch((e) => console.error("[worker] sweep failed", e));
  }, 60_000);

  const shutdown = async () => {
    log("shutting down");
    clearInterval(sweep);
    // Graceful: in-flight jobs finish, and anything killed mid-job is recovered by its heartbeat.
    await stopBoss();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());
}

main().catch((e) => {
  console.error("[worker] could not start:", e instanceof Error ? e.message : e);
  process.exit(1);
});
