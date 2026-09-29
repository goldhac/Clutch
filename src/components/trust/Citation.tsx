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
  /**
   * The student wrote or edited this line (#20). It then reads `you` instead of a file, in the
   * same slot, at the same weight — provenance, not a citation.
   *
   * Which is why it carries a DIFFERENT class. `.src` is hidden when the student turns sources
   * off, and provenance must survive that: "off" means "stop showing me where things came from
   * in my files", never "stop telling me which lines are mine". Those are the two kinds of line
   * on the sheet, and losing the distinction is the one thing this feature cannot do.
   */
  mine?: boolean;
}

export function Citation({ src, className, mine }: CitationProps) {
  if (mine) {
    return (
      <span className={`src-mine${className ? ` ${className}` : ""}`} title="You wrote this">
        you
      </span>
    );
  }
  return (
    <span className={`src${className ? ` ${className}` : ""}`}>{src}</span>
  );
}
