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
    const settle = (v: boolean) => {
      if (!alive) return;
      alive = false;
      setSignedIn(v);
    };
    /*
     * The dangerous case is a HUNG request, not a failed one.
     *
     * A rejected read already fell back to signed-out. But on 2026-10-12 the Supabase project was
     * paused, and the call neither resolved nor rejected — so `signedIn` stayed undefined, the nav
     * kept rendering its reserved spacer, and the landing page showed no "Sign in" and no CTA at
     * all. Every page still returned 200, so it looked healthy.
     *
     * Signed-out is the safe default: a signed-out visitor sees the right thing, and a signed-in
     * one who taps "Sign in" is bounced straight back to their library. First answer wins, so a
     * slow reply cannot swap the nav under someone mid-click.
     */
    const timer = setTimeout(() => settle(false), 2500);
    supabaseBrowser()
      .auth.getUser()
      .then(({ data }) => settle(!!data.user))
      .catch(() => settle(false))
      .finally(() => clearTimeout(timer));
    return () => {
      alive = false;
      clearTimeout(timer);
    };
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
