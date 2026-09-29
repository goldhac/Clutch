import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
/**
 * test-script-model.ts — can the script stage run on Flash instead of Pro?
 *
 *   npx tsx scripts/test-script-model.ts --spend [runs]
 *
 * The script stage is the dominant cost of an episode: $0.1730 of a measured $0.3369, because
 * Gemini Pro bills output at $10/1M and a script is almost entirely output. Flash is 4x cheaper
 * on output. The question is not whether it is cheaper — it obviously is — but whether what it
 * writes still passes the gates the product already enforces.
 *
 * So this holds everything else still. ONE outline is written on Pro and reused for every run, so
 * the only variable is the model writing the script. For each run it reports the three things that
 * decide it:
 *
 *   remaining   structural rules still failing when revisions ran out. Non-empty is a reject:
 *               the episode would be refused at the final gate.
 *   unsupported claims the checker could not find in the source. This is the one that matters
 *               most — a cheap script that invents content is worse than no episode.
 *   drafts      how many revision passes it needed. A model that needs three passes at a quarter
 *               the price is not a quarter the price.
 */
import { readFileSync } from "node:fs";
import { outlineEpisode, writeScript } from "@/engine/podcast";
import { GEMINI_FLASH, GEMINI_PRO } from "@/engine/gemini-client";

const SOURCE = readFileSync("samples/audio-test/lecture.md", "utf8");
const MINUTES = 6;
/** ai.google.dev list prices, per 1M tokens. */
const PRICE: Record<string, { in: number; out: number }> = {
  [GEMINI_PRO]: { in: 1.25, out: 10 },
  [GEMINI_FLASH]: { in: 0.3, out: 2.5 },
};
const money = (n: number) => `$${n.toFixed(4)}`;

interface Run { model: string; cost: number; seconds: number; words: number; drafts: number; remaining: string[]; unsupported: string[]; checked: number; failed?: string }

async function once(model: string, outline: Awaited<ReturnType<typeof outlineEpisode>>): Promise<Run> {
  const t = Date.now();
  let cost = 0;
  let checkedTotal = 0;
  try {
    const r = await writeScript(outline, SOURCE, {
      model,
      minutes: MINUTES,
      onUsage: (stage, u) => {
        // The claims pass always runs on Flash; only the script itself changes model.
        const m = stage === "claims" ? GEMINI_FLASH : model;
        cost += ((u.inputTokens ?? 0) * PRICE[m].in + (u.outputTokens ?? 0) * PRICE[m].out) / 1e6;
      },
    });
    for (const c of r.claims) checkedTotal += c.checked;
    return {
      model, cost, seconds: (Date.now() - t) / 1000,
      words: r.drafts[r.drafts.length - 1]?.words ?? 0,
      drafts: r.drafts.length,
      remaining: r.remaining,
      unsupported: r.claims.flatMap((c) => c.unsupported),
      checked: checkedTotal,
    };
  } catch (e) {
    return { model, cost, seconds: (Date.now() - t) / 1000, words: 0, drafts: 0, remaining: [], unsupported: [], checked: 0, failed: e instanceof Error ? e.message.slice(0, 120) : String(e) };
  }
}

async function main(runs: number) {
  console.log(`source: samples/audio-test/lecture.md · target ${MINUTES} min · ${runs} run(s) per model\n`);
  console.log("writing one outline on Pro, reused for every run…");
  let outlineCost = 0;
  const outline = await outlineEpisode(SOURCE, {
    minutes: MINUTES,
    onUsage: (_s, u) => { outlineCost += ((u.inputTokens ?? 0) * PRICE[GEMINI_PRO].in + (u.outputTokens ?? 0) * PRICE[GEMINI_PRO].out) / 1e6; },
  });
  console.log(`outline: ${outline.beats.length} beats, ${money(outlineCost)}\n`);

  const results: Run[] = [];
  for (const model of MODELS) {
    for (let i = 0; i < runs; i++) {
      process.stdout.write(`  ${model} run ${i + 1}… `);
      const r = await once(model, outline);
      results.push(r);
      console.log(r.failed ? `FAILED: ${r.failed}` : `${money(r.cost)} · ${r.words}w · ${r.drafts} draft(s) · ${r.remaining.length} rule(s) failing · ${r.unsupported.length}/${r.checked} unsupported · ${r.seconds.toFixed(0)}s`);
    }
  }

  console.log("\n─── summary ───");
  for (const model of MODELS) {
    const rs = results.filter((r) => r.model === model);
    const ok = rs.filter((r) => !r.failed);
    const avg = (f: (r: Run) => number) => ok.length ? ok.reduce((n, r) => n + f(r), 0) / ok.length : 0;
    console.log(`\n${model}`);
    console.log(`  cost        ${money(avg((r) => r.cost))} avg`);
    console.log(`  words       ${Math.round(avg((r) => r.words))} (target ~${MINUTES * 160})`);
    console.log(`  drafts      ${avg((r) => r.drafts).toFixed(1)} avg`);
    console.log(`  rules still failing   ${ok.filter((r) => r.remaining.length).length}/${ok.length} run(s)`);
    console.log(`  runs with unsupported ${ok.filter((r) => r.unsupported.length).length}/${ok.length}`);
    if (rs.some((r) => r.failed)) console.log(`  OUTRIGHT FAILURES  ${rs.filter((r) => r.failed).length}/${rs.length}`);
    const bad = ok.flatMap((r) => r.remaining);
    if (bad.length) console.log(`  failing rules: ${[...new Set(bad)].slice(0, 4).join(" | ")}`);
    const uns = ok.flatMap((r) => r.unsupported);
    if (uns.length) console.log(`  unsupported: ${uns.slice(0, 3).map((u) => `"${String(u).slice(0, 70)}"`).join(" · ")}`);
  }

  const pro = results.filter((r) => r.model === GEMINI_PRO && !r.failed);
  const fl = results.filter((r) => r.model === GEMINI_FLASH && !r.failed);
  if (pro.length && fl.length) {
    const p = pro.reduce((n, r) => n + r.cost, 0) / pro.length;
    const f = fl.reduce((n, r) => n + r.cost, 0) / fl.length;
    console.log(`\nscript stage: ${money(p)} → ${money(f)} · ${(100 * (1 - f / p)).toFixed(0)}% cheaper`);
    console.log(`episode total would move ~${money(0.3369)} → ~${money(0.3369 - p + f)}`);
  }
}

const runs = Number(process.argv[3] ?? 2);
/**
 * Optional third argument narrows to one model: `--spend 4 flash`. A decision this load-bearing
 * needs more than one usable sample, and Flash samples are cheap enough to take several.
 */
const only = process.argv[4]?.toLowerCase();
const MODELS = only === "flash" ? [GEMINI_FLASH] : only === "pro" ? [GEMINI_PRO] : [GEMINI_PRO, GEMINI_FLASH];
if (process.argv[2] === "--spend") main(runs).catch((e) => { console.error(`FAILED: ${e.message}`); process.exit(1); });
else {
  console.log("Writes real scripts and costs real money (~$0.43 for 2 runs per model).");
  console.log("  npx tsx scripts/test-script-model.ts --spend [runs]");
  process.exit(1);
}
