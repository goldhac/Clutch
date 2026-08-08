/**
 * Session-refresh middleware (the @supabase/ssr pattern): keeps auth
 * cookies fresh so server-side entitlement checks see a live session.
 * Scoped to the routes that actually read auth — everything else skips.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Touch the session so expired access tokens refresh via the cookie.
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/library/:path*", "/results/:path*", "/auth/:path*", "/api/tweak", "/api/sheets/:path*"],
};
