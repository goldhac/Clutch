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
interface ToastItem {
  id: number;
  label: string;
  mark: ToastMark;
}

type Listener = (t: ToastItem) => void;
let listener: Listener | null = null;
let nextId = 1;

export function toast(label: string, mark: ToastMark = "check") {
  listener?.({ id: nextId++, label, mark });
}

const DURATION = 2600;

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
      }, DURATION);
    };
    return () => {
      listener = null;
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-4 z-[var(--z-toast)] flex flex-col items-center gap-2"
    >
      {items.map((t) => (
        <ToastCard key={t.id} item={t} leaving={leaving.has(t.id)} />
      ))}
    </div>
  );
}

function ToastCard({ item, leaving }: { item: ToastItem; leaving: boolean }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const shown = mounted && !leaving;
  return (
    <div
      className="flex items-center gap-2 rounded-[10px] bg-[var(--ink-900)] px-4 py-[11px] shadow-[var(--sh-toast)] transition-[opacity,transform] duration-200 ease-[var(--ease-out)]"
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
    </div>
  );
}
