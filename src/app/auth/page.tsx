"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, TextInput, Wordmark } from "@/components/ui";

/**
 * /auth — sign in / sign up. UI shell only; Supabase magic-link + Google
 * OAuth wire up in a later milestone. "Email me a magic link" flips to a
 * "check your email" confirmation state. No password anywhere.
 */
export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--paper)] px-6">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <Wordmark href="/" />
        </div>

        {!sent ? (
          <>
            <h1 className="mt-8 text-center font-serif text-[30px] tracking-[-0.01em] text-[var(--ink-900)]">
              Sign in to CramSheet
            </h1>
            <p className="mt-2 text-center text-[14px] text-[var(--ink-500)]">
              No password. We&apos;ll email you a link.
            </p>

            {/* Google */}
            <button
              type="button"
              className="mt-8 flex w-full items-center justify-center gap-2.5 rounded-[var(--r-md)] border border-[var(--ink-200)] bg-white py-2.5 text-[14px] font-medium text-[var(--ink-800)] shadow-[var(--sh-xs)] transition-colors hover:bg-[var(--ink-50)]"
            >
              <GoogleG /> Continue with Google
            </button>

            <div className="my-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-[var(--ink-150)]" />
              <span className="font-mono text-[11px] uppercase text-[var(--ink-400)]">or</span>
              <span className="h-px flex-1 bg-[var(--ink-150)]" />
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (email) setSent(true);
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
              <Button type="submit" size="lg" className="w-full">
                Email me a magic link
              </Button>
            </form>

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
              <button type="button" onClick={() => setSent(true)} className="text-[var(--signal-600)] hover:underline">
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

function GoogleG() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z" />
    </svg>
  );
}
