import Link from "next/link";
import { Mark } from "./Wordmark";

/**
 * Footer — v2 handoff: a single compact row on ink-900 with a #2c2c33
 * hairline top. Reversed icon + wordmark, five links at 13px, © line.
 * On the home page it sits inside the ink closer so the two merge into
 * one dark block; on paper pages it stands alone.
 */
export function Footer() {
  return (
    <footer className="bg-[var(--band)]">
      <div className="border-t border-[var(--band-line)]">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-5 px-10 py-7 sm:flex-row sm:items-center sm:justify-between">
          <span className="inline-flex items-center gap-[9px]">
            <Mark px={22} onInk />
            <span className="text-[14px] font-semibold text-white">Clutch</span>
          </span>
          <nav className="flex flex-wrap items-center gap-x-7 gap-y-4 text-[13px] text-[var(--on-band-muted)]">
            <Link href="/pricing" className="tap-area transition-colors duration-[160ms] hover:text-[var(--on-band)]">Pricing</Link>
            <Link href="/faq" className="tap-area transition-colors duration-[160ms] hover:text-[var(--on-band)]">How it works</Link>
            <Link href="/auth" className="tap-area transition-colors duration-[160ms] hover:text-[var(--on-band)]">Sign in</Link>
            <Link href="/faq#privacy" className="tap-area transition-colors duration-[160ms] hover:text-[var(--on-band)]">Privacy</Link>
            <Link href="/faq#terms" className="tap-area transition-colors duration-[160ms] hover:text-[var(--on-band)]">Terms</Link>
          </nav>
          <span className="font-mono text-[11px] text-[var(--on-band-muted)]">
            © {new Date().getFullYear()} Clutch
          </span>
        </div>
      </div>
    </footer>
  );
}
