/**
 * /api/audio/analyze — read the upload, propose the topic split, spend nothing (#6).
 *
 * This is the whole safety model of Clutch Audio. A bad split is the most expensive failure in the
 * product: it spends an episode's credits on something that was never a topic. So the split is
 * shown to the student FIRST, with the merges explained, and they fix it before a single credit
 * moves (FR-6). Nothing here debits anything, and no episode is queued.
 *
 * It does cost real money — the vision ingest reads every slide's diagrams. Two things keep that
 * honest: the ingest cache is keyed on the file bytes and the same options the sheet uses, so a
 * student who already made a sheet from this pack pays nothing to read it again; and a per-day cap
 * stops the endpoint being a free vision API.
 *
 * Returns the series id, so /api/audio/generate can be handed a subset of the topics later.
 */
import { type NextRequest } from "next/server";
import { ingestDocument } from "@/parse/ingest";
import { cacheKey, readCache, writeCache } from "@/parse/ingest-cache";
import { supabaseServer } from "@/lib/supabase/server";
import { capacityResponse, isProviderCapacityError } from "@/lib/provider-outage";
import { creditsFor, splitTopics, type SourceFile } from "@/engine/topic-split";
import { offerableTopics } from "@/lib/audio-selection";
import type { FileTag } from "@/engine/prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** A nine-deck pack takes ~90 s to read. Same ceiling as /api/generate. */
export const maxDuration = 300;

const VALID_TAGS = new Set<FileTag>([
  "slides", "review", "past_exam", "homework", "notes", "formula_sheet",
]);
/** Same cap as sheets.pack_text is written at, and inside podcast_series.pack_text's 450k check. */
const MAX_PACK_CHARS = 400_000;
/**
 * How many packs one student may have read per day. Analyzing is free to them but not to us, and
 * without a cap this endpoint is an unmetered vision API. Ten is more courses than anyone revises.
 */
const SERIES_PER_DAY = 10;
const MAX_TITLE = 300;

export async function POST(req: NextRequest) {
  // A series belongs to someone: it stores their pack text and is billed against them later.
  // So unlike /api/generate, this needs a signed-in student in every environment.
  const supabase = await supabaseServer().catch(() => null);
  if (!supabase) return bad("Sign in to make episodes from your notes.", 401);
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user;
  if (!user) return bad("Sign in to make episodes from your notes.", 401);

  let form: FormData;
  try {
    form = await req.formData();
  } catch (e) {
    return bad(`could not parse multipart body: ${(e as Error).message}`);
  }

  const courseCode = form.get("courseCode")?.toString().trim() || undefined;
  const rawTitle = form.get("title")?.toString().trim() || "";

  const uploads: { file: File; tag: FileTag }[] = [];
  let i = 0;
  while (form.has(`file_${i}`)) {
    const file = form.get(`file_${i}`);
    const tag = form.get(`tag_${i}`)?.toString() as FileTag;
    i++;
    if (!(file instanceof File)) continue;
    if (!VALID_TAGS.has(tag)) return bad(`bad tag for file ${file.name}: ${tag}`);
    if (!/\.(pdf|txt|md|pptx)$/.test(file.name.toLowerCase())) {
      return bad(`unsupported file type for "${file.name}". Supported: PDF, PPTX, .txt, .md.`);
    }
    uploads.push({ file, tag });
  }
  if (!uploads.length) return bad("upload at least one file");

  // The cap is read before the expensive work, not after.
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const { count, error: countErr } = await supabase
    .from("podcast_series")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", dayAgo);
  if (countErr) {
    // Fail closed on the paid path: an unreadable ledger must not mean unlimited vision calls.
    console.error(`[/api/audio/analyze] cap read failed: ${countErr.message}`);
    return bad("Audio is briefly unavailable. Please try again in a minute.", 503);
  }
  if ((count ?? 0) >= SERIES_PER_DAY) {
    return bad(
      `You've prepared ${SERIES_PER_DAY} uploads for audio today. Try again tomorrow, or make ` +
        `episodes from one you already prepared.`,
      429,
    );
  }

  // Identical options to /api/generate, so the cache is SHARED with sheets: a student who already
  // made a sheet from this pack pays nothing to read it again here.
  const INGEST_OPTS = { vision: true, visionMode: "figures", figures: true } as const;
  let cacheHits = 0;
  const started = Date.now();
  const ingested = await Promise.allSettled(
    uploads.map(async ({ file, tag }) => {
      const buf = Buffer.from(await file.arrayBuffer());
      const key = cacheKey(buf, INGEST_OPTS);
      let r = await readCache(supabase, user.id, key);
      if (r) cacheHits++;
      else {
        r = await ingestDocument(file.name, buf, INGEST_OPTS);
        void writeCache(supabase, user.id, key, file.name, r);
      }
      return { tag, filename: file.name, text: r.text, warnings: r.warnings };
    }),
  );

  const files: SourceFile[] = [];
  const warnings: string[] = [];
  for (const [ix, result] of ingested.entries()) {
    if (result.status === "rejected") {
      const reason = result.reason as Error;
      if (isProviderCapacityError(reason)) return capacityResponse("/api/audio/analyze", reason, "episodes");
      return bad(`failed to read "${uploads[ix].file.name}": ${reason.message}`);
    }
    warnings.push(...result.value.warnings);
    files.push({ filename: result.value.filename, tag: result.value.tag, text: result.value.text });
  }

  const { topics, notes } = splitTopics(files);
  /**
   * Nothing worth teaching from. The worker refuses a thin topic too (#21) — that is the gate that
   * actually protects the credit — but catching it here means the student is told on the page,
   * before they tick anything, instead of after a queued job.
   */
  const { usable, note: thinNote } = offerableTopics(topics);
  if (topics.length && !usable.length) {
    return bad(
      "We couldn't find enough readable text in these files to teach from. That usually means " +
        "they're scans without a text layer. Try the original slides or a PDF you can select text in.",
      422,
    );
  }
  if (thinNote) notes.push(thinNote);
  if (!topics.length) {
    return bad(
      "None of these files look like lecture material. Add slides or notes — a review sheet on " +
        "its own tells us what matters, but there's nothing to teach from.",
      422,
    );
  }

  const packText = files
    .map((f) => `===== ${f.filename} [${f.tag}] =====\n${f.text}`)
    .join("\n\n")
    .slice(0, MAX_PACK_CHARS);
  const title = (rawTitle || courseCode || topics[0].title).slice(0, MAX_TITLE);

  const { data: series, error: insErr } = await supabase
    .from("podcast_series")
    .insert({
      user_id: user.id,
      title,
      course_code: courseCode ?? null,
      ctx: { files: files.map((f) => ({ filename: f.filename, tag: f.tag })), courseCode },
      // Store what was OFFERED, so the split the worker reads is the split the student saw.
      topics: usable,
      pack_text: packText,
    })
    .select("id")
    .single();
  if (insErr || !series) {
    console.error(`[/api/audio/analyze] could not save the series: ${insErr?.message}`);
    return bad("We read your files but couldn't save them. Nothing was charged. Please try again.", 503);
  }

  console.log(
    `[/api/audio/analyze] 200 in ${((Date.now() - started) / 1000).toFixed(0)}s · ` +
      `${files.length} files → ${topics.length} topics · cached-reads=${cacheHits}/${uploads.length} · ` +
      `series=${series.id}`,
  );

  return Response.json({
    seriesId: series.id as string,
    title,
    topics: usable,
    notes,
    // What the whole series would cost if they made every episode. They will choose a subset.
    credits: creditsFor(usable),
    warnings,
  });
}

function bad(msg: string, status = 400) {
  console.warn(`[/api/audio/analyze] ${status} ${msg}`);
  return new Response(msg, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
