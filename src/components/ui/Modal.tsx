"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Modal — dialog on a dimmed workspace, ds-rise entrance. Built on the
 * native <dialog> element so focus-trapping + Esc + the top-layer come
 * for free (no z-index fights, no portal). Backdrop click closes.
 */
export interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
  /** max width in px (default 440) */
  width?: number;
}

export function Modal({ open, onClose, children, labelledBy, width = 440 }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onClose={onClose}
      onClick={(e) => {
        // backdrop = clicks on the <dialog> element itself (not children)
        if (e.target === ref.current) onClose();
      }}
      className={
        "m-auto rounded-[var(--r-xl)] border border-[var(--ink-150)] bg-white p-0 " +
        "shadow-[var(--sh-xl)] backdrop:bg-[rgba(17,17,20,0.42)] backdrop:backdrop-blur-[2px] " +
        "[&[open]]:animate-[ds-rise_var(--dur-slow)_var(--ease-out)]"
      }
      style={{ width: `min(${width}px, calc(100vw - 32px))` }}
    >
      <div className="p-6">{children}</div>
    </dialog>
  );
}
