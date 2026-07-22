/**
 * Skeleton — shimmer placeholder for loading states (library thumbnails,
 * results while density switches). Uses the ds-shimmer keyframe.
 */
export interface SkeletonProps {
  className?: string;
  rounded?: "sm" | "md" | "lg" | "full";
}

const R: Record<NonNullable<SkeletonProps["rounded"]>, string> = {
  sm: "rounded-[var(--r-sm)]",
  md: "rounded-[var(--r-md)]",
  lg: "rounded-[var(--r-lg)]",
  full: "rounded-[var(--r-full)]",
};

export function Skeleton({ className, rounded = "md" }: SkeletonProps) {
  return (
    <div
      className={`${R[rounded]} bg-[linear-gradient(90deg,var(--ink-100)_25%,var(--ink-150)_37%,var(--ink-100)_63%)] ${className ?? ""}`}
      style={{
        backgroundSize: "400% 100%",
        animation: "ds-shimmer 1.4s ease infinite",
      }}
      aria-hidden
    />
  );
}
