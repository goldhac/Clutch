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
    <footer className="bg-[var(--ink-900)]">
      <div className="border-t border-[var(--ink-700)]">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-5 px-10 py-7 sm:flex-row sm:items-center sm:justify-between">
          <span className="inline-flex items-center gap-[9px]">
            <Mark px={22} onInk />
            <span className="text-[14px] font-semibold text-white">Clutch</span>
          </span>
          <nav className="flex flex-wrap gap-x-7 gap-y-2 text-[13px] text-[var(--ink-400)]">
            <Link href="/pricing" className="transition-colors duration-[160ms] hover:text-white">Pricing</Link>
            <Link href="/faq" className="transition-colors duration-[160ms] hover:text-white">How it works</Link>
            <Link href="/auth" className="transition-colors duration-[160ms] hover:text-white">Sign in</Link>
            <Link href="/faq#privacy" className="transition-colors duration-[160ms] hover:text-white">Privacy</Link>
            <Link href="/faq#terms" className="transition-colors duration-[160ms] hover:text-white">Terms</Link>
          </nav>
          <span className="font-mono text-[11px] text-[var(--ink-500)]">
            © {new Date().getFullYear()} Clutch
          </span>
        </div>
      </div>
    </footer>
  );
}
