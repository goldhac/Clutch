/**
 * primitives.ts — the small reusable HTML bits every pattern needs.
 *
 * The renderer is intentionally a pure string-templating function (not
 * React) so the SAME function emits the SAME bytes whether we serve it
 * to the browser at /sheet or hand it to Playwright for a PDF in Step 4.
 * No JSX, no React-specific output surprises (auto whitespace,
 * hydration markers, runtime-only features).
 */
import type { Conf } from "@/contract/sheet-content";

/** Escape HTML special chars in untrusted content. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Inline formatter — converts the proven inline conventions
 * (OutSpec §2) into HTML elements that semantics.css styles:
 *
 *   **bold**   → <strong>   (rendered strong red)
 *   *em*       → <em>       (rendered teal bold non-italic)
 *   `code`     → <code>     (rendered with light-fill bg)
 *
 * Escapes HTML first so injected `<script>` etc. is inert.
 * Order: bold first (greedy, consumes **), then em (single *),
 * then code. Lookbehinds defend against leftover asterisks.
 */
export function inlineFormat(s: string): string {
  let out = escapeHtml(s);
  out = out.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, "<em>$1</em>");
  out = out.replace(/`([^`]+?)`/g, "<code>$1</code>");
  return out;
}

/** Confidence dot — small colored circle for the trust layer. */
export function dot(conf: Conf): string {
  return `<span class="conf-dot conf-${conf}" aria-label="${conf} confidence"></span>`;
}

/** ★ prefix when an item is exam-verified. */
export function star(verified: boolean | undefined): string {
  return verified ? `<span class="verified-star" title="exam-verified">★</span>` : "";
}

/** Small italic citation — "Slide 14", "Past midterm 2024 Q3", etc. */
export function cite(src: string): string {
  return `<span class="src">${escapeHtml(src)}</span>`;
}

/**
 * Wrap a block of HTML so it never breaks across columns. Critical for
 * formula blocks + trap callouts: a half-rendered formula at the bottom
 * of a column is worse than a tiny bit of trailing whitespace.
 */
export function noBreak(html: string): string {
  return `<div class="no-break">${html}</div>`;
}
