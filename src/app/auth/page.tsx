"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * /auth — v2 handoff split layout. Left: passwordless form on paper
 * (Google OAuth + magic link, 46px controls, regex-gated button, salmon
 * invalid callout). Right: ink "why an account" panel over the corridor
 * photograph. Collapses to one column under ~720px.
 *
 * Supabase logic unchanged: signInWithOtp / signInWithOAuth, landing
 * target carried in the clutch_auth_next cookie (query params break the
 * exact-match redirect allowlist).
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [resent, setResent] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const resentTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resentTimer.current) clearTimeout(resentTimer.current);
    };
  }, []);

  const ok = EMAIL_RE.test(email.trim());

  function stashNext() {
    const next = new URLSearchParams(window.location.search).get("next") ?? "/library";
    const safe = next.startsWith("/") && !next.startsWith("//") ? next : "/library";
    document.cookie = `clutch_auth_next=${encodeURIComponent(safe)}; Max-Age=1800; Path=/; SameSite=Lax`;
  }

  async function sendLink(isResend = false) {
    if (sending) return;
    if (!ok) {
      setInvalid(true);
      return;
    }
    setSending(true);
    setInvalid(false);
    setAuthError(null);
    try {
      stashNext();
      const { error } = await supabaseBrowser().auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      setSent(true);
      if (isResend) {
        setResent(true);
        resentTimer.current = window.setTimeout(() => setResent(false), 3000);
      }
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  async function signInWithGoogle() {
    setAuthError(null);
    try {
      stashNext();
      const { error } = await supabaseBrowser().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="grid min-h-screen grid-cols-[repeat(auto-fit,minmax(360px,1fr))]">
      {/* ── left: the form ─────────────────────────────────────────── */}
      <div className="flex flex-col items-center justify-center bg-[var(--paper)] px-10 py-14">
        <div className="w-full max-w-[368px]">
          <Wordmark href="/" />

          {!sent ? (
            <>
              <h1 className="mt-9 font-serif text-[40px] leading-[1.02] tracking-[-0.03em] text-[var(--ink-900)]">
                Sign in to Clutch
              </h1>
              <p className="mt-3 text-[15px] leading-[1.6] text-[var(--ink-600)]">
                No password. We&apos;ll email you a link.
              </p>

              <button
                type="button"
                onClick={() => void signInWithGoogle()}
                className="mt-8 flex h-[46px] w-full items-center justify-center gap-2.5 rounded-[9px] border border-[var(--border-input)] bg-white text-[14px] font-medium text-[var(--ink-800)] transition-[background-color,transform] duration-[160ms] ease-[var(--ease-out)] hover:bg-[var(--ink-50)] active:scale-[0.99]"
              >
                <GoogleG /> Continue with Google
              </button>

              <div className="my-[22px] flex items-center gap-3">
                <span aria-hidden className="h-px flex-1 bg-[var(--ink-150)]" />
                <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--ink-500)]">
                  or
                </span>
                <span aria-hidden className="h-px flex-1 bg-[var(--ink-150)]" />
              </div>

              <form
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendLink();
                }}
              >
                <input
                  type="email"
                  placeholder="you@university.edu"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setInvalid(false);
                  }}
                  className="h-[46px] w-full rounded-[9px] border border-[var(--border-input)] bg-white px-3.5 text-[14.5px] text-[var(--ink-900)] outline-none transition-colors duration-[160ms] placeholder:text-[var(--ink-400)] focus:border-[var(--signal-500)] focus:ring-2 focus:ring-[var(--signal-100)]"
                />
                <button
                  type="submit"
                  className={
                    "mt-2.5 flex h-[46px] w-full items-center justify-center rounded-[9px] text-[14.5px] font-semibold transition-[background-color,color,opacity,transform] duration-[160ms] ease-[var(--ease-out)] active:scale-[0.99] " +
                    (ok
                      ? "bg-[var(--ink-900)] text-white hover:bg-[var(--ink-800)]"
                      : "bg-[var(--ink-150)] text-[var(--ink-500)]")
                  }
                  style={{ opacity: sending ? 0.75 : 1 }}
                >
                  {sending ? "Sending…" : "Email me a magic link"}
                </button>

                {invalid && (
                  <div className="mt-3 rounded-[9px] border border-[var(--salmon-line)] bg-[var(--salmon)] px-3.5 py-[11px] text-[13px] leading-[1.55] text-[var(--ink-800)]">
                    That address does not look complete — check for a typo before we send the link.
                  </div>
                )}
                {authError && (
                  <div role="alert" className="mt-3 rounded-[9px] border border-[var(--conf-low)]/25 bg-[var(--conf-low-bg)] px-3.5 py-[11px] text-[13px] leading-[1.55] text-[var(--conf-low-deep)]">
                    {authError}
                  </div>
                )}
              </form>

              <p className="mt-5 text-[13.5px] text-[var(--ink-600)]">
                New here? The link creates your account.
              </p>
            </>
          ) : (
            <>
              <span className="mt-9 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[var(--conf-high-bg)] text-[var(--conf-high)]">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 6h16v12H4zM4 7l8 6 8-6" />
                </svg>
              </span>
              <h1 className="mt-[22px] font-serif text-[38px] leading-[1.04] tracking-[-0.03em] text-[var(--ink-900)]">
                Check your email
              </h1>
              <p className="mt-3 text-[15px] leading-[1.6] text-[var(--ink-600)]">
                We sent a magic link to{" "}
                <span className="font-mono text-[13.5px] text-[var(--ink-900)]">{email.trim()}</span>.
              </p>
              <p className="mt-1.5 font-mono text-[12px] text-[var(--ink-500)]">
                {resent ? "link resent · works for 15 minutes" : "the link works for 15 minutes"}
              </p>
              <div className="mt-[26px] flex items-center gap-[18px]">
                <button
                  type="button"
                  onClick={() => void sendLink(true)}
                  className="text-[13.5px] font-semibold text-[var(--signal-600)] hover:text-[var(--signal-500)] hover:underline"
                >
                  Resend
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSent(false);
                    setResent(false);
                  }}
                  className="text-[13.5px] text-[var(--ink-600)] hover:text-[var(--ink-900)]"
                >
                  Use a different email
                </button>
              </div>
            </>
          )}

          <p className="mt-11 text-[12.5px] text-[var(--ink-500)]">
            <Link href="/" className="transition-colors duration-[160ms] hover:text-[var(--ink-900)]">
              ← Back home
            </Link>
          </p>
        </div>
      </div>

      {/* ── right: why an account (ink, corridor photo) ───────────── */}
      <div className="relative hidden flex-col justify-center overflow-hidden bg-[var(--ink-900)] px-11 py-14 min-[720px]:flex">
        <div
          aria-hidden
          className="absolute inset-0 opacity-50"
          style={{
            maskImage: "linear-gradient(180deg, transparent 0%, rgba(0,0,0,.7) 46%, #000 100%)",
            WebkitMaskImage: "linear-gradient(180deg, transparent 0%, rgba(0,0,0,.7) 46%, #000 100%)",
          }}
        >
          <img src="/photos/corridor.jpg" alt="" className="h-full w-full object-cover" />
        </div>
        <div className="relative max-w-[420px]">
          <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-400)]">
            Why an account
          </div>
          <h2
            className="mt-4 max-w-[18ch] font-serif text-[44px] leading-[1.02] tracking-[-0.03em] text-white"
            style={{ textWrap: "balance" }}
          >
            Your sheets follow you.
          </h2>
          <div className="mt-[30px] border-t border-[var(--ink-700)]">
            <div className="border-b border-[var(--ink-700)] py-[15px] text-[14.5px] leading-[1.5] text-[var(--ink-150)]">
              Every saved sheet, on any device
            </div>
            <div className="border-b border-[var(--ink-700)] py-[15px] text-[14.5px] leading-[1.5] text-[var(--ink-150)]">
              The pool and density each was built from
            </div>
            <div className="py-[15px] text-[14.5px] leading-[1.5] text-[var(--ink-150)]">
              Credits and unlocks you already paid for
            </div>
          </div>
          <div className="mt-[26px] font-mono text-[11px] text-[var(--ink-400)]">
            the preview needs no account · sign in only to keep things
          </div>
        </div>
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
