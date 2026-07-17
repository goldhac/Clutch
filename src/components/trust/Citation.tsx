/**
 * Citation — the small italic "Slide 14" / "Past midterm 2024 Q3"
 * source marker that trails every ranked item.
 *
 * Reads as background but is functionally load-bearing: it's how the
 * student verifies the engine didn't invent a claim. Never hide it
 * to "clean up" the UI.
 */
export interface CitationProps {
  src: string;
  className?: string;
}

export function Citation({ src, className }: CitationProps) {
  return (
    <span className={`src${className ? ` ${className}` : ""}`}>{src}</span>
  );
}
