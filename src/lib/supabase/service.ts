/**
 * service.ts — the Supabase client the WORKER uses.
 *
 * Every other client in this app acts as a signed-in student, and RLS does the rest. A background
 * job has no session: nobody is holding the browser open while an episode records for four
 * minutes. So the worker holds a service-role key and writes rows on a student's behalf.
 *
 * That key bypasses RLS completely, which is exactly why it is confined to this file and to code
 * that runs on the worker. Two rules follow, and they are not negotiable:
 *
 *   1. **Never import this from anything under `src/app`.** A route that runs with it is a route
 *      that can read every student's material.
 *   2. **Every query it makes still filters by `user_id` explicitly.** RLS is not there to catch
 *      the worker's mistakes any more, so the worker has to be right on its own.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function serviceClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "The worker needs SUPABASE_SERVICE_ROLE_KEY (and NEXT_PUBLIC_SUPABASE_URL). " +
        "Supabase dashboard → Project Settings → API → service_role. Add it to .env.local and to " +
        "the Railway service. It bypasses RLS: it belongs nowhere near the browser.",
    );
  }
  cached = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return cached;
}

/** True when the worker could run here. Lets the CLI degrade to files instead of failing. */
export const hasServiceKey = (): boolean =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
