/**
 * /api/edit — "Edit with Clutch" (issue #14). A student's instruction becomes a PROPOSAL:
 * a validated patch plus the sheet it would produce. Nothing is applied here — the client
 * shows the preview and the student accepts or rejects.
 *
 * Only content edits reach this route. Display changes ("hide the traps", "chapter order")
 * are routed client-side and never cost a model call.
 */
import { type NextRequest } from "next/server";
import { safeParseSheetContent } from "@/contract/sheet-content";
import { deepenPool } from "@/engine/deepen";
import { proposeEdit } from "@/engine/edit";
import { judgeEditLimit, judgeInMemory, type LimitVerdict } from "@/lib/edit-limit";
import { capacityResponse, isProviderCapacityError } from "@/lib/provider-outage";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_INSTRUCTION = 500;
/** ~100k tokens of the student's own text is plenty to ground an edit. */
const MAX_PACK_CHARS = 400_000;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("body must be JSON", { status: 400 });
  }
  const b = body as { content?: unknown; instruction?: unknown; packText?: unknown; files?: unknown; mode?: unknown; examFormat?: unknown };

  // mode "fill": top the pool up from the pack so both pages fill (same gate, same limit, same preview).
  const fill = b.mode === "fill";
  const instruction = fill ? "fill the back page" : typeof b.instruction === "string" ? b.instruction.trim() : "";
  if (!instruction) return new Response("instruction required", { status: 400 });
  if (instruction.length > MAX_INSTRUCTION) {
    return new Response(`instruction too long (max ${MAX_INSTRUCTION} chars)`, { status: 400 });
  }

  // Same entitlement as /api/tweak: content edits are a Pro feature (no credits ledger yet).
  // Then the rate limit, counted per user in public.edit_events (rows a client can add but never
  // delete, so the limit cannot be reset from the browser).
  let record: (outcome: "proposed" | "failed" | "limited", ops: number) => Promise<void> = async () => {};
  let verdict: LimitVerdict;
  if (process.env.NODE_ENV === "production") {
    const supabase = await supabaseServer();
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) return new Response("Sign in required for content edits.", { status: 401 });
    const uid = userRes.user.id;
    const { data: profile } = await supabase.from("profiles").select("tier").eq("id", uid).single();
    if (profile?.tier !== "pro") return new Response("Content edits are a Pro feature. Upgrade to unlock.", { status: 403 });

    record = async (outcome, ops) => {
      const { error } = await supabase.from("edit_events").insert({ user_id: uid, instruction, outcome, ops });
      if (error) console.error(`[/api/edit] could not record the event: ${error.message}`);
    };
    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
    const { data: recent, error: countErr } = await supabase
      .from("edit_events")
      .select("created_at")
      .eq("user_id", uid)
      .neq("outcome", "limited")
      .gte("created_at", dayAgo)
      .order("created_at", { ascending: false })
      .limit(200);
    if (countErr) {
      // Fail closed on the expensive path: an unreadable ledger must not mean unlimited model calls.
      console.error(`[/api/edit] rate-limit read failed: ${countErr.message}`);
      return new Response("Edits are briefly unavailable. Nothing on your sheet changed. Please try again in a minute.", { status: 503 });
    }
    const times = (recent ?? []).map((r) => new Date(r.created_at as string).getTime());
    verdict = judgeEditLimit(times.filter((t) => Date.now() - t < 3_600_000), times.length);
  } else {
    verdict = judgeInMemory(req.headers.get("x-forwarded-for") ?? "local");
  }
  if (!verdict.ok) {
    await record("limited", 0);
    console.warn(`[/api/edit] 429 · "${instruction.slice(0, 80)}"`);
    return new Response(verdict.message, {
      status: 429,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": String(verdict.retryAfterS ?? 3600) },
    });
  }

  const parsed = safeParseSheetContent(b.content);
  if (!parsed.success) {
    return new Response(`content failed the contract: ${parsed.error.issues.map((i) => i.message).join("; ")}`, { status: 400 });
  }
  const packText = typeof b.packText === "string" ? b.packText.slice(0, MAX_PACK_CHARS) : undefined;
  const files = Array.isArray(b.files) ? b.files.filter((f): f is string => typeof f === "string").slice(0, 40) : undefined;

  const started = Date.now();
  try {
    if (fill) {
      const deep = await deepenPool(parsed.data, { packText, files, examFormat: typeof b.examFormat === "string" ? (b.examFormat as never) : undefined });
      console.warn(`[/api/edit] fill · ${deep.before}→${deep.after} lines · dropped ${deep.dropped.length} · ${deep.seconds.toFixed(0)}s${deep.cappedBySource ? ` · capped at ${deep.sourceCap}` : ""}`);
      await record("proposed", deep.ops.length);
      const reply = !packText
        ? "This sheet was saved before Clutch kept your files' text, so I have nothing to draw new lines from. Generate it again to fill the back."
        : deep.ops.length
          ? `I found ${deep.ops.length} more lines in your files. Every one cites where it came from.`
          : deep.cappedBySource
            ? "Your files are short, and the sheet already says about as much as they do. Add more material to fill the back."
            : "The sheet is already full.";
      return Response.json({ reply, ops: deep.ops, dropped: [], proposed: deep.proposed });
    }
    const p = await proposeEdit(parsed.data, instruction, { packText, files });
    console.warn(
      `[/api/edit] 200 in ${((Date.now() - started) / 1000).toFixed(0)}s · ops=${p.ops.length} dropped=${p.dropped.length} · ` +
        `pack=${packText ? packText.length + "c" : "none"} · "${instruction.slice(0, 80)}"`,
    );
    await record("proposed", p.ops.length);
    return Response.json({ reply: p.reply, ops: p.ops, dropped: p.dropped, proposed: p.proposed });
  } catch (err) {
    if (isProviderCapacityError(err)) return capacityResponse("/api/edit", err); // not the student's failure: not counted
    await record("failed", 0); // a failed proposal still cost a model call
    console.error(`[/api/edit] 422 after ${((Date.now() - started) / 1000).toFixed(0)}s · "${instruction.slice(0, 80)}"`, err);
    return new Response(
      "I couldn't turn that into a safe edit. Nothing on your sheet changed. Try saying it another way.",
      { status: 422, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }
}
