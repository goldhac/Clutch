import type { ReactNode } from "react";
import Link from "next/link";
import { Wordmark } from "./Wordmark";
import { CreditsPill } from "./CreditsPill";

/**
 * AppChrome — the authenticated app top bar: wordmark, Generate /
 * My Sheets tabs, a credits pill, and an avatar. Sticky. Wraps app
 * pages (generate, results, library).
 */
export interface AppChromeProps {
  active?: "generate" | "library";
  credits?: number;
  planLabel?: string;
  /** initials for the avatar, e.g. "AD" */
  avatar?: string;
  children: ReactNode;
}

const TABS: { key: "generate" | "library"; label: string; href: string }[] = [
  { key: "generate", label: "Generate", href: "/generate" },
  { key: "library", label: "My Sheets", href: "/library" },
];

export function AppChrome({
  active,
  credits = 0,
  planLabel,
  avatar = "You",
  children,
}: AppChromeProps) {
  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <header className="sticky top-0 z-[var(--z-sticky)] border-b border-[var(--ink-150)] bg-[color-mix(in_srgb,var(--paper)_88%,transparent)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-5">
          <Wordmark />

          <nav className="ml-2 hidden items-center gap-0.5 rounded-[var(--r-md)] bg-[var(--ink-100)] p-0.5 sm:flex">
            {TABS.map((t) => {
              const on = t.key === active;
              return (
                <Link
                  key={t.key}
                  href={t.href}
                  aria-current={on ? "page" : undefined}
                  className={
                    `rounded-[var(--r-sm)] px-3 py-1.5 text-[13px] font-medium transition-colors ` +
                    (on
                      ? "bg-white text-[var(--ink-900)] shadow-[var(--sh-xs)]"
                      : "text-[var(--ink-500)] hover:text-[var(--ink-800)]")
                  }
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <CreditsPill credits={credits} planLabel={planLabel} />
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--signal-100)] text-[11px] font-semibold text-[var(--signal-700)]"
              aria-hidden
            >
              {avatar.slice(0, 2).toUpperCase()}
            </span>
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
