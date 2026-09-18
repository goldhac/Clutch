import { config as loadDotenv } from "dotenv";
loadDotenv({ path: ".env.local", quiet: true });
/**
 * eval-claims.ts — how good is the claims checker, measured? (issue #17)
 *
 *   npx tsx scripts/eval-claims.ts                 # Flash
 *   npx tsx scripts/eval-claims.ts --model pro     # Pro
 *   npx tsx scripts/eval-claims.ts --runs 3        # repeat: the checker must be stable, not lucky
 *
 * RECALL on unsupported lines is the number that matters (target ≥ 90%): a wrong line that gets
 * through costs a student marks. False alarms on supported lines cost a little space; reported,
 * and kept under ~25% so the fill still has something to add.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { checkClaims } from "@/engine/claims-check";
import { GEMINI_FLASH, GEMINI_PRO } from "@/engine/gemini-client";

const argv = process.argv.slice(2);
const model = argv.includes("--model") && argv[argv.indexOf("--model") + 1] === "pro" ? GEMINI_PRO : GEMINI_FLASH;
/** Stage 2 is off by default in the checker; --relation measures it. */
const withRelation = argv.includes("--relation");
const runs = argv.includes("--runs") ? Number(argv[argv.indexOf("--runs") + 1]) : 1;
const DIR = "scripts/evals/claims";

(async () => {
  const set = JSON.parse(readFileSync(join(DIR, "attn.json"), "utf8")) as { source: string; lines: { id: string; label: string; kind: string; text: string; why?: string }[] };
  const source = readFileSync(join(DIR, set.source), "utf8");
  const unsupported = set.lines.filter((l) => l.label === "unsupported"), supported = set.lines.filter((l) => l.label === "supported");
  const missCount = new Map<string, number>(), alarmCount = new Map<string, number>();
  const recalls: number[] = [], alarms: number[] = [];
  for (let r = 0; r < runs; r++) {
    const t0 = Date.now();
    // Shuffled, so a verdict never rides on its neighbours.
    const order = [...set.lines].sort(() => Math.random() - 0.5);
    const verdicts = new Map((await checkClaims(order.map((l) => ({ id: l.id, text: l.text })), source, { model, relation: withRelation })).map((v) => [v.id, v]));
    const missed = unsupported.filter((l) => verdicts.get(l.id)?.supported);
    const falseAlarms = supported.filter((l) => !verdicts.get(l.id)?.supported);
    recalls.push(1 - missed.length / unsupported.length); alarms.push(falseAlarms.length / supported.length);
    console.log(`\nrun ${r + 1} · ${model}${withRelation ? " · + relation stage" : ""} · ${((Date.now() - t0) / 1000).toFixed(0)}s · recall on unsupported ${(100 * recalls[r]).toFixed(0)}% (${unsupported.length - missed.length}/${unsupported.length}) · false alarms ${(100 * alarms[r]).toFixed(0)}% (${falseAlarms.length}/${supported.length})`);
    for (const l of missed) { missCount.set(l.id, (missCount.get(l.id) ?? 0) + 1); console.log(`  MISSED  ${l.id} [${l.kind}] ${l.text}\n          evidence it accepted: "${verdicts.get(l.id)?.evidence?.slice(0, 120)}"`); }
    const unchecked = set.lines.filter((l) => verdicts.get(l.id)?.stage === "unchecked");
    if (unchecked.length) console.log(`  !! ${unchecked.length} line(s) the CHECKER failed to answer for — not evidence of anything`);
    for (const l of falseAlarms) { alarmCount.set(l.id, (alarmCount.get(l.id) ?? 0) + 1); const v = verdicts.get(l.id)!; console.log(`  ALARM   ${l.id} [${v.stage}] ${l.text.slice(0, 90)}\n          ${v.note.slice(0, 140)}`); }
    const byStage: Record<string, number> = {};
    for (const l of unsupported) { const s = verdicts.get(l.id)!.stage; byStage[s] = (byStage[s] ?? 0) + 1; }
    console.log(`  unsupported lines stopped at:`, byStage);
  }
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  console.log(`\n=== ${runs} run(s): recall ${(100 * avg(recalls)).toFixed(1)}% (min ${(100 * Math.min(...recalls)).toFixed(0)}%) · false alarms ${(100 * avg(alarms)).toFixed(1)}% · target: recall ≥ 90% ===`);
  mkdirSync(join(DIR, "results"), { recursive: true });
  writeFileSync(join(DIR, "results", `${new Date().toISOString().slice(0, 10)}-${model}.json`), JSON.stringify({ model, runs, recalls, alarms, missed: [...missCount], falseAlarms: [...alarmCount] }, null, 1));
})();
