import type { InputHTMLAttributes, ReactNode } from "react";

/**
 * TextInput — white field, ink border, signal focus ring; danger border
 * when invalid. Optional leading icon (search, etc). Wrap in <Field> for
 * a label + helper/error text.
 */
export interface TextInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  type?: "text" | "email" | "url" | "password" | "search";
  invalid?: boolean;
  leading?: ReactNode;
}

export function TextInput({
  type = "text",
  className,
  invalid,
  leading,
  ...rest
}: TextInputProps) {
  const border = invalid ? "border-[var(--danger)]" : "border-[var(--ink-200)]";
  const field =
    `h-9 w-full rounded-[var(--r-md)] border ${border} bg-white text-[14px] text-[var(--ink-900)] ` +
    `placeholder:text-[var(--ink-400)] outline-none transition-colors duration-[var(--dur-fast)] ` +
    `focus:border-[var(--signal-500)] focus:ring-2 focus:ring-[var(--signal-100)]`;

  if (leading) {
    return (
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-400)]">
          {leading}
        </span>
        <input
          type={type}
          className={`${field} pl-8 pr-3${className ? ` ${className}` : ""}`}
          {...rest}
        />
      </div>
    );
  }

  return (
    <input
      type={type}
      className={`${field} px-3${className ? ` ${className}` : ""}`}
      {...rest}
    />
  );
}
