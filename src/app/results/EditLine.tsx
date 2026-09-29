"use client";

/**
 * EditLine — change the words on a line, and own it (#20).
 *
 * Opened by clicking a line on the sheet. Deliberately a small panel rather than an inline
 * contenteditable: the sheet is a measured print layout, and letting text grow inside it while the
 * fitter is measuring would fight the thing that keeps both pages full.
 *
 * Saving makes the line theirs — it reads `you`, it can no longer be trimmed, and it loses any
 * verified star, because we checked the sentence that used to be there and not this one. The
 * original citation stays on the object as a provenance trail.
 *
 * Plain on purpose; the visual pass is Gold's.
 */
import { useEffect, useRef, useState } from "react";

export interface EditLineProps {
  labels: [string, string];
  initial: { a: string; b: string };
  /** True when the line currently carries the verified star, so we can warn before removing it. */
  wasVerified?: boolean;
  onSave: (next: { a: string; b: string }) => void;
  onCancel: () => void;
}

export function EditLine({ labels, initial, wasVerified, onSave, onCancel }: EditLineProps) {
  const [a, setA] = useState(initial.a);
  const [b, setB] = useState(initial.b);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => { first.current?.focus(); first.current?.select(); }, []);

  const changed = a !== initial.a || b !== initial.b;
  const ready = a.trim().length > 0 && b.trim().length > 0 && changed;

  return (
    <div
      role="dialog"
      aria-label="Edit this line"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && ready) onSave({ a, b });
      }}
      className="pointer-events-auto w-full max-w-[720px] animate-[cl-rise_220ms_var(--ease-pop)] rounded-[14px] bg-[var(--band-2)] p-4 shadow-[0_20px_50px_rgba(17,17,20,.4)]"
    >
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-white">Edit this line</span>
        <button
          type="button"
          onClick={onCancel}
          className="font-mono text-[11px] text-[var(--on-band-muted)] hover:text-[var(--on-band)]"
        >
          close
        </button>
      </div>

      <label className="mt-2.5 block">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--on-band-muted)]">{labels[0]}</span>
        <input
          ref={first}
          value={a}
          maxLength={160}
          onChange={(e) => setA(e.target.value)}
          className="mt-1 w-full rounded-[7px] bg-black/30 px-2.5 py-1.5 text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-[var(--signal-500)]"
        />
      </label>

      <label className="mt-2 block">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--on-band-muted)]">{labels[1]}</span>
        <textarea
          value={b}
          rows={2}
          maxLength={400}
          onChange={(e) => setB(e.target.value)}
          className="mt-1 w-full resize-y rounded-[7px] bg-black/30 px-2.5 py-1.5 text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-[var(--signal-500)]"
        />
      </label>

      <p className="mt-2 text-[11.5px] leading-[1.45] text-[var(--on-band-muted)]">
        Once you change it, the line is yours: it reads <span className="text-white">you</span> instead
        of a citation, and the sheet will never trim it to make room.
        {wasVerified && (
          <>
            {" "}It currently carries the <span className="text-white">&#9733; verified</span> mark &mdash;
            that says we checked <em>those</em> words against your files, so it comes off.
          </>
        )}
      </p>

      <div className="mt-2.5 flex items-center gap-2">
        <button
          type="button"
          disabled={!ready}
          onClick={() => onSave({ a, b })}
          className="tap rounded-[7px] bg-white/15 px-3 py-1 text-[12px] font-semibold text-white hover:bg-white/25 disabled:opacity-35"
        >
          Save my version
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="tap rounded-[7px] px-2 py-1 text-[12px] font-semibold text-[var(--on-band-muted)] hover:text-white"
        >
          Cancel
        </button>
        <span className="ml-auto font-mono text-[10.5px] text-[var(--on-band-muted)]">&#8984;&#9166; to save</span>
      </div>
    </div>
  );
}
