import type { ReactNode } from "react";

/**
 * Field — label + control + optional helper/error text.
 *
 * The standard form-row wrapper. Any input primitive (TextInput,
 * Select, FileDrop, textarea) goes inside as `children`.
 */
export interface FieldProps {
  label: string;
  htmlFor?: string;
  helper?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

export function Field({
  label,
  htmlFor,
  helper,
  error,
  required,
  className,
  children,
}: FieldProps) {
  return (
    <label
      htmlFor={htmlFor}
      className={`block text-sm${className ? ` ${className}` : ""}`}
    >
      <span className="mb-1 block font-medium text-neutral-700">
        {label}
        {required && (
          <span className="ml-0.5 text-[color:var(--color-strong-red)]" aria-hidden>
            *
          </span>
        )}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-[color:var(--color-strong-red)]">
          {error}
        </span>
      ) : helper ? (
        <span className="mt-1 block text-xs text-neutral-500">{helper}</span>
      ) : null}
    </label>
  );
}
