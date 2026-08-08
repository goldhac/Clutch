"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Callout, TextInput, Wordmark } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * /auth — passwordless sign in via Supabase magic link. The emailed link
 * lands on /auth/callback which exchanges the code for a session cookie
 * and forwards to ?next (default /library). No password anywhere.
 * (Google OAuth: later — needs Google console setup.)
 */
export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  async function sendLink() {
    if (!email) return;
    setSending(true);
    setAuthError(null);
    try {
      const next = new URLSearchParams(window.location.search).get("next") ?? "/library";
      const { error } = await supabaseBrowser().auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (error) throw error;
      setSent(true);
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--paper)] px-6">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <Wordmark href="/" />
        </div>

        {!sent ? (
          <>
            <h1 className="mt-8 text-center font-serif text-[30px] tracking-[-0.01em] text-[var(--ink-900)]">
              Sign in to Clutch
            </h1>
            <p className="mt-2 text-center text-[14px] text-[var(--ink-500)]">
              No password. We&apos;ll email you a link.
            </p>


            <form
              onSubmit={(e) => {
                e.preventDefault();
                void sendLink();
              }}
              className="space-y-3"
            >
              <TextInput
                type="email"
                required
                placeholder="you@university.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button type="submit" size="lg" className="w-full" loading={sending}>
                {sending ? "Sending…" : "Email me a magic link"}
              </Button>
            </form>

            {authError && (
              <div className="mt-3">
                <Callout variant="danger">{authError}</Callout>
              </div>
            )}

            <p className="mt-5 text-center text-[13px] text-[var(--ink-500)]">
              New here? The link creates your account.
            </p>
          </>
        ) : (
          <div className="mt-10 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--conf-high-bg)] text-[var(--conf-high)]">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 6h16v12H4zM4 7l8 6 8-6" />
              </svg>
            </span>
            <h1 className="mt-5 font-serif text-[28px] text-[var(--ink-900)]">Check your email</h1>
            <p className="mt-2 text-[14px] text-[var(--ink-600)]">
              We sent a magic link to{" "}
              <span className="font-mono text-[13px] text-[var(--ink-900)]">{email}</span>.
            </p>
            <p className="mt-1 text-[13px] text-[var(--ink-400)]">The link works for 15 minutes.</p>
            <div className="mt-6 flex justify-center gap-4 text-[13px]">
              <button type="button" onClick={() => void sendLink()} className="text-[var(--signal-600)] hover:underline">
                Resend
              </button>
              <button type="button" onClick={() => setSent(false)} className="text-[var(--ink-500)] hover:underline">
                Use a different email
              </button>
            </div>
          </div>
        )}

        <p className="mt-10 text-center text-[12px] text-[var(--ink-400)]">
          <Link href="/" className="hover:underline">
            ← Back home
          </Link>
        </p>
      </div>
    </div>
  );
}

