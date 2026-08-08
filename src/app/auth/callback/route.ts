/**
 * /auth/callback — the magic-link landing. Exchanges the one-time code
 * for a session cookie, then forwards to `next` (default /library).
 */
import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  // Behind Railway's TLS proxy req.url's origin is the INTERNAL host
  // (localhost:8080) — redirecting relative to it sent users to a dead
  // localhost URL after sign-in (same proxy-origin gotcha as /api/pdf).
  // Build the public origin from the forwarded headers.
  const fwdHost = req.headers.get("x-forwarded-host") ?? url.host;
  const fwdProto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const publicOrigin = `${fwdProto}://${fwdHost}`;
  const code = url.searchParams.get("code");
  // Landing target comes from the short-lived cookie set at sign-in time
  // (NOT a query param — that broke Supabase's exact-match redirect
  // allowlist and bounced links to the Site URL).
  const cookieNext = req.cookies.get("clutch_auth_next")?.value;
  const next = cookieNext ? decodeURIComponent(cookieNext) : "/library";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/library";

  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const res = NextResponse.redirect(new URL(safeNext, publicOrigin));
      res.cookies.delete("clutch_auth_next");
      return res;
    }
  }
  return NextResponse.redirect(new URL("/auth?error=link", publicOrigin));
}
