import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant =
  | "primary" // ink-900 fill — the one obvious action per screen
  | "signal" // iris fill — upgrade / paid moments
  | "soft" // signal-50 tint — secondary signal action
  | "secondary" // neutral outline — cancel / back / make-another
  | "ghost" // text-only — in-flow actions
  | "danger" // red FILL — destructive modal primaries (v2 handoff)
  | "inverse" // white fill + ink text — primary on ink grounds
  | "ghostDark"; // outlined ghost for ink grounds (hero secondary)

export type ButtonSize = "sm" | "md" | "lg" | "xl";

/**
 * Button + LinkButton — v2 handoff primitives.
 * Primary is near-black ink; iris "signal" is reserved for paid moments.
 * Press feedback is scale(0.98) at 160ms ease-out — the button must feel
 * like it heard you. Heights follow the handoff: 32 / 40 / 46 / 52.
 */

const BASE =
  "relative inline-flex select-none items-center justify-center gap-1.5 " +
  "rounded-[var(--r-md)] font-semibold leading-none whitespace-nowrap " +
  "transition-[transform,background-color,border-color,color,box-shadow] " +
  "duration-[160ms] ease-[var(--ease-out)] " +
  "active:scale-[0.98] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 " +
  "focus-visible:ring-offset-[var(--paper)] focus-visible:ring-[var(--signal-500)] " +
  "disabled:pointer-events-none disabled:shadow-none";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-fg)] shadow-[var(--sh-sm)] " +
    "hover:bg-[var(--btn-primary-bg-hover)] " +
    "disabled:bg-[var(--ink-150)] disabled:text-[var(--ink-400)]",
  signal:
    "bg-[var(--signal-500)] text-white shadow-[var(--sh-sm)] " +
    "hover:bg-[var(--signal-600)] disabled:opacity-45",
  soft:
    "bg-[var(--signal-50)] text-[var(--signal-700)] " +
    "border border-[var(--signal-100)] hover:bg-[var(--signal-100)] disabled:opacity-45",
  secondary:
    "bg-[var(--surface)] text-[var(--ink-800)] border border-[var(--border-input)] " +
    "hover:bg-[var(--ink-50)] hover:border-[var(--ink-300)] disabled:opacity-45",
  ghost:
    "bg-transparent text-[var(--ink-700)] hover:bg-[var(--ink-100)] disabled:opacity-45",
  danger:
    "bg-[var(--conf-low)] text-white shadow-[var(--sh-sm)] " +
    "hover:brightness-110 disabled:opacity-45",
  inverse:
    "bg-[var(--on-band)] text-[var(--band)] shadow-[var(--sh-sm)] " +
    "hover:bg-[var(--ink-100)] disabled:opacity-45",
  ghostDark:
    "bg-transparent text-[var(--on-band)] border border-[var(--band-line)] " +
    "hover:border-[var(--on-band-muted)] hover:text-[var(--on-band)] disabled:opacity-45",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-11 px-4 text-[14px]",
  lg: "h-[46px] px-5 text-[14.5px]",
  xl: "h-[52px] px-6 text-[15px]",
};

function Spinner() {
  return (
    <svg
      className="h-3.5 w-3.5 animate-[cl-spin_0.8s_linear_infinite]"
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
