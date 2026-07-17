import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

/**
 * Button + LinkButton — the same visual language, two elements.
 *
 * Variants:
 *   primary   — indigo, filled. The one obvious action per screen.
 *   secondary — neutral, outlined. Cancel / back / secondary flow.
 *   ghost     — text-only, hover-tinted. In-flow actions (density switcher).
 *   danger    — red, filled. Destructive intent.
 */

const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded font-semibold " +
  "transition-colors disabled:cursor-not-allowed disabled:opacity-50 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-[color:var(--color-primary-indigo)] text-white hover:opacity-90 " +
    "focus-visible:outline-[color:var(--color-primary-indigo)]",
  secondary:
    "border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-100 " +
    "focus-visible:outline-neutral-400",
  ghost:
    "bg-transparent text-neutral-800 hover:bg-neutral-100 " +
    "focus-visible:outline-neutral-400",
  danger:
    "bg-[color:var(--color-strong-red)] text-white hover:opacity-90 " +
    "focus-visible:outline-[color:var(--color-strong-red)]",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-base",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]}${className ? ` ${className}` : ""}`}
      {...rest}
    >
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
