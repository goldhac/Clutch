/**
 * /api/generate — turn an uploaded pack into a SheetContent JSON.
 *
 * Step 6 minimal version: no auth, no persistence (that's Step 9).
 * Accepts multipart/form-data:
 *   - file_N           File (PDF)
 *   - tag_N            FileTag (slides | review | past_exam | ...)
 *   - examType         "conceptual" | "problem-solving" | "mixed"
 *   - density          "minimal" | "standard" | "max"
 *   - priority         "formulas" | "concepts" | "balanced"
 *   - courseCode       OPTIONAL
 *   - professor        OPTIONAL
 *
 * Returns the validated SheetContent + engine meta (model, tokens,
 * retried) as JSON.
 *
 * On engine validation failure even after retry → 422 with the error.
 * On unexpected error → 500 with the message.
 */
import { type NextRequest } from "next/server";
import { generateSheet, EngineError } from "@/engine/rank";
import { ingestDocument } from "@/parse/ingest";
import type { CroppedFigure } from "@/parse/figures";
import { attachFigures } from "@/engine/attach-figures";
import { deepenPool, FILL_TARGET } from "@/engine/deepen";
import { detectExamFormat } from "@/engine/detect-format";
import { capacityResponse, isProviderCapacityError } from "@/lib/provider-outage";
import { repairForFormat } from "@/engine/format-repair";
import {
  EXAM_FORMATS,
  examTypeFor,
  type ExamFormat,
  type ExamType,
  type FileTag,
  type PackFile,
  type PriorityMode,
} from "@/engine/prompt";
import { type Density } from "@/components/sheet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Gemini calls can take 30-90s on a large pack. Default Next API timeout
// is 30s on some runtimes — bump to 300s.
export const maxDuration = 300;

const VALID_DENSITIES = new Set<Density>(["essentials", "balanced", "max"]);
const VALID_EXAM_TYPES = new Set<ExamType>([
  "conceptual",
  "problem-solving",
  "mixed",
]);
const VALID_PRIORITY = new Set<PriorityMode>([
  "formulas",
  "concepts",
  "balanced",
]);
const VALID_TAGS = new Set<FileTag>([
  "slides",
  "review",
  "past_exam",
  "homework",
  "notes",
  "formula_sheet",
]);

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch (e) {
    return badRequest(`could not parse multipart body: ${(e as Error).message}`);
  }

  const density = (form.get("density") ?? "max").toString() as Density;
  if (!VALID_DENSITIES.has(density)) return badRequest(`bad density: ${density}`);

  // examFormat is what the form sends since 2026-09-17; examType is derived from it. Older
  // clients that send only examType still work.
  const examFormat = (form.get("examFormat") ?? "mixed").toString() as ExamFormat;
  if (!EXAM_FORMATS.includes(examFormat)) return badRequest(`bad examFormat: ${examFormat}`);
  const examType = form.has("examFormat")
    ? examTypeFor(examFormat)
    : ((form.get("examType") ?? "mixed").toString() as ExamType);
  if (!VALID_EXAM_TYPES.has(examType)) return badRequest(`bad examType: ${examType}`);

  const priority = (form.get("priority") ?? "balanced").toString() as PriorityMode;
  if (!VALID_PRIORITY.has(priority)) return badRequest(`bad priority: ${priority}`);

  const courseCode = form.get("courseCode")?.toString().trim() || undefined;
  const professor = form.get("professor")?.toString().trim() || undefined;

  // Collect file_N / tag_N pairs. UI sends them in parallel arrays.
  // Validate everything before spending any model calls.
  const uploads: { file: File; tag: FileTag }[] = [];
  let i = 0;
  while (form.has(`file_${i}`)) {
    const file = form.get(`file_${i}`);
    const tag = form.get(`tag_${i}`)?.toString() as FileTag;
    i++;
    if (!(file instanceof File)) continue;
    if (!VALID_TAGS.has(tag)) {
      return badRequest(`bad tag for file ${file.name}: ${tag}`);
    }
    if (!/\.(pdf|txt|md|pptx)$/.test(file.name.toLowerCase())) {
      return badRequest(
        `unsupported file type for "${file.name}". Supported: PDF, PPTX, .txt, .md.`,
      );
    }
    uploads.push({ file, tag });
  }

  // Full ingest: text layer + SmartArt/notes (PPTX) + a figures-mode vision
  // pass that reads every page's diagrams, charts and rendered equations —
  // the lines a text layer drops (Phase 0: scaled dot-product attention was
  // missing from the attention lecture's text). Files run in parallel so the
  // vision cost is ~one lecture's latency, not one per file.
  const ingested = await Promise.allSettled(
    uploads.map(async ({ file, tag }) => {
      const buf = Buffer.from(await file.arrayBuffer());
      const r = await ingestDocument(file.name, buf, { vision: true, visionMode: "figures", figures: true });
      return { tag, filename: file.name, text: r.text, warnings: r.warnings, figures: r.figures ?? [] };
    }),
  );
  const pack: PackFile[] = [];
  const ingestWarnings: string[] = [];
  const packFigures: { filename: string; figures: CroppedFigure[] }[] = [];
  for (const [ix, result] of ingested.entries()) {
    if (result.status === "rejected") {
      return badRequest(
        `failed to extract "${uploads[ix].file.name}": ${(result.reason as Error).message}`,
      );
    }
    const { warnings, figures, ...file } = result.value;
    ingestWarnings.push(...warnings);
    pack.push(file);
    if (figures.length) packFigures.push({ filename: file.filename, figures });
  }

  if (pack.length === 0) {
    return badRequest("upload at least one file");
  }

  // The student left it on Mixed and gave us a past exam: read the format off the exam itself.
  let format = examFormat;
  let detectedFrom: string | undefined;
  if (examFormat === "mixed") {
    for (const f of pack.filter((x) => x.tag === "past_exam")) {
      const d = detectExamFormat(f.text);
      if (d.format !== "mixed") {
        format = d.format;
        detectedFrom = f.filename;
        console.warn(`[/api/generate] format detected from ${f.filename}: ${d.format} ${JSON.stringify(d.signals)}`);
        break;
      }
    }
  }
  const type = detectedFrom ? examTypeFor(format) : examType;

  const started = Date.now();
  const packSummary = `format=${format}${detectedFrom ? "(detected)" : ""} · ` + pack.map((f) => `${f.tag}:${f.filename}(${f.text.length}c)`).join(", ");
  try {
    const result = await generateSheet({
      pack,
      density,
      examType: type,
      examFormat: format,
      priority,
      courseContext: { code: courseCode, professor },
    });
    console.log(
      `[/api/generate] 200 in ${((Date.now() - started) / 1000).toFixed(0)}s · retried=${result.meta.retried} · ` +
        `warnings=${result.warnings.length} · figures=${packFigures.reduce((n, f) => n + f.figures.length, 0)} · ${packSummary}`,
    );
    // Diagrams ride along with the sheet; the student chooses which to place (issue #15).
    const packText = pack.map((f) => `===== ${f.filename} [${f.tag}] =====\n${f.text}`).join("\n\n").slice(0, 400_000);
    const fileNames = pack.map((f) => f.filename);
    // Both sides of the sheet get filled: when the pool is short, mine the pack deeper per topic.
    const fillWarnings: string[] = [];
    let pool = result.content;
    try {
      const deep = await deepenPool(pool, { packText, files: fileNames, examFormat: format });
      pool = deep.proposed;
      if (deep.asked || deep.cappedBySource) {
        console.warn(
          `[/api/generate] deepen · ${deep.before}→${deep.after} lines · asked ${deep.asked} · dropped ${deep.dropped.length} · ` +
            `${deep.seconds.toFixed(0)}s${deep.cappedBySource ? ` · capped by source at ${deep.sourceCap}` : ""}`,
        );
      }
      if (deep.cappedBySource && deep.after < FILL_TARGET * 0.8) {
        // ~72 lines fill a page. Say what the student will actually see.
        const howFull = deep.after < 90 ? "about one page" : "the front and part of the back";
        fillWarnings.push(
          `These files are short, so the sheet fills ${howFull}. We only print what your files say, and never the same thing twice. ` +
            "Add more material (slides, notes, a past exam) to fill the rest.",
        );
      }
    } catch (e) {
      console.error(`[/api/generate] deepen failed; shipping the first draft`, e);
    }
    // A format sheet must have the format's shape; patch it in a few seconds when it doesn't.
    const shaped = await repairForFormat(pool, format, { packText, files: fileNames });
    if (shaped.repaired) console.warn(`[/api/generate] format repair · ${shaped.repaired}`);
    const content = attachFigures(shaped.content, packFigures);
    return Response.json({
      content,
      meta: result.meta,
      warnings: [...ingestWarnings, ...result.warnings, ...fillWarnings],
      pack: pack.map((f) => ({ filename: f.filename, tag: f.tag, chars: f.text.length })),
      // The student's own text, so "Edit with Clutch" can ADD grounded lines later (issue #14).
      // Kept client-side for the session; capped to stay inside sessionStorage.
      packText,
      // What the sheet was actually built for — differs from the form when we read it off a past exam.
      examFormat: format,
      examType: type,
      formatDetectedFrom: detectedFrom,
    });
  } catch (e) {
    const secs = ((Date.now() - started) / 1000).toFixed(0);
    if (e instanceof EngineError) {
      // The technical reason goes to the log; the student gets words they can act on.
      console.error(`[/api/generate] 422 after ${secs}s · ${packSummary}\n${e.message.slice(0, 2000)}`);
      return new Response(
        "We couldn't build a sheet from these files this time. Nothing was saved and no credit was used. " +
          "Your files are still here, so please try again. If it happens twice, try removing the largest file.",
        { status: 422, headers: { "Content-Type": "text/plain; charset=utf-8" } },
      );
    }
    if (isProviderCapacityError(e)) return capacityResponse("/api/generate", e);
    console.error(`[/api/generate] 500 after ${secs}s · ${packSummary}`, e);
    return new Response(
      "Something went wrong on our side while building your sheet. Your files are still here, so please try again.",
      { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }
}

function badRequest(msg: string) {
  // Every failure is logged: a 422 on 2026-09-17 left no trace of which rule failed.
  console.warn(`[/api/generate] 400 ${msg}`);
  return new Response(msg, {
    status: 400,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
