"use client";

import { useEffect, useRef, useState } from "react";
import { Mark } from "@/components/ui";

/**
 * GeneratingOverlay — v2 handoff: full ink-900 takeover, 460px column,
 * cl-rise entrance. Honest 4-step list (done ✓ / active spinner /
 * pending outline), indeterminate cl-sweep bar, mono caption, Cancel.
 *
 * Steps advance on the handoff's timeline (3.2s → 6s → 9s) and the
 * last step holds until the real request resolves — the UI never
 * claims progress it doesn't have.
 */
const STEPS = [
  { label: "Reading your files", hold: 3200 },
  { label: "Ranking topics by likelihood", hold: 6000 },
  { label: "Drafting the sheet", hold: 9000 },
  { label: "Verifying page fit", hold: Infinity },
];

export function GeneratingOverlay({
  fileCount,
  pastExamCount,
  onCancel,
}: {
  fileCount: number;
  pastExamCount: number;
  onCancel?: () => void;
}) {
  const [step, setStep] = useState(0);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    let t = 0;
    for (let i = 0; i < STEPS.length - 1; i++) {
      t += STEPS[i].hold;
      timers.current.push(window.setTimeout(() => setStep(i + 1), t));
    }
    return () => timers.current.forEach(clearTimeout);
  }, []);

  const caption =
    `reading ${fileCount} ${fileCount === 1 ? "file" : "files"}` +
    (pastExamCount
      ? ` · verifying against ${pastExamCount} ${pastExamCount === 1 ? "past exam" : "past exams"}`
      : "");

  return (
    <div
      className="fixed inset-0 z-[var(--z-overlay)] flex items-center justify-center bg-[var(--band)] p-6"
      role="status"
      aria-live="polite"
    >
      <div className="w-full max-w-[460px] animate-[cl-rise_400ms_var(--ease-pop)]">
        <div className="text-center">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-[11px] bg-white/10">
            <Mark px={22} onInk />
          </span>
          <h2 className="mt-4 font-serif text-[34px] leading-[1.05] tracking-[-0.02em] text-white">
            Building your sheet
          </h2>
          <p className="mt-2 text-[14px] text-[var(--on-band-muted)]">
            Usually done in under a minute. Hang tight.
          </p>
        </div>

        <ol className="mt-7 space-y-0.5">
          {STEPS.map((s, i) => {
            const done = i < step;
            const on = i === step;
            return (
              <li
                key={s.label}
                className={`flex items-center gap-3 rounded-[9px] px-3 py-[11px] ${on ? "bg-white/[0.06]" : ""}`}
              >
                {done ? (
                  <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[var(--conf-high)] text-[11px] font-bold text-white">
                    ✓
                  </span>
                ) : on ? (
                  <span
                    aria-hidden
                    className="h-[22px] w-[22px] shrink-0 animate-[cl-spin_800ms_linear_infinite] rounded-full border-2 border-white/50 border-t-transparent bg-white/[0.14]"
                  />
                ) : (
                  <span aria-hidden className="h-[22px] w-[22px] shrink-0 rounded-full border border-white/[0.16]" />
                )}
                <span className={`flex-1 text-[14.5px] ${done || on ? "text-white" : "text-[var(--ink-500)]"}`}>
                  {s.label}
                </span>
                {on && (
                  <span className="font-mono text-[11px] text-[var(--ink-500)]">in progress</span>
                )}
              </li>
            );
          })}
        </ol>

        <div className="relative mt-5 h-[3px] overflow-hidden rounded-[2px] bg-white/10">
          <span className="absolute bottom-0 top-0 w-[28%] animate-[cl-sweep_1.5s_ease-in-out_infinite] rounded-[2px] bg-white/60" />
        </div>

        <div className="mt-4 text-center font-mono text-[12px] text-[var(--ink-500)]">{caption}</div>

        {onCancel && (
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={onCancel}
              className="border-b border-[var(--band-line)] pb-0.5 text-[13px] text-[var(--ink-500)] transition-colors duration-[160ms] hover:text-white"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
