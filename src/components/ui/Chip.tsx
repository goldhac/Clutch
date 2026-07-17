import type { ReactNode } from "react";

export type ChipTone =
  | "neutral"
  | "indigo"
  | "gold"
  | "green"
  | "red"
  | "orange"
  | "teal";

/**
 * Chip — small colored label. Used for:
 *   - question kinds (MCQ / short / problem / T/F)
 *   - topic tags in multi-topic sheets
 *   - status pills in the sheet library
 *   - file-tag chips on /generate
 */
export interface ChipProps {
  tone?: ChipTone;
  children: ReactNode;
  className?: string;
}

const TONES: Record<ChipTone, string> = {
  neutral: "bg-neutral-200 text-neutral-800",
  indigo: "bg-[color:var(--color-primary-indigo)] text-white",
  gold: "bg-[color:var(--color-exam-gold)] text-white",
  green: "bg-[color:var(--color-correct-green)] text-white",
  red: "bg-[color:var(--color-strong-red)] text-white",
  orange: "bg-[color:var(--color-warning-orange)] text-white",
  teal: "bg-[color:var(--color-emphasis-teal)] text-white",
};

export function Chip({ tone = "neutral", children, className }: ChipProps) {
  return (
    <span
      className={
        `inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold ` +
        `uppercase tracking-wide ${TONES[tone]}` +
        (className ? ` ${className}` : "")
      }
    >
      {children}
    </span>
  );
}
