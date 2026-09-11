import type { ReactNode } from "react";
import Link from "next/link";
import { Wordmark } from "./Wordmark";
import { CreditsPill } from "./CreditsPill";
import { Toaster } from "./Toast";

/**
 * AppChrome — the authenticated app top bar per the v2 handoff:
 * 60px tall, sticky, hairline bottom, rgba(251,251,250,.9) + blur(10px).
 * Content max-width 1180px at 32px padding. Mounts the Toaster.
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
      <Toaster />
      <header className="sticky top-0 z-[var(--z-sticky)] border-b border-[var(--ink-150)] bg-[var(--paper-glass)] backdrop-blur-[10px]">
        <div className="mx-auto flex h-[60px] max-w-[1180px] items-center gap-4 px-8">
          <Wordmark />

          <nav className="ml-2 hidden items-center rounded-[9px] bg-[var(--field)] p-[3px] sm:flex">
            {TABS.map((t) => {
              const on = t.key === active;
              return (
                <Link
                  key={t.key}
                  href={t.href}
                  aria-current={on ? "page" : undefined}
                  className={
                    `tap inline-flex items-center rounded-[7px] px-3.5 py-1.5 text-[13px] font-semibold transition-[background-color,color,box-shadow] duration-[160ms] ` +
                    (on
                      ? "bg-[var(--surface)] text-[var(--ink-900)] shadow-[var(--sh-sm)]"
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
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--signal-50)] text-[11px] font-semibold text-[var(--signal-700)]"
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
