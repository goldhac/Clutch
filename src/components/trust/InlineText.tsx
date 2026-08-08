import { inlineFormat } from "@/renderer/primitives";

/**
 * InlineText — renders content that may contain the Clutch inline
 * conventions from OutSpec §2:
 *
 *   **bold**    → strong-red must-know fact
 *   *emphasis*  → teal bold-non-italic watch-out
 *   `code`      → inline monospace
 *
 * Reuses the escape+parse helper from the string renderer via
 * dangerouslySetInnerHTML — safe because inlineFormat escapes HTML
 * before applying the substitutions.
 *
 * Use for any user-facing text that came from the engine (topics.why,
 * concept.def, question.q, trap.text, etc.).
 */
export interface InlineTextProps {
  text: string;
  as?: keyof React.JSX.IntrinsicElements;
  className?: string;
}

export function InlineText({ text, as: Tag = "span", className }: InlineTextProps) {
  const Component = Tag as "span";
  return (
    <Component
      className={className}
      dangerouslySetInnerHTML={{ __html: inlineFormat(text) }}
    />
  );
}
