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
import { proposeEdit } from "@/engine/edit";
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
  const b = body as { content?: unknown; instruction?: unknown; packText?: unknown; files?: unknown };

  const instruction = typeof b.instruction === "string" ? b.instruction.trim() : "";
  if (!instruction) return new Response("instruction required", { status: 400 });
  if (instruction.length > MAX_INSTRUCTION) {
    return new Response(`instruction too long (max ${MAX_INSTRUCTION} chars)`, { status: 400 });
  }

  // Same entitlement as /api/tweak: content edits are a Pro feature (no credits ledger yet).
  if (process.env.NODE_ENV === "production") {
    const supabase = await supabaseServer();
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) return new Response("Sign in required for content edits.", { status: 401 });
    const { data: profile } = await supabase.from("profiles").select("tier").eq("id", userRes.user.id).single();
    if (profile?.tier !== "pro") return new Response("Content edits are a Pro feature. Upgrade to unlock.", { status: 403 });
  }

  const parsed = safeParseSheetContent(b.content);
  if (!parsed.success) {
    return new Response(`content failed the contract: ${parsed.error.issues.map((i) => i.message).join("; ")}`, { status: 400 });
  }
  const packText = typeof b.packText === "string" ? b.packText.slice(0, MAX_PACK_CHARS) : undefined;
  const files = Array.isArray(b.files) ? b.files.filter((f): f is string => typeof f === "string").slice(0, 40) : undefined;

  const started = Date.now();
  try {
    const p = await proposeEdit(parsed.data, instruction, { packText, files });
    console.warn(
      `[/api/edit] 200 in ${((Date.now() - started) / 1000).toFixed(0)}s · ops=${p.ops.length} dropped=${p.dropped.length} · ` +
        `pack=${packText ? packText.length + "c" : "none"} · "${instruction.slice(0, 80)}"`,
    );
    return Response.json({ reply: p.reply, ops: p.ops, dropped: p.dropped, proposed: p.proposed });
  } catch (err) {
    console.error(`[/api/edit] 422 after ${((Date.now() - started) / 1000).toFixed(0)}s · "${instruction.slice(0, 80)}"`, err);
    return new Response(
      "I couldn't turn that into a safe edit. Nothing on your sheet changed. Try saying it another way.",
      { status: 422, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }
}
