/**
 * loop.ts — the worker loop (#5).
 *
 * Started by `src/instrumentation.ts` when the server boots, and by `scripts/worker.ts` when you
 * want it on its own in a terminal. Same code either way.
 *
 * It does three things:
 *   1. claims episodes from the `podcasts` table and records them;
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
import { storeDeps, recordCost } from "@/worker/episode-store";
import { claimNextEpisode, POLL_MS, recoverStaleEpisodes } from "@/worker/queue";

/** Gemini list prices, ai.google.dev, checked 2026-09-19. */
const PRICE: Record<string, { in: number; out: number }> = {
  [GEMINI_PRO]: { in: 1.25, out: 10 },
  [GEMINI_FLASH]: { in: 0.3, out: 2.5 },
};
/** TTS bills audio output; 2.5 Flash TTS is $10 / 1M. */
const TTS_PER_M = 10;

const log = (m: string) => console.log(`[worker] ${new Date().toISOString().slice(11, 19)} ${m}`);

export async function runWorkerLoop(): Promise<void> {
  const db = serviceClient();
  log("polling for episodes");
  let stopping = false;

  const runOne = async (claimed: { podcastId: string; userId: string }) => {
    const { podcastId } = claimed;
    const started = Date.now();
    log(`${podcastId}: starting`);
    const bill = async (userId: string, row: CostRow) => recordCost(db, podcastId, userId, row);
    const userId = claimed.userId;

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

    const result = await runEpisodeJob(podcastId, storeDeps(db, engine));
    log(`${podcastId}: ${result.status}${result.refunded ? " · credit returned" : ""} · ${((Date.now() - started) / 1000).toFixed(0)}s`);
  };

  // Sharing the web server's process now, so this asks the loop to stop and NEVER calls
  // process.exit — that would take the site down with it. The in-flight episode keeps its row
  // `running`; its heartbeat goes cold and another worker's sweep recovers it. Nothing is lost.
  const shutdown = () => {
    log("stopping");
    stopping = true;
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);

  // One episode at a time per worker: recording is long, and two at once in one process would
  // just contend. More throughput means more workers, which the SKIP LOCKED claim already allows.
  let sinceSweep = 0;
  while (!stopping) {
    try {
      // Every minute, put back anything a dead worker left behind.
      if (Date.now() - sinceSweep > 60_000) {
        sinceSweep = Date.now();
        const recovered = await recoverStaleEpisodes(db);
        if (recovered) log(`recovered ${recovered} abandoned episode(s)`);
      }
      const claimed = await claimNextEpisode(db);
      if (!claimed) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        continue;
      }
      await runOne(claimed);
    } catch (e) {
      // A bad poll must not kill the worker; back off and keep going.
      console.error("[worker]", e instanceof Error ? e.message : e);
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }

}

