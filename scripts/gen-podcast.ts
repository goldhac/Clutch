import { config as loadDotenv } from "dotenv";
loadDotenv({ path: ".env.local", quiet: true });
/**
 * gen-podcast.ts — the episode pipeline, drivable from a terminal (#5's CLI, needed now for #3).
 *
 * Every hard bug in Phase 0 was found from a terminal: the voice swaps, the truncated drafts, the
 * causal slip. The queue and the UI come later; this is the harness that proves the engine.
 *
 *   npx tsx scripts/gen-podcast.ts --pdf reference/exam-prep/21-attn.pdf
 *   npx tsx scripts/gen-podcast.ts --source <dir>/source.txt --minutes 10
 *   npx tsx scripts/gen-podcast.ts --source <dir>/source.txt --outline <dir>/outline.json
 *   npx tsx scripts/gen-podcast.ts --source … --outline … --script <dir>/script.json --voice
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { safeParsePodcastOutline, type PodcastOutline } from "@/contract/podcast-outline";
import { countWords, type PodcastLine } from "@/contract/podcast-script";
import { GEMINI_FLASH, GEMINI_PRO } from "@/engine/gemini-client";
import { outlineEpisode, writeScript, WORDS_PER_MINUTE, type Usage } from "@/engine/podcast";
import { speak, TTS_MODEL } from "@/engine/tts";
import { ingestDocument } from "@/parse/ingest";

const argv = process.argv.slice(2);
const flag = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const PDF = flag("pdf");
const SOURCE = flag("source");
const OUTLINE_PATH = flag("outline");
/** Reuse a script that already passed, to voice it without paying to write it again. */
const SCRIPT_PATH = flag("script");
/** Record it: the #5 acceptance is a playable chaptered MP3 from a real pack. */
const VOICE = argv.includes("--voice");
const MINUTES = Number(flag("minutes") ?? 24);
if (!PDF && !SOURCE) throw new Error("pass --pdf <lecture.pdf> or --source <source.txt>");

const t0 = Date.now();
const since = () => `${((Date.now() - t0) / 1000).toFixed(0)}s`;
const log = (m: string) => console.log(`[${since().padStart(4)}] ${m}`);

/** Gemini list prices, ai.google.dev, checked 2026-09-14/19. */
const PRICE: Record<string, { in: number; out: number }> = {
  [GEMINI_PRO]: { in: 1.25, out: 10 },
  [GEMINI_FLASH]: { in: 0.3, out: 2.5 },
};
const spend: Record<string, { usd: number; calls: number }> = {};
function bill(stage: string, model: string, u: Usage) {
  const p = PRICE[model] ?? PRICE[GEMINI_FLASH];
  const usd = ((u.inputTokens ?? 0) * p.in + (u.outputTokens ?? 0) * p.out) / 1e6;
  spend[stage] = { usd: (spend[stage]?.usd ?? 0) + usd, calls: (spend[stage]?.calls ?? 0) + 1 };
}

/** Voice a finished script and write the MP3, its preview and the chapters. */
async function record(script: { title: string; lines: PodcastLine[] }, outline: PodcastOutline, outDir: string) {
  log(`voicing with ${TTS_MODEL}…`);
  const t = Date.now();
  let audioTokens = 0, discardedTokens = 0, checkIn = 0, checkOut = 0;
  const ep = await speak(script.lines, (l) => outline.beats[l.beat]?.section ?? "", {
    onProgress: (done, total, note) => log(`  block ${done}/${total} · ${note}`),
    onAudioUsage: (u) => { audioTokens += u.audioTokens; if (u.discarded) discardedTokens += u.audioTokens; },
    onCheckUsage: (u) => { checkIn += u.inputTokens; checkOut += u.outputTokens; },
  });
  writeFileSync(join(outDir, "episode.mp3"), ep.mp3);
  writeFileSync(join(outDir, "episode-preview.mp3"), ep.previewMp3);
  writeFileSync(join(outDir, "chapters.json"), JSON.stringify(ep.chapters, null, 2));
  const ttsUsd = (audioTokens / 1e6) * 10;
  const checkUsd = (checkIn * 0.3 + checkOut * 2.5) / 1e6;
  spend.voicing = { usd: ttsUsd + checkUsd, calls: ep.blocks };
  const mins = Math.floor(ep.durationSeconds / 60);
  log(`voiced · ${mins}:${String(ep.durationSeconds % 60).padStart(2, "0")} · ${ep.blocks} blocks · ${ep.retakes} re-take(s) · ${ep.wrongVoiceLines.length} wrong-voice line(s)`);
  log(`  chapters: ${ep.chapters.map((c) => `${c.section} @${c.startS}s`).join(" · ")}`);
  log(`  discarded audio tokens: ${discardedTokens} (paid for, thrown away)`);
  log(`  voicing $${(ttsUsd + checkUsd).toFixed(4)} · ${((Date.now() - t) / 1000).toFixed(0)}s`);
}

(async () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const name = basename(PDF ?? SOURCE ?? "episode").replace(/\.(pdf|txt)$/, "");
  const outDir = join("scripts/phase0/out", `${name}-p1-${stamp}`);
  mkdirSync(outDir, { recursive: true });

  // 1. Source
  let source: string;
  if (SOURCE) {
    source = readFileSync(SOURCE, "utf8");
    log(`source: ${SOURCE} (${source.length} chars)`);
  } else {
    log(`ingesting ${PDF} (vision: figures)…`);
    const ing = await ingestDocument(basename(PDF!), readFileSync(PDF!), { vision: true, visionMode: "figures" });
    source = ing.text;
    log(`  ${ing.units} pages · ${ing.charCount} chars · ${ing.visionImages} read by vision`);
  }
  writeFileSync(join(outDir, "source.txt"), source);

  // 2. Outline
  let outline;
  if (OUTLINE_PATH) {
    const parsed = safeParsePodcastOutline(JSON.parse(readFileSync(OUTLINE_PATH, "utf8")));
    if (!parsed.success) throw new Error(`saved outline fails the contract: ${parsed.error.issues[0].message}`);
    outline = parsed.data;
    log(`outline: reused from ${OUTLINE_PATH}`);
  } else {
    outline = await outlineEpisode(source, {
      minutes: MINUTES,
      onUsage: (stage, u) => bill(stage, GEMINI_PRO, u),
      onProgress: (stage, detail) => log(`${stage}: ${detail}`),
    });
    log(`outline: "${outline.title}" · ${outline.sections.length} sections · ${outline.beats.length} beats · ${outline.must_say.length} must-say`);
  }
  writeFileSync(join(outDir, "outline.json"), JSON.stringify(outline, null, 2));

  // 3. Script
  if (SCRIPT_PATH) {
    const saved = JSON.parse(readFileSync(SCRIPT_PATH, "utf8"));
    log(`script: reused from ${SCRIPT_PATH} (${saved.lines.length} lines)`);
    await record(saved, outline, outDir);
    return;
  }
  const result = await writeScript(outline, source, {
    minutes: MINUTES,
    onUsage: (stage, u) => bill(stage, stage === "claims" ? GEMINI_FLASH : GEMINI_PRO, u),
    onProgress: (stage, detail) => log(`${stage}: ${detail}`),
  });

  writeFileSync(join(outDir, "script.json"), JSON.stringify(result.script, null, 2));
  writeFileSync(
    join(outDir, "transcript.md"),
    `# ${result.script.title}\n\n${result.script.summary}\n\n` +
      result.script.lines.map((l) => `**${l.speaker}** ${l.text}`).join("\n\n") + "\n",
  );

  const total = Object.values(spend).reduce((n, s) => n + s.usd, 0);
  const report = {
    minutes: MINUTES,
    targetWords: MINUTES * WORDS_PER_MINUTE,
    words: countWords(result.script.lines),
    lines: result.script.lines.length,
    drafts: result.drafts,
    remaining: result.remaining,
    claims: result.claims,
    spendUSD: { ...spend, total: +total.toFixed(4) },
    seconds: +((Date.now() - t0) / 1000).toFixed(0),
  };
  writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));

  log(`\ndone · ${report.words} words in ${report.lines} lines · ${result.remaining.length ? `STILL FAILING: ${result.remaining.map((i) => i.split(":")[0]).join(", ")}` : "all checks pass"}`);
  if (VOICE) await record(result.script, outline, outDir);
  for (const [stage, s] of Object.entries(spend)) log(`  ${stage.padEnd(8)} $${s.usd.toFixed(4)} · ${s.calls} call(s)`);
  log(`  TOTAL    $${total.toFixed(4)} · ${report.seconds}s`);
  log(`→ ${outDir}`);
})().catch((e) => { console.error(e); process.exit(1); });
