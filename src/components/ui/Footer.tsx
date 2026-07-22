import Link from "next/link";
import { Mark } from "./Wordmark";

/**
 * Footer — the dark marketing footer. Ink-900 ground, paper text,
 * a compact link set, and the one-line promise as a closer.
 */
export function Footer() {
  return (
    <footer className="bg-[var(--ink-900)] text-[var(--ink-300)]">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="flex flex-col gap-10 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <span className="inline-flex items-center gap-2">
              <Mark px={26} />
              <span className="text-[15px] font-semibold text-white">CramSheet</span>
            </span>
            <p className="mt-3 text-[14px] leading-[1.6] text-[var(--ink-400)]">
              The one-page cheat sheet that knows what&apos;s on the exam. Every claim scored and
              sourced.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-14 gap-y-2 text-[14px] sm:grid-cols-3">
            <FooterCol title="Product" links={[["Pricing", "/pricing"], ["How it works", "/faq"], ["Make a sheet", "/generate"]]} />
            <FooterCol title="Account" links={[["Sign in", "/auth"], ["My Sheets", "/library"]]} />
            <FooterCol title="Company" links={[["Privacy", "/faq"], ["Terms", "/faq"]]} />
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-[var(--ink-700)] pt-6 text-[13px] text-[var(--ink-500)] sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} CramSheet</span>
          <span className="font-mono text-[12px]">One page. Print it. Take it.</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <div className="mb-2 text-[13px] font-semibold text-white">{title}</div>
      <ul className="space-y-1.5">
        {links.map(([label, href]) => (
          <li key={label}>
            <Link href={href} className="text-[var(--ink-400)] transition-colors hover:text-white">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
