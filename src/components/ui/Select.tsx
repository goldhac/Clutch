import type { ReactNode, SelectHTMLAttributes } from "react";

/**
 * Select — styled native <select> with a custom chevron. Native beats
 * custom for a11y + mobile ergonomics unless we need multi-select or
 * search. Signal focus ring, danger border when invalid.
 */
export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  children: ReactNode;
}

export function Select({ className, invalid, children, ...rest }: SelectProps) {
  const border = invalid ? "border-[var(--danger)]" : "border-[var(--ink-200)]";
  return (
    <div className="relative">
      <select
        className={
          `h-9 w-full appearance-none rounded-[var(--r-md)] border ${border} bg-white ` +
          `pl-3 pr-8 text-[14px] text-[var(--ink-900)] outline-none transition-colors ` +
          `duration-[var(--dur-fast)] focus:border-[var(--signal-500)] ` +
          `focus:ring-2 focus:ring-[var(--signal-100)]` +
          (className ? ` ${className}` : "")
        }
        {...rest}
      >
        {children}
      </select>
      <svg
        className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-400)]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}
