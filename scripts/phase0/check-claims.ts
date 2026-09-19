import { config as loadDotenv } from "dotenv";
loadDotenv({ path: ".env.local", quiet: true });
/**
 * check-claims.ts — the quote-anchored claims check (issue #17), applied to an AUDIO script.
 *
 * Round 4 shipped four lines saying copying *created* the repetition problem; the lecture says
 * encoder-decoders in general repeat. The old checker read 54 claims and passed all 54. This
 * replaces it, and the difference is that support has to be QUOTED and the quote is then found
 * in the source by code, not taken on the model's word.
 *
 *   npx tsx scripts/phase0/check-claims.ts <out-dir>            # check a generated episode
 *   npx tsx scripts/phase0/check-claims.ts <out-dir> --control  # + inject the round-4 misses
 *
 * A podcast line is not a sheet line: most dialogue asserts nothing ("Right, so where does that
 * leave us?"). Checking everything would drown the real flags, so lines are SELECTED first, with
 * a regex — no model, no cost, no judgement — for the three kinds that can be wrong in a way that
 * costs a student marks: a number, a causal link, or "the lecture says".
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkClaims, type ClaimLine } from "@/engine/claims-check";

export interface ScriptLine { speaker: string; text: string }

/** A specific number — not "one of two things", not a list counter. */
const NUMBER = /\b\d{2,}(?:[.,]\d+)?\b|\b\d+(?:\.\d+)?\s?%|\b\d+(?:\.\d+)?\s?(?:x|times|percent|million|billion|thousand)\b/i;
/** X caused / created / led to Y — the round-4 failure. */
const CAUSAL = /\b(caus(?:e[sd]?|ing)|creat(?:e[sd]?|ing)|led to|leads to|introduc(?:e[sd]?|ing)|gives? rise to|results? in|resulting in|that'?s why|which is why|so that'?s how)\b/i;
/** A claim about the material itself. */
const SOURCE_CLAIM = /\b(the (?:lecture|slides?|notes?|paper|professor|deck)|she (?:says|showed|writes)|it says|according to)\b/i;

export function selectClaimLines(lines: ScriptLine[]): { index: number; kind: string; text: string }[] {
  const out: { index: number; kind: string; text: string }[] = [];
  lines.forEach((l, index) => {
    const kinds: string[] = [];
    if (NUMBER.test(l.text)) kinds.push("number");
    if (CAUSAL.test(l.text)) kinds.push("cause");
    if (SOURCE_CLAIM.test(l.text)) kinds.push("source");
    if (kinds.length) out.push({ index, kind: kinds.join("+"), text: l.text });
  });
  return out;
}

/** The four lines round 4 shipped past the old checker, plus two more from FINDINGS. */
export const KNOWN_MISSES: string[] = [
  "So copying solved the unknown word problem, but that created a new one: the model starts repeating itself.",
  "Copying words straight from the input is what causes the repetition problem.",
  "That copy mechanism leads to deletion, where the model skips part of the input entirely.",
  "And because the pointer keeps pointing at the same word, you get repetition.",
  "A typical decoder vocabulary is around 50,000 words.",
  "When the decoder hits a word it has never seen, p-gen turns like a dial toward copying.",
];

async function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error("usage: check-claims.ts <out-dir> [--control]");
  const control = process.argv.includes("--control");
  const source = readFileSync(join(dir, "source.txt"), "utf8");
  const raw = JSON.parse(readFileSync(join(dir, "script.json"), "utf8")) as { lines?: ScriptLine[] } | ScriptLine[];
  const lines: ScriptLine[] = Array.isArray(raw) ? raw : (raw.lines ?? []);

  const selected = selectClaimLines(lines);
  const controls = control ? KNOWN_MISSES.map((text, i) => ({ index: -1 - i, kind: "control", text })) : [];
  const all = [...selected, ...controls];
  console.log(`${lines.length} script lines · ${selected.length} carry a checkable claim (${Math.round((100 * selected.length) / lines.length)}%)${control ? ` · + ${controls.length} planted misses` : ""}`);

  const claims: ClaimLine[] = all.map((c, i) => ({ id: String(i), text: c.text }));
  const t0 = Date.now();
  const verdicts = await checkClaims(claims, source, { prose: true });
  const bad = verdicts.filter((v) => !v.supported);
  console.log(`checked in ${((Date.now() - t0) / 1000).toFixed(0)}s · ${bad.length} unsupported\n`);

  let caught = 0;
  for (const v of bad) {
    const c = all[Number(v.id)];
    if (c.kind === "control") caught++;
    console.log(`${c.kind === "control" ? "CONTROL" : `line ${c.index}`} [${c.kind}] ${v.stage}\n  "${c.text.slice(0, 150)}"\n  → ${v.note.slice(0, 120)}\n`);
  }
  if (control) {
    console.log(`=== planted misses caught: ${caught}/${controls.length} ===`);
    const realFlags = bad.length - caught;
    console.log(`=== flags on the real script: ${realFlags} of ${selected.length} checked ===`);
  }
}

if (process.argv[1]?.endsWith("check-claims.ts")) main().catch((e) => { console.error(e); process.exit(1); });
