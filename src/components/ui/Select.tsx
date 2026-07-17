import type { ReactNode, SelectHTMLAttributes } from "react";

/**
 * Select — a styled native <select>. Native beats custom for a11y +
 * mobile ergonomics unless we need multi-select or search.
 *
 * Wrap in <Field> for a label.
 */
export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  children: ReactNode;
}

export function Select({ className, invalid, children, ...rest }: SelectProps) {
  const border = invalid
    ? "border-[color:var(--color-strong-red)]"
    : "border-neutral-300";
  return (
    <select
      className={
        `w-full rounded border ${border} bg-white px-2 py-1 text-sm ` +
        `outline-none focus:border-[color:var(--color-primary-indigo)] ` +
        `focus:ring-1 focus:ring-[color:var(--color-primary-indigo)]` +
        (className ? ` ${className}` : "")
      }
      {...rest}
    >
      {children}
    </select>
  );
}
