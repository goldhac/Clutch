// Load .env.local for GEMINI_API_KEY (tsx scripts don't get Next's auto-load).
import { config as loadDotenv } from "dotenv";
loadDotenv({ path: ".env.local", quiet: true });

/**
 * contract-audit.ts — which contract rules does the engine's FIRST draft break?
 *
 * A user's generation died with a 422 on 2026-09-17 and nothing recorded which
 * rule failed. This measures it: for each pack, run the engine's first call
 * exactly as production does (same prompts, same temperature, figures-mode
 * ingest), validate the raw output STRICTLY (no salvage, no unknown-key
 * dropping) and tally every issue by rule.
 *
 *   npx tsx scripts/contract-audit.ts                 # all packs, fresh model calls
 *   npx tsx scripts/contract-audit.ts --revalidate    # re-check saved raw outputs (free)
 *   npx tsx scripts/contract-audit.ts --only attn,bert
 *   npx tsx scripts/contract-audit.ts --revalidate --production   # through the engine's real first-attempt path
 *
 * Raw outputs are saved under scripts/.audit/<label>/<pack>.json so a contract
 * change can be re-checked without paying for new calls.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { safeParseSheetContent } from "@/contract/sheet-content";
import { defaultGeminiClient } from "@/engine/gemini-client";
import { buildSystemPrompt, buildUserPrompt, examTypeFor, type ExamFormat, type FileTag, type PackFile } from "@/engine/prompt";
import { tryParseJsonAndValidate } from "@/engine/rank";
import { ingestDocument } from "@/parse/ingest";

const argv = process.argv.slice(2);
const REVALIDATE = argv.includes("--revalidate");
/** Judge drafts the way production does on attempt 1: normalize, drop unknown keys, salvage ≤ 3 items. */
const PRODUCTION = argv.includes("--production");
const ONLY = argv.includes("--only") ? (argv[argv.indexOf("--only") + 1] ?? "").split(",").filter(Boolean) : [];
/** --format true-false|multiple-choice|… audits a format mode (issue #11); label defaults to it. */
const FORMAT = (argv.includes("--format") ? argv[argv.indexOf("--format") + 1] : "mixed") as ExamFormat;
const LABEL = argv.includes("--label") ? argv[argv.indexOf("--label") + 1] : FORMAT === "mixed" ? "baseline" : FORMAT;
const OUT = join("scripts/.audit", LABEL);

const P = "reference/exam-prep";
const PACKS: Record<string, [FileTag, string][]> = {
  attn: [["slides", `${P}/21-attn.pdf`]],
  bert: [["slides", `${P}/22-bert.pdf`], ["slides", `${P}/23-pretrained.pdf`]],
  parsing: [["slides", `${P}/8-parsing.pdf`], ["slides", `${P}/9-parsing.pdf`]],
  embeddings: [["slides", `${P}/15-embeddings.pdf`], ["slides", `${P}/16-embeddings.pdf`]],
  mt: [["slides", `${P}/12-mt.pdf`], ["slides", `${P}/13-mt.pdf`], ["review", `${P}/00-meta/exam-format.pdf`]],
  bigdata: [
    ["review", `${P}/Big_Data_Exam/NoSQL Review.pdf`],
    ["review", `${P}/Big_Data_Exam/Cassandra-HBASE-Review.pdf`],
    ["notes", `${P}/Big_Data_Exam/class-notes/review1.txt`],
  ],
};

interface Issue { rule: string; path: string; message: string; wrote: string }

function audit(rawText: string): { issues: Issue[]; items: number; parseError?: string } {
  const cleaned = rawText.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    return { issues: [], items: 0, parseError: (e as Error).message };
  }
  const root = parsed as Record<string, unknown>;
  const items = Object.values(root).reduce<number>((n, v) => n + (Array.isArray(v) ? v.length : 0), 0);
  const result = safeParseSheetContent(parsed);
  if (result.success) return { issues: [], items };
  const at = (path: (string | number)[]) =>
    path.reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[String(k)] : undefined), parsed);
  return {
    items,
    issues: result.error.issues.map((i) => {
      const where = i.path.filter((seg) => typeof seg === "string").join(".");
      const extra = i.code === "unrecognized_keys" ? ` {${(i as { keys: string[] }).keys.join(",")}}` : "";
      // The item the issue sits in (2 segments deep), not just the failing leaf.
      const item = at(i.path.slice(0, 2));
      return {
        rule: `${where} · ${i.message.split(" (")[0].split(":")[0].slice(0, 70)}${extra}`,
        path: i.path.join("."),
        message: i.message,
        wrote: JSON.stringify(item ?? at(i.path)).slice(0, 260),
      };
    }),
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const names = Object.keys(PACKS).filter((n) => !ONLY.length || ONLY.includes(n));
  const client = REVALIDATE ? null : defaultGeminiClient();
  const system = buildSystemPrompt();
  const rows: { name: string; items: number; issues: Issue[]; parseError?: string; secs: number }[] = [];

  let next = 0;
  await Promise.all(Array.from({ length: Math.min(3, names.length) }, async () => {
    while (next < names.length) {
      const name = names[next++];
      const file = join(OUT, `${name}.json`);
      const t0 = Date.now();
      let raw: string;
      if (REVALIDATE) {
        if (!existsSync(file)) continue;
        raw = JSON.parse(readFileSync(file, "utf8")).raw;
      } else {
        const pack: PackFile[] = [];
        for (const [tag, path] of PACKS[name]) {
          const r = await ingestDocument(basename(path), readFileSync(path), { vision: true, visionMode: "figures" });
          pack.push({ tag, filename: basename(path), text: r.text });
        }
        const user = buildUserPrompt({ pack, examType: examTypeFor(FORMAT), examFormat: FORMAT, density: "max", priority: "balanced" });
        const res = await client!.generate({ system, user, temperature: 0.3 });
        raw = res.text;
        writeFileSync(file, JSON.stringify({ raw, usage: res.usage }, null, 2));
      }
      if (PRODUCTION) {
        const r = tryParseJsonAndValidate(raw, 3);
        if (r.ok) {
          // What the format actually changed: question kinds, FALSE share, traps, tables.
          const qs = r.value.questions;
          const kinds: Record<string, number> = {};
          for (const q of qs) kinds[q.kind] = (kinds[q.kind] ?? 0) + 1;
          const falseN = qs.filter((q) => /^\s*false\b/i.test(q.a)).length, trueN = qs.filter((q) => /^\s*true\b/i.test(q.a)).length;
          const notX = qs.filter((q) => /—\s*not\b|\bnot\s+[^:]{2,60}:/i.test(q.a)).length;
          console.log(`  ${name.padEnd(11)} shape: kinds ${JSON.stringify(kinds)} · TRUE ${trueN} / FALSE ${falseN} · "not X:" answers ${notX} · traps ${r.value.traps.length} · tables ${(r.value.tables ?? []).length} · concepts ${r.value.concepts.length} · formulas ${r.value.formulas.length}`);
        }
        console.log(`  ${name.padEnd(11)} ${r.ok ? `PASSES on the first attempt · ${r.dropped.length} item(s) dropped${r.dropped.length ? ": " + r.dropped.join(" | ").slice(0, 200) : ""}` : "NEEDS A RETRY · " + r.error.split("\n").length + " issue(s): " + r.error.split("\n").slice(0, 3).join(" ").slice(0, 300)}`);
        continue;
      }
      const a = audit(raw);
      rows.push({ name, ...a, secs: Math.round((Date.now() - t0) / 1000) });
      console.error(`[audit] ${name}: ${a.parseError ? "NOT JSON — " + a.parseError : `${a.items} items · ${a.issues.length} issue(s)`} · ${Math.round((Date.now() - t0) / 1000)}s`);
    }
  }));

  if (PRODUCTION) return;
  const tally = new Map<string, { count: number; packs: Set<string>; example: string }>();
  for (const r of rows) for (const i of r.issues) {
    const t = tally.get(i.rule) ?? { count: 0, packs: new Set<string>(), example: i.wrote };
    t.count++; t.packs.add(r.name);
    tally.set(i.rule, t);
  }
  const clean = rows.filter((r) => !r.parseError && r.issues.length === 0).length;
  console.log(`\n=== ${LABEL}: ${clean}/${rows.length} packs passed strict validation on the first draft ===`);
  for (const r of rows.sort((a, b) => a.name.localeCompare(b.name))) {
    console.log(`  ${r.name.padEnd(11)} ${r.parseError ? "NOT JSON" : `${String(r.items).padStart(3)} items · ${r.issues.length} issue(s)`}`);
  }
  console.log(`\n--- rules broken, most frequent first ---`);
  for (const [rule, t] of [...tally.entries()].sort((a, b) => b[1].count - a[1].count)) {
    console.log(`${String(t.count).padStart(3)}×  in ${t.packs.size} pack(s)  ${rule}\n        e.g. ${t.example}`);
  }
  writeFileSync(join(OUT, "_summary.json"), JSON.stringify({ label: LABEL, clean, packs: rows.length, rows, tally: [...tally.entries()].map(([rule, t]) => ({ rule, count: t.count, packs: [...t.packs], example: t.example })) }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
