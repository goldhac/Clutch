import type { ReactNode } from "react";

/**
 * Card — the generic surface container. Bordered, padded, rounded.
 * Use for grouping related content, form sections, sheet previews
 * in a library grid, etc.
 */
export interface CardProps {
  children: ReactNode;
  className?: string;
  /** When true, drops padding — useful when the child manages its own. */
  bare?: boolean;
}

export function Card({ children, className, bare = false }: CardProps) {
  return (
    <div
      className={
        `rounded border border-neutral-200 bg-white ${bare ? "" : "p-4"}` +
        (className ? ` ${className}` : "")
      }
    >
      {children}
    </div>
  );
}
