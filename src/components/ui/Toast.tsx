"use client";

import { useEffect, useState } from "react";

/**
 * Toast — v2 handoff spec. 2.6s, top center, ink ground, 10px radius,
 * toast shadow, 13px 500 white label with a leading mark:
 * green ✓ (#4ade80) or gold ★ (#f0c14b).
 *
 * Progress and success go to toasts; decisions go to modals.
 *
 * Usage: mount <Toaster /> once (AppChrome does), call
 * toast("Saved to My Sheets") or toast("Unlocked · both pages are yours", "star").
 *
 * CSS transitions (not keyframes) so rapid toasts retarget smoothly.
 */

export type ToastMark = "check" | "star";
export interface ToastAction {
  label: string;
  onAction: () => void;
}
interface ToastItem {
  id: number;
  label: string;
  mark: ToastMark;
  action?: ToastAction;
}

type Listener = (t: ToastItem) => void;
let listener: Listener | null = null;
let nextId = 1;

export function toast(label: string, mark: ToastMark = "check", action?: ToastAction) {
  listener?.({ id: nextId++, label, mark, action });
}

/**
 * Plain confirmations clear quickly; a toast carrying an action is the
 * only way back from that action, so it stays up long enough to read
 * the label, find the control and hit it.
 */
const DURATION = 2600;
const DURATION_ACTION = 7000;

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [leaving, setLeaving] = useState<Set<number>>(new Set());

  useEffect(() => {
    listener = (t) => {
      setItems((prev) => [...prev, t]);
      window.setTimeout(() => {
        setLeaving((prev) => new Set(prev).add(t.id));
        window.setTimeout(() => {
          setItems((prev) => prev.filter((i) => i.id !== t.id));
          setLeaving((prev) => {
            const next = new Set(prev);
            next.delete(t.id);
            return next;
          });
        }, 200);
      }, t.action ? DURATION_ACTION : DURATION);
    };
    return () => {
      listener = null;
    };
  }, []);

  function dismiss(id: number) {
    setLeaving((prev) => new Set(prev).add(id));
    window.setTimeout(() => {
      setItems((prev) => prev.filter((i) => i.id !== id));
      setLeaving((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 200);
  }

  if (items.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-4 z-[var(--z-toast)] flex flex-col items-center gap-2"
    >
      {items.map((t) => (
        <ToastCard key={t.id} item={t} leaving={leaving.has(t.id)} onDismiss={dismiss} />
      ))}
    </div>
  );
}

function ToastCard({
  item,
  leaving,
  onDismiss,
}: {
  item: ToastItem;
  leaving: boolean;
  onDismiss: (id: number) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const shown = mounted && !leaving;
  return (
    <div
      className="flex items-center gap-2 rounded-[10px] bg-[var(--band)] px-4 py-[11px] shadow-[var(--sh-toast)] transition-[opacity,transform] duration-200 ease-[var(--ease-out)]"
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : "translateY(-8px) scale(0.97)",
      }}
    >
      {item.mark === "check" ? (
        <span aria-hidden className="text-[13px] font-semibold text-[#4ade80]">
          ✓
        </span>
      ) : (
        <span aria-hidden className="text-[13px] text-[#f0c14b]">
          ★
        </span>
      )}
      <span className="text-[13px] font-medium text-white">{item.label}</span>
      {item.action && (
        <button
          type="button"
          onClick={() => {
            item.action?.onAction();
            onDismiss(item.id);
          }}
          className="pointer-events-auto tap -my-1 ml-1.5 rounded-[6px] px-2 py-1 text-[13px] font-semibold text-[#8a86e8] transition-colors duration-[160ms] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8a86e8]"
        >
          {item.action.label}
        </button>
      )}
    </div>
  );
}
