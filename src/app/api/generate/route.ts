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
import {
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

  const examType = (form.get("examType") ?? "mixed").toString() as ExamType;
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
      const r = await ingestDocument(file.name, buf, { vision: true, visionMode: "figures" });
      return { tag, filename: file.name, text: r.text, warnings: r.warnings };
    }),
  );
  const pack: PackFile[] = [];
  const ingestWarnings: string[] = [];
  for (const [ix, result] of ingested.entries()) {
    if (result.status === "rejected") {
      return badRequest(
        `failed to extract "${uploads[ix].file.name}": ${(result.reason as Error).message}`,
      );
    }
    const { warnings, ...file } = result.value;
    ingestWarnings.push(...warnings);
    pack.push(file);
  }

  if (pack.length === 0) {
    return badRequest("upload at least one file");
  }

  const started = Date.now();
  const packSummary = pack.map((f) => `${f.tag}:${f.filename}(${f.text.length}c)`).join(", ");
  try {
    const result = await generateSheet({
      pack,
      density,
      examType,
      priority,
      courseContext: { code: courseCode, professor },
    });
    console.log(
      `[/api/generate] 200 in ${((Date.now() - started) / 1000).toFixed(0)}s · retried=${result.meta.retried} · ` +
        `warnings=${result.warnings.length} · ${packSummary}`,
    );
    return Response.json({
      content: result.content,
      meta: result.meta,
      warnings: [...ingestWarnings, ...result.warnings],
      pack: pack.map((f) => ({ filename: f.filename, tag: f.tag, chars: f.text.length })),
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
