/**
 * Browser Supabase client — auth (magic link) + user-scoped reads/writes.
 * RLS is the security boundary: this client only ever holds the user's
 * own JWT (publishable key), never the service role.
 */
import { createBrowserClient } from "@supabase/ssr";

export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
