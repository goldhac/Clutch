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
          <Link
            href="/auth"
            className="tap inline-flex items-center whitespace-nowrap px-2 py-2 text-[14px] text-[var(--ink-600)] transition-colors duration-[160ms] hover:text-[var(--ink-900)]"
          >
            Sign in
          </Link>
          <LinkButton href="/generate" size="md" className="ml-2 whitespace-nowrap">
            Make a sheet
          </LinkButton>
        </nav>
      </div>
    </header>
  );
}
