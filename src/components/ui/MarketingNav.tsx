"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Wordmark } from "./Wordmark";
import { LinkButton } from "./Button";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * MarketingNav — v2 handoff: sticky, 60px, hairline bottom,
 * rgba(251,251,250,.9) + blur. Wordmark + mono descriptor left;
 * How it works / Pricing / Sign in + ink CTA right.
 */
export function MarketingNav() {
  /**
   * Is anyone signed in? Reported twice as "the Clutch logo logs me out" — it never did; this nav
   * simply always said "Sign in", so a signed-in student who reached "/" from a bookmark, a shared
   * link or the 404 page could not tell they were still signed in.
   *
   * `undefined` while unknown, so the nav does not flash the wrong state on first paint: the
   * signed-out pair is what most visitors want, but showing it to someone who IS signed in is the
   * exact bug, so neither side renders until the session has answered.
   */
  const [signedIn, setSignedIn] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    supabaseBrowser()
      .auth.getUser()
      .then(({ data }) => { if (alive) setSignedIn(!!data.user); })
      // A failed session read must not break the marketing page; fall back to signed-out.
      .catch(() => { if (alive) setSignedIn(false); });
    return () => { alive = false; };
  }, []);

  return (
    <header className="sticky top-0 z-[var(--z-sticky)] border-b border-[var(--ink-150)] bg-[var(--paper-glass)] backdrop-blur-[10px]">
      <div className="mx-auto flex h-[60px] max-w-[1180px] items-center px-6 sm:px-10">
        <span className="inline-flex items-center">
          <Wordmark />
          <span className="ml-2.5 hidden border-l border-[var(--ink-200)] pl-2.5 font-mono text-[11px] text-[var(--ink-500)] md:inline">
            exam reference sheets
          </span>
        </span>
        <nav className="ml-auto flex shrink-0 items-center gap-1 sm:gap-4">
          <Link
            href="/faq"
            className="hidden tap whitespace-nowrap px-2 py-2 text-[14px] text-[var(--ink-600)] transition-colors duration-[160ms] hover:text-[var(--ink-900)] md:inline-block"
          >
            How it works
          </Link>
          <Link
            href="/pricing"
            className="hidden tap whitespace-nowrap px-2 py-2 text-[14px] text-[var(--ink-600)] transition-colors duration-[160ms] hover:text-[var(--ink-900)] sm:inline-block"
          >
            Pricing
          </Link>
          {signedIn === undefined ? (
            // Reserve the room so the nav does not jump when the answer arrives.
            <span aria-hidden className="ml-2 h-11 w-[132px]" />
          ) : signedIn ? (
            <>
              <Link
                href="/library"
                className="tap inline-flex items-center whitespace-nowrap px-2 py-2 text-[14px] text-[var(--ink-600)] transition-colors duration-[160ms] hover:text-[var(--ink-900)]"
              >
                My Sheets
              </Link>
              <LinkButton href="/generate" size="md" className="ml-2 whitespace-nowrap">
                Make a sheet
              </LinkButton>
            </>
          ) : (
            <>
              <Link
                href="/auth"
                className="tap inline-flex items-center whitespace-nowrap px-2 py-2 text-[14px] text-[var(--ink-600)] transition-colors duration-[160ms] hover:text-[var(--ink-900)]"
              >
                Sign in
              </Link>
              <LinkButton href="/generate" size="md" className="ml-2 whitespace-nowrap">
                Make a sheet
              </LinkButton>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
