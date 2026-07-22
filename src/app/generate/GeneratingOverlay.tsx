"use client";

import { useEffect, useState } from "react";

/**
 * GeneratingOverlay — the full-dark 30–90s generation screen. Shows the
 * 4-step narrative (Reading → Ranking → Drafting → Verifying page fit).
 *
 * v1 is OPTIMISTIC: we don't have server-sent progress yet (that's a
 * later SSE task), so the steps advance on a timer calibrated to a
 * typical run, and the final "Verifying" step holds until the real API
 * call resolves and the page navigates away. Honest about the illusion:
 * the steps are a narrative of what the engine is actually doing, not a
 * live trace.
 */
export interface GeneratingOverlayProps {
  fileCount: number;
  /** rough page total across the pack, for the caption */
  pageHint?: number;
  pastExamCount?: number;
}

const STEPS = [
  { key: "read", label: "Reading your files", holdMs: 4000 },
  { key: "rank", label: "Ranking topics by likelihood", holdMs: 9000 },
  { key: "draft", label: "Drafting the sheet", holdMs: 20000 },
  { key: "verify", label: "Verifying page fit", holdMs: Infinity }, // holds until nav
];

export function GeneratingOverlay({ fileCount, pageHint, pastExamCount = 0 }: GeneratingOverlayProps) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let elapsed = 0;
    for (let i = 0; i < STEPS.length - 1; i++) {
      elapsed += STEPS[i].holdMs;
      timers.push(setTimeout(() => setActive(i + 1), elapsed));
    }
    return () => timers.forEach(clearTimeout);
  }, []);

  const caption = [
    `Reading ${fileCount} file${fileCount === 1 ? "" : "s"}`,
    pageHint ? `${pageHint} pages` : null,
    pastExamCount ? `verifying against ${pastExamCount} past exam${pastExamCount === 1 ? "" : "s"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="fixed inset-0 z-[var(--z-overlay)] flex items-center justify-center bg-[var(--ink-900)] px-6"
      role="status"
      aria-live="polite"
    >
      <div className="w-full max-w-md" style={{ animation: "ds-rise var(--dur-slow) var(--ease-out)" }}>
        <div className="text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-[var(--r-md)] bg-white/10 text-white">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 3v4M3 5h4M6 17v4M4 19h4M13 3l2.5 6.5L22 12l-6.5 2.5L13 21l-2.5-6.5L4 12l6.5-2.5L13 3Z" />
            </svg>
          </span>
          <h2 className="mt-4 font-serif text-[28px] text-white">Building your sheet</h2>
          <p className="mt-1 text-[14px] text-[var(--ink-400)]">Usually done in under a minute. Hang tight.</p>
        </div>

        <ul className="mt-8 space-y-1">
          {STEPS.map((s, i) => {
            const done = i < active;
            const on = i === active;
            return (
              <li
                key={s.key}
                className={
                  "flex items-center gap-3 rounded-[var(--r-md)] px-3 py-3 transition-colors " +
                  (on ? "bg-white/[0.06]" : "")
                }
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                  {done ? (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--conf-high)] text-white">
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </span>
                  ) : on ? (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10">
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 animate-[ds-spin_0.7s_linear_infinite] text-white" fill="none" aria-hidden>
                        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
                        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                    </span>
                  ) : (
                    <span className="h-6 w-6 rounded-full border border-white/15" />
                  )}
                </span>
                <span className={`flex-1 text-[15px] ${done || on ? "text-white" : "text-[var(--ink-500)]"}`}>
                  {s.label}
                </span>
                {on && <span className="font-mono text-[11px] text-[var(--ink-400)]">in progress</span>}
              </li>
            );
          })}
        </ul>

        {/* indeterminate bar */}
        <div className="mt-6 h-1 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full w-1/3 rounded-full bg-white/60"
            style={{ animation: "ds-pulse 1.4s ease infinite" }}
          />
        </div>
        {caption && <p className="mt-4 text-center font-mono text-[12px] text-[var(--ink-500)]">{caption}</p>}
      </div>
    </div>
  );
}
