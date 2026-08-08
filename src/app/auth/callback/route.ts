/**
 * /auth/callback — the magic-link landing. Exchanges the one-time code
 * for a session cookie, then forwards to `next` (default /library).
 */
import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/library";
  // Only allow same-origin relative redirects.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/library";

  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(safeNext, url.origin));
    }
  }
  return NextResponse.redirect(new URL("/auth?error=link", url.origin));
}
