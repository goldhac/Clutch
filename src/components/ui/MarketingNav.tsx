import Link from "next/link";
import { Wordmark } from "./Wordmark";
import { LinkButton } from "./Button";

/**
 * MarketingNav — v2 handoff: sticky, 60px, hairline bottom,
 * rgba(251,251,250,.9) + blur. Wordmark + mono descriptor left;
 * How it works / Pricing / Sign in + ink CTA right.
 */
export function MarketingNav() {
  return (
    <header className="sticky top-0 z-[var(--z-sticky)] border-b border-[var(--ink-150)] bg-[rgba(251,251,250,0.9)] backdrop-blur-[10px]">
      <div className="mx-auto flex h-[60px] max-w-[1180px] items-center px-6 sm:px-10">
        <span className="inline-flex items-center">
          <Wordmark />
          <span className="ml-2.5 hidden border-l border-[var(--ink-200)] pl-2.5 font-mono text-[11px] text-[var(--ink-500)] md:inline">
            exam reference sheets
          </span>
        </span>
        <nav className="ml-auto flex items-center gap-1 sm:gap-4">
          <Link
            href="/faq"
            className="hidden px-2 py-2 text-[14px] text-[var(--ink-600)] transition-colors duration-[160ms] hover:text-[var(--ink-900)] sm:inline-block"
          >
            How it works
          </Link>
          <Link
            href="/pricing"
            className="px-2 py-2 text-[14px] text-[var(--ink-600)] transition-colors duration-[160ms] hover:text-[var(--ink-900)]"
          >
            Pricing
          </Link>
          <Link
            href="/auth"
            className="px-2 py-2 text-[14px] text-[var(--ink-600)] transition-colors duration-[160ms] hover:text-[var(--ink-900)]"
          >
            Sign in
          </Link>
          <LinkButton href="/generate" size="md" className="ml-2">
            Make a sheet
          </LinkButton>
        </nav>
      </div>
    </header>
  );
}
