/**
 * /api/dev-pool?g=<name> — serve a generated pool from samples/generated
 * so /results can self-seed for demos and QA (see results/page.tsx).
 * Name is sanitized to [a-z0-9-]; unknown names 404. Dev/QA convenience —
 * real pools arrive via /api/generate.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { type NextRequest } from "next/server";
import { safeParseSheetContent } from "@/contract/sheet-content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const g = new URL(req.url).searchParams.get("g") ?? "";
  if (!/^[a-z0-9-]+$/i.test(g)) {
    return new Response("invalid pool name", { status: 400 });
  }
  try {
    const file = path.join(process.cwd(), "samples", "generated", `${g}.json`);
    const parsed = safeParseSheetContent(JSON.parse(await readFile(file, "utf-8")));
    if (!parsed.success) {
      return new Response("pool on disk fails the contract", { status: 422 });
    }
    return Response.json({ content: parsed.data });
  } catch {
    return new Response("pool not found", { status: 404 });
  }
}
