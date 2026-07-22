import Link from "next/link";
import { Wordmark } from "./Wordmark";
import { LinkButton } from "./Button";

/**
 * MarketingNav — sticky public nav: wordmark left; Pricing / How it
 * works / Sign in + a primary CTA right. The CTA says "Make a sheet"
 * (NOT "Make a cheat sheet" — the design handoff's app-nav copy leaked
 * marketing language into the product; we keep "cheat sheet" strictly
 * to marketing body copy, per the positioning rule).
 */
export function MarketingNav() {
  return (
    <header className="sticky top-0 z-[var(--z-sticky)] border-b border-[var(--ink-150)] bg-[color-mix(in_srgb,var(--paper)_85%,transparent)] backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center px-6">
        <Wordmark />
        <nav className="ml-auto flex items-center gap-1 sm:gap-2">
          <Link
            href="/pricing"
            className="rounded-[var(--r-sm)] px-3 py-2 text-[14px] text-[var(--ink-600)] transition-colors hover:text-[var(--ink-900)]"
          >
            Pricing
          </Link>
          <Link
            href="/faq"
            className="hidden rounded-[var(--r-sm)] px-3 py-2 text-[14px] text-[var(--ink-600)] transition-colors hover:text-[var(--ink-900)] sm:inline-block"
          >
            How it works
          </Link>
          <Link
            href="/auth"
            className="rounded-[var(--r-sm)] px-3 py-2 text-[14px] text-[var(--ink-600)] transition-colors hover:text-[var(--ink-900)]"
          >
            Sign in
          </Link>
          <LinkButton href="/generate" className="ml-1">
            Make a sheet
          </LinkButton>
        </nav>
      </div>
    </header>
  );
}
