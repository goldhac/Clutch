"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Reveal — scroll-entrance wrapper for marketing sections. Fades and
 * rises content 12px once it enters the viewport (once only, -80px
 * margin so it starts just before it's fully visible).
 *
 * CSS transition (not keyframes) so it's interruptible; transform +
 * opacity only, GPU-cheap. Respects prefers-reduced-motion via the
 * global media rule in tokens.css.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  /** ms — for staggering siblings (keep ≤ 150) */
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li" | "span";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "-80px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      // @ts-expect-error ref type narrows per tag; all are HTMLElements
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : "translateY(12px)",
        transition: `opacity 500ms var(--ease-pop) ${delay}ms, transform 500ms var(--ease-pop) ${delay}ms`,
      }}
    >
      {children}
    </Tag>
  );
}
