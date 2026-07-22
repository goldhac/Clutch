import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant =
  | "primary" // ink-900 fill — the one obvious action per screen
  | "signal" // iris fill — upgrade / paid moments
  | "soft" // signal-50 tint — secondary signal action
  | "secondary" // neutral outline — cancel / back / make-another
  | "ghost" // text-only — in-flow actions
  | "danger"; // red outline — destructive

export type ButtonSize = "sm" | "md" | "lg";

/**
 * Button + LinkButton — matches the design handoff's Primitives section.
 * Primary is near-black ink (not indigo); iris "signal" is reserved for
 * paid/upgrade moments. Hover lifts 1px (ease-out, 120ms); active resets.
 *
 * impeccable rules applied: no ghost-card (border + wide shadow) pairing;
 * radius from the 8px control scale; full borders only, never side-stripes.
 */

const BASE =
  "relative inline-flex select-none items-center justify-center gap-1.5 " +
  "rounded-[var(--r-md)] font-medium leading-none whitespace-nowrap " +
  "transition-[transform,background-color,border-color,color,box-shadow] " +
  "duration-[var(--dur-fast)] ease-[var(--ease-out)] " +
  "hover:-translate-y-px active:translate-y-0 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 " +
  "focus-visible:ring-offset-[var(--paper)] " +
  "disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none disabled:translate-y-0";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--ink-900)] text-white shadow-[var(--sh-sm)] " +
    "hover:bg-[var(--ink-800)] hover:shadow-[var(--sh-md)] " +
    "focus-visible:ring-[var(--ink-400)]",
  signal:
    "bg-[var(--signal-500)] text-white shadow-[var(--sh-sm)] " +
    "hover:bg-[var(--signal-600)] hover:shadow-[var(--sh-md)] " +
    "focus-visible:ring-[var(--signal-500)]",
  soft:
    "bg-[var(--signal-50)] text-[var(--signal-700)] " +
    "border border-[var(--signal-100)] hover:bg-[var(--signal-100)] " +
    "focus-visible:ring-[var(--signal-500)]",
  secondary:
    "bg-white text-[var(--ink-800)] border border-[var(--ink-200)] " +
    "hover:bg-[var(--ink-50)] hover:border-[var(--ink-300)] " +
    "focus-visible:ring-[var(--ink-400)]",
  ghost:
    "bg-transparent text-[var(--ink-700)] hover:bg-[var(--ink-100)] " +
    "focus-visible:ring-[var(--ink-300)]",
  danger:
    "bg-white text-[var(--danger)] border border-[var(--danger)]/35 " +
    "hover:bg-[var(--danger-bg)] hover:border-[var(--danger)]/60 " +
    "focus-visible:ring-[var(--danger)]",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-[13px]",
  md: "h-9 px-4 text-[14px]",
  lg: "h-11 px-5 text-[15px]",
};

function Spinner() {
  return (
    <svg
      className="h-3.5 w-3.5 animate-[ds-spin_0.7s_linear_infinite]"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]}${loading ? " cursor-wait" : ""}${className ? ` ${className}` : ""}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export interface LinkButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: LinkButtonProps) {
  return (
    <a
      className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]}${className ? ` ${className}` : ""}`}
      {...rest}
    >
      {children}
    </a>
  );
}
