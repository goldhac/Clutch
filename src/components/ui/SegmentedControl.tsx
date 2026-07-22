"use client";

/**
 * SegmentedControl — the pill-track switcher used for density
 * (MAX / Balanced / Essentials) and the app tabs (Generate / My Sheets).
 * The active segment gets a white raised tile on an ink-50 track.
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
  const pad = size === "sm" ? "p-0.5" : "p-1";
  const seg = size === "sm" ? "h-6 px-2 text-[12px]" : "h-8 px-3 text-[13px]";
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-0.5 rounded-[var(--r-md)] bg-[var(--ink-100)] ${pad}${className ? ` ${className}` : ""}`}
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
              `inline-flex items-center justify-center rounded-[var(--r-sm)] font-medium ${seg} ` +
              `transition-colors duration-[var(--dur-fast)] ` +
              (active
                ? "bg-white text-[var(--ink-900)] shadow-[var(--sh-xs)]"
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
