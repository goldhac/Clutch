import type { ReactNode } from "react";
import Link from "next/link";
import { Wordmark } from "./Wordmark";
import { CreditsPill } from "./CreditsPill";
import { Toaster } from "./Toast";

/**
 * AppChrome — the authenticated app top bar per the v2 handoff:
 * 60px tall, sticky, hairline bottom, rgba(251,251,250,.9) + blur(10px).
 * Content max-width 1180px at 32px padding. Mounts the Toaster.
 *
 * Navigation is the same three destinations at every width, in the
 * affordance each width can carry:
 *
 *   ≥ sm   the segmented trough beside the wordmark (the handoff's
 *          tab pattern, shared with SegmentedControl)
 *   < sm   a fixed bottom tab bar — 60px of header cannot hold the
 *          wordmark, three tabs, the credits pill AND the avatar at
 *          375px, and a menu button would hide the app's only three
 *          places behind a tap. The bar is thumb-reachable and always
 *          shows where you are.
 *
 * Only one of the two is ever in the a11y tree: `hidden` / `sm:hidden`
 * are display:none, so a screen reader is never offered the same three
 * links twice.
 */
export interface AppChromeProps {
  active?: "generate" | "audio" | "library";
  credits?: number;
  planLabel?: string;
  /** initials for the avatar, e.g. "AD" */
  avatar?: string;
  children: ReactNode;
}

type TabKey = NonNullable<AppChromeProps["active"]>;

/** 20px line icons for the bottom bar, in the mark's vocabulary (sheets, a bolt of sound). */
const ICONS: Record<TabKey, ReactNode> = {
  generate: (
    <>
      <rect x="4.25" y="2.75" width="11.5" height="14.5" rx="2" />
      <path d="M10 7.75v4.5M7.75 10h4.5" />
    </>
  ),
  audio: <path d="M4 8.5v3M7.5 5.5v9M11 7v6M14.5 4.5v11M18 8.5v3" />,
  library: (
    <>
      <path d="M7 2.75h8.25a1.5 1.5 0 0 1 1.5 1.5V14" />
      <rect x="3.25" y="5.75" width="10.5" height="11.5" rx="1.75" />
    </>
  ),
};

const TABS: { key: TabKey; label: string; href: string }[] = [
  { key: "generate", label: "Generate", href: "/generate" },
  { key: "audio", label: "Listen", href: "/audio" },
  { key: "library", label: "My Sheets", href: "/library" },
];

function TabIcon({ tab }: { tab: TabKey }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {ICONS[tab]}
    </svg>
  );
}

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
        <div className="mx-auto flex h-[60px] max-w-[1180px] items-center gap-4 px-5 sm:px-8">
          <Wordmark />

          <nav
            aria-label="Primary"
            className="ml-2 hidden items-center rounded-[9px] bg-[var(--field)] p-[3px] sm:flex"
          >
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

      {/* Room for the bottom bar so it never covers the last control on a page. */}
      <div className="pb-[calc(60px+env(safe-area-inset-bottom))] sm:pb-0">{children}</div>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-[var(--z-sticky)] border-t border-[var(--ink-150)] bg-[var(--paper-glass)] pb-[env(safe-area-inset-bottom)] backdrop-blur-[10px] sm:hidden"
      >
        <div className="flex items-stretch">
          {TABS.map((t) => {
            const on = t.key === active;
            return (
              <Link
                key={t.key}
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={
                  `tap flex h-[60px] flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors duration-[160ms] ` +
                  (on ? "text-[var(--ink-900)]" : "text-[var(--ink-500)]")
                }
              >
                <span
                  className={
                    `flex h-6 w-11 items-center justify-center rounded-[var(--r-full)] transition-colors duration-[160ms] ` +
                    (on ? "bg-[var(--signal-50)] text-[var(--signal-700)]" : "")
                  }
                >
                  <TabIcon tab={t.key} />
                </span>
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
