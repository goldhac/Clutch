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
import { extractPdfText } from "@/parse/pdf";
import { extractText } from "@/parse/text";
import {
  type ExamType,
  type FileTag,
  type PackFile,
  type PriorityMode,
} from "@/engine/prompt";
import { type Density } from "@/renderer/sheet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Gemini calls can take 30-90s on a large pack. Default Next API timeout
// is 30s on some runtimes — bump to 300s.
export const maxDuration = 300;

const VALID_DENSITIES = new Set<Density>(["minimal", "standard", "max"]);
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
  const pack: PackFile[] = [];
  let i = 0;
  while (form.has(`file_${i}`)) {
    const file = form.get(`file_${i}`);
    const tag = form.get(`tag_${i}`)?.toString() as FileTag;
    i++;
    if (!(file instanceof File)) continue;
    if (!VALID_TAGS.has(tag)) {
      return badRequest(`bad tag for file ${file.name}: ${tag}`);
    }
    const buf = Buffer.from(await file.arrayBuffer());
    try {
      const name = file.name.toLowerCase();
      let extracted: { text: string };
      if (name.endsWith(".pdf")) {
        extracted = await extractPdfText(buf);
      } else if (name.endsWith(".txt") || name.endsWith(".md")) {
        extracted = extractText(buf.toString("utf-8"));
      } else {
        return badRequest(
          `unsupported file type for "${file.name}". v1 supports PDF + .txt/.md; PPTX/DOCX are stubbed.`,
        );
      }
      pack.push({ tag, filename: file.name, text: extracted.text });
    } catch (e) {
      return badRequest(
        `failed to extract "${file.name}": ${(e as Error).message}`,
      );
    }
  }

  if (pack.length === 0) {
    return badRequest("upload at least one file");
  }

  try {
    const result = await generateSheet({
      pack,
      density,
      examType,
      priority,
      courseContext: { code: courseCode, professor },
    });
    return Response.json({
      content: result.content,
      meta: result.meta,
      warnings: result.warnings,
      pack: pack.map((f) => ({ filename: f.filename, tag: f.tag, chars: f.text.length })),
    });
  } catch (e) {
    if (e instanceof EngineError) {
      return new Response(e.message, {
        status: 422,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    console.error("[/api/generate] error:", e);
    return new Response(
      e instanceof Error ? e.message : String(e),
      { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }
}

function badRequest(msg: string) {
  return new Response(msg, {
    status: 400,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
