/**
 * sheet.ts — the orchestrator. SheetContent → HTML string.
 *
 * Pure, deterministic, no React, no DOM. Same function feeds:
 *   - the in-app /sheet route (browser preview)
 *   - the Step 4 PDF route (Playwright Chromium printToPDF)
 *
 * Returns a body fragment (a <div class="sheet density-…">). The /sheet
 * page imports the CSS and drops this into the DOM. The PDF route in
 * Step 4 will use a companion `renderSheetDocument` (added then) that
 * wraps this with inlined CSS for headless Chromium.
 */
import type { SheetContent } from "@/contract/sheet-content";
import { escapeHtml } from "./primitives";
import {
  renderConceptsTable,
  renderExamFormat,
  renderFormulasList,
  renderQuestionsList,
  renderTablesList,
  renderTopicsOverview,
  renderTrapsList,
  renderVerifiedPatterns,
} from "./patterns";

export type Density = "minimal" | "standard" | "max";

export interface RenderOptions {
  density: Density;
  /** Optional 5-column override for MAX (output spec §3 — never promise 7). */
  cols5?: boolean;
}

/**
 * PHASE 3 EXTENSION POINTS (not built in v1 — see docs/03-ROADMAP.md):
 *
 * The Phase 3 "course-master" artifact (2-page Letter-landscape, up to
 * 7 columns, color-coded topic banners with a legend strip) extends THIS
 * renderer without rewriting it. The plumbing already exists:
 *
 *   1. Density union → add "course-master" alongside minimal/standard/max,
 *      with its own CSS block in density.css.
 *   2. Layout option → add { pages?: 1 | 2 } to RenderOptions; sheet.css
 *      grows a multi-page variant gated on .pages-2 class.
 *   3. Topic color-coding → patterns.ts already maps via the
 *      h2.t-{blue|green|...} classes wired in semantics.css; just emit
 *      the matching class on each topic-scoped <h2>.
 *   4. Legend strip → a new pattern renderer that maps the topic
 *      palette to a row of color chips above the column flow.
 *
 * What we will NOT change: the SheetContent contract, the trust layer,
 * the six content patterns, the tokens. Model owns content; code owns
 * layout. Phase 3 is purely a layout add — content engine stays put.
 */

export function renderSheet(content: SheetContent, opts: RenderOptions): string {
  const { density, cols5 = false } = opts;
  const colsClass = `cols${density === "max" && cols5 ? " cols-5" : ""}`;

  // Header elements (h1, exam-format strip, verifiedPatterns block) live
  // INSIDE .cols and use column-span: all (via the .span-all class /
  // explicit `column-span` in sheet.css). Matches the proven build —
  // cleaner than wrapping a separate flex header above .cols, and the
  // column-fill: auto + page-height arithmetic is unaffected.
  //
  // Order rationale (mirrors the proven build):
  //   verifiedPatterns ▸ topics overview ▸ formulas (workhorse)
  //   ▸ tables (decision guides) ▸ concepts (memorize-cold)
  //   ▸ traps (what NOT to do) ▸ questions (drill set)
  const flow = [
    `<h1 class="span-all">${escapeHtml(content.title)}</h1>`,
    renderExamFormat(content.examFormat),
    renderVerifiedPatterns(content.verifiedPatterns),
    renderTopicsOverview(content.topics),
    renderFormulasList(content.formulas),
    renderTablesList(content.tables),
    renderConceptsTable(content.concepts),
    renderTrapsList(content.traps),
    renderQuestionsList(content.questions),
  ]
    .filter(Boolean)
    .join("\n");

  return `
    <div class="sheet density-${density}">
      <div class="${colsClass}">
        ${flow}
      </div>
    </div>
  `;
}
