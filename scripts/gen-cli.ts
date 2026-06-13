// Load .env.local for GEMINI_API_KEY etc. (Next.js auto-loads for routes;
// tsx scripts don't, so we do it explicitly here.) `quiet` swallows the
// dotenv banner so script stdout stays clean for piping JSON.
import { config as loadDotenv } from "dotenv";
loadDotenv({ path: ".env.local", quiet: true });
loadDotenv({ path: ".env", quiet: true });

/**
 * gen-cli.ts — drive the engine from a local pack of PDFs.
 *
 * Usage:
 *   npx tsx scripts/gen-cli.ts <pack-dir> [--density=max|standard|minimal]
 *                                          [--exam=conceptual|problem-solving|mixed]
 *                                          [--priority=formulas|concepts|balanced]
 *                                          [--out=<output.json>]
 *
 * <pack-dir> is scanned for PDFs. File tag is guessed from the filename:
 *   *exam*|*midterm*|*final*|*quiz* → past_exam
 *   *review*                        → review
 *   *hw*|*homework*                 → homework
 *   *note*                          → notes
 *   *formula*                       → formula_sheet
 *   default                         → slides
 *
 * Override with TAG markers in the filename, e.g.:
 *   "[past_exam] CS6320 final 2024.pdf"
 *
 * Prints the resulting SheetContent JSON to stdout (or --out file)
 * + a short audit summary on stderr (token usage, retry, citation
 * sanity check).
 */
import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { generateSheet, EngineError } from "@/engine/rank";
import { extractPdfText } from "@/parse/pdf";
import { type Density } from "@/renderer/sheet";
import {
  type ExamType,
  type PriorityMode,
  type FileTag,
  type PackFile,
} from "@/engine/prompt";

const TAG_RX: Array<[FileTag, RegExp]> = [
  ["past_exam", /\[past_exam\]|exam|midterm|final|quiz/i],
  ["review", /\[review\]|review/i],
  ["homework", /\[homework\]|\bhw\d?\b|homework/i],
  ["notes", /\[notes\]|note/i],
  ["formula_sheet", /\[formula_sheet\]|formula[-_ ]?sheet/i],
];

function guessTag(filename: string): FileTag {
  for (const [tag, rx] of TAG_RX) {
    if (rx.test(filename)) return tag;
  }
  return "slides";
}

interface CliArgs {
  packDir: string;
  density: Density;
  examType: ExamType;
  priority: PriorityMode;
  outPath?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const [packDir, ...rest] = argv.slice(2);
  if (!packDir) {
    console.error("usage: tsx scripts/gen-cli.ts <pack-dir> [--density=...] [--exam=...] [--priority=...] [--out=...]");
    process.exit(2);
  }
  const get = (k: string) => {
    const a = rest.find((s) => s.startsWith(`--${k}=`));
    return a ? a.split("=").slice(1).join("=") : undefined;
  };
  return {
    packDir: path.resolve(packDir),
    density: (get("density") ?? "max") as Density,
    examType: (get("exam") ?? "mixed") as ExamType,
    priority: (get("priority") ?? "balanced") as PriorityMode,
    outPath: get("out"),
  };
}

async function findPdfs(dir: string, depth = 0): Promise<string[]> {
  if (depth > 2) return []; // don't recurse too deeply
  const entries = await readdir(dir);
  const results: string[] = [];
  for (const e of entries) {
    if (e.startsWith(".")) continue;
    const full = path.join(dir, e);
    const st = await stat(full);
    if (st.isDirectory()) {
      results.push(...(await findPdfs(full, depth + 1)));
    } else if (e.toLowerCase().endsWith(".pdf")) {
      results.push(full);
    }
  }
  return results;
}

async function main() {
  const args = parseArgs(process.argv);
  console.error(`[gen-cli] pack=${args.packDir}`);
  console.error(`[gen-cli] density=${args.density} exam=${args.examType} priority=${args.priority}`);

  const pdfs = await findPdfs(args.packDir);
  if (pdfs.length === 0) {
    console.error(`[gen-cli] no PDFs found in ${args.packDir}`);
    process.exit(1);
  }
  console.error(`[gen-cli] found ${pdfs.length} PDFs`);

  const pack: PackFile[] = [];
  for (const file of pdfs) {
    const buf = await readFile(file);
    try {
      const { text, charCount, pageCount } = await extractPdfText(buf);
      const tag = guessTag(path.basename(file));
      const filename = path.basename(file);
      console.error(`[gen-cli]   ${tag.padEnd(12)} ${pageCount}p ${charCount}c  ${filename}`);
      pack.push({ tag, filename, text });
    } catch (e) {
      console.error(`[gen-cli]   FAILED  ${path.basename(file)}: ${e instanceof Error ? e.message : e}`);
    }
  }

  console.error(`[gen-cli] running engine…`);
  const startedAt = Date.now();
  try {
    const result = await generateSheet({
      pack,
      examType: args.examType,
      density: args.density,
      priority: args.priority,
    });

    const audit = auditCitations(result.content, pack);

    console.error(`[gen-cli] done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
    console.error(`[gen-cli] model=${result.meta.model} retried=${result.meta.retried}`);
    console.error(`[gen-cli] tokens: in=${result.meta.inputTokens} out=${result.meta.outputTokens}`);
    console.error(`[gen-cli] items: ${itemSummary(result.content)}`);
    console.error(`[gen-cli] citation audit: ${audit.realPct}% of sources match filenames in pack`);
    console.error(
      `[gen-cli] sanitize: stripped verified from ${result.meta.sanitizedItems} item(s), ` +
        `dropped ${result.meta.droppedPatterns} verifiedPattern(s)`,
    );
    if (result.warnings.length > 0) {
      console.error(`[gen-cli] WARNINGS (${result.warnings.length}):`);
      for (const w of result.warnings) console.error(`  ⚠ ${w}`);
    }
    if (audit.suspicious.length > 0) {
      console.error(`[gen-cli] WARN suspicious citations:`);
      for (const c of audit.suspicious.slice(0, 5)) console.error(`         - ${c}`);
    }

    const json = JSON.stringify(result.content, null, 2);
    if (args.outPath) {
      await writeFile(args.outPath, json);
      console.error(`[gen-cli] wrote ${args.outPath}`);
    } else {
      process.stdout.write(json);
    }
  } catch (e) {
    if (e instanceof EngineError) {
      console.error(`[gen-cli] ENGINE ERROR: ${e.message}`);
      if (e.raw) {
        console.error(`[gen-cli] last raw (300 chars): ${e.raw.slice(0, 300)}`);
      }
      process.exit(1);
    }
    throw e;
  }
}

function itemSummary(c: import("@/contract/sheet-content").SheetContent) {
  return [
    `${c.topics.length} topics`,
    `${c.formulas.length} formulas`,
    `${c.concepts.length} concepts`,
    `${c.traps.length} traps`,
    `${c.questions.length} questions`,
    `${c.tables?.length ?? 0} tables`,
    `${c.verifiedPatterns?.length ?? 0} verifiedPatterns`,
  ].join(" · ");
}

/**
 * Heuristic citation audit — does each `src` mention a token that
 * appears in one of the file names? Catches the "invented citation"
 * failure mode (the moat-breaking one).
 */
function auditCitations(
  c: import("@/contract/sheet-content").SheetContent,
  pack: PackFile[],
) {
  const filenameTokens = new Set<string>();
  for (const f of pack) {
    for (const tok of f.filename.toLowerCase().split(/[^a-z0-9]+/)) {
      if (tok.length >= 3) filenameTokens.add(tok);
    }
  }
  // Always allow these "context" citation patterns.
  const allow = /(slide|page|p\d|q\d|review|homework|hw|exam|midterm|final|quiz|context|distilled)/i;

  const sources: string[] = [];
  const push = (s: string) => sources.push(s);
  c.topics.forEach((x) => push(x.src));
  c.formulas.forEach((x) => push(x.src));
  c.concepts.forEach((x) => push(x.src));
  c.questions.forEach((x) => push(x.src));
  c.traps.forEach((x) => push(x.src));
  c.tables?.forEach((x) => push(x.src));
  c.verifiedPatterns?.forEach((x) => push(x.src));

  const suspicious: string[] = [];
  for (const s of sources) {
    if (allow.test(s)) continue;
    const lc = s.toLowerCase();
    const matched = Array.from(filenameTokens).some((t) => lc.includes(t));
    if (!matched) suspicious.push(s);
  }
  const real = sources.length - suspicious.length;
  return {
    total: sources.length,
    real,
    realPct: sources.length ? Math.round((real / sources.length) * 100) : 100,
    suspicious,
  };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
