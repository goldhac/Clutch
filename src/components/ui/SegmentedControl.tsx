"use client";

/**
 * SegmentedControl — v2 handoff pattern, reused across the app:
 * 3px-padded #f2f2f3 trough, 9px radius; selected pill is white with
 * the raised-card shadow and ink-900 600 text; unselected is ink-500.
 */
export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  ariaLabel?: string;
  className?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  ariaLabel,
  className,
}: SegmentedControlProps<T>) {
  const seg = size === "sm" ? "h-[26px] px-2.5 text-[12px]" : "h-8 px-3.5 text-[13px]";
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`inline-flex items-center rounded-[9px] bg-[var(--field)] p-[3px]${className ? ` ${className}` : ""}`}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(o.value)}
            className={
              `tap inline-flex items-center justify-center rounded-[7px] font-semibold ${seg} ` +
              `transition-[background-color,color,box-shadow] duration-[160ms] ease-[var(--ease-out)] ` +
              (active
                ? "bg-[var(--surface)] text-[var(--ink-900)] shadow-[var(--sh-sm)]"
                : "text-[var(--ink-500)] hover:text-[var(--ink-800)]")
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
