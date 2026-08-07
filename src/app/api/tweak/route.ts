/**
 * /api/tweak — apply a student's free-text edit to their sheet (Pro tier).
 *
 * POST { content, instruction } → { content } (the edited, re-validated
 * pool). The tweak is engine-applied but contract-enforced: whatever the
 * model does, the result must still pass the same Zod trust rules
 * (citations, answers, topic tags), so an edit can't ship a degraded
 * sheet. EngineError → 422 with the validator's message.
 *
 * Tier gating is enforced in the UI today (Stripe isn't wired); when
 * auth lands, this route checks the user's entitlement server-side.
 */
import { type NextRequest } from "next/server";
import { safeParseSheetContent } from "@/contract/sheet-content";
import { tweakSheet, EngineError } from "@/engine/rank";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_INSTRUCTION = 500;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("body must be JSON", { status: 400 });
  }
  const b = body as { content?: unknown; instruction?: unknown };

  const instruction = typeof b.instruction === "string" ? b.instruction.trim() : "";
  if (!instruction) {
    return new Response("instruction required", { status: 400 });
  }
  if (instruction.length > MAX_INSTRUCTION) {
    return new Response(`instruction too long (max ${MAX_INSTRUCTION} chars)`, { status: 400 });
  }

  const parsed = safeParseSheetContent(b.content);
  if (!parsed.success) {
    return new Response(
      `content failed the contract: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
      { status: 400 },
    );
  }

  try {
    const result = await tweakSheet(parsed.data, instruction);
    return Response.json({ content: result.content, meta: result.meta });
  } catch (err) {
    if (err instanceof EngineError) {
      return new Response(err.message, {
        status: 422,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    console.error("[/api/tweak] unexpected error:", err);
    return new Response(err instanceof Error ? err.message : String(err), { status: 500 });
  }
}
