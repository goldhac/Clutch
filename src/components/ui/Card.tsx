import type { ReactNode } from "react";

/**
 * Card — generic surface. One border OR one shadow, never both heavy
 * (impeccable ghost-card ban). Radius from the 12px card scale, never
 * over-rounded. `interactive` adds a hover lift for clickable cards
 * (library thumbnails).
 */
export interface CardProps {
  children: ReactNode;
  className?: string;
  bare?: boolean; // drop padding — child manages its own
  interactive?: boolean; // hover lift for clickable cards
  as?: "div" | "article" | "li";
}

export function Card({
  children,
  className,
  bare = false,
  interactive = false,
  as: Tag = "div",
}: CardProps) {
  return (
    <Tag
      className={
        `rounded-[var(--r-lg)] border border-[var(--ink-150)] bg-white ${bare ? "" : "p-4"}` +
        (interactive
          ? " cursor-pointer transition-[transform,box-shadow] duration-[var(--dur)] ease-[var(--ease-out)] " +
            "hover:-translate-y-[3px] hover:shadow-[var(--sh-lg)]"
          : " shadow-[var(--sh-xs)]") +
        (className ? ` ${className}` : "")
      }
    >
      {children}
    </Tag>
  );
}
