import type { InputHTMLAttributes } from "react";

/**
 * TextInput — shared text/email/url input styling.
 *
 * Wrap in <Field> for label + helper/error. This component is just
 * the control.
 */
export interface TextInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  type?: "text" | "email" | "url" | "password" | "search";
  invalid?: boolean;
}

export function TextInput({
  type = "text",
  className,
  invalid,
  ...rest
}: TextInputProps) {
  const border = invalid
    ? "border-[color:var(--color-strong-red)]"
    : "border-neutral-300";
  return (
    <input
      type={type}
      className={
        `w-full rounded border ${border} bg-white px-2 py-1 text-sm ` +
        `outline-none focus:border-[color:var(--color-primary-indigo)] ` +
        `focus:ring-1 focus:ring-[color:var(--color-primary-indigo)]` +
        (className ? ` ${className}` : "")
      }
      {...rest}
    />
  );
}
