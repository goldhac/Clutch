/**
 * patterns.ts — the eight renderable blocks of a sheet.
 *
 * The six "content patterns" of the output spec (§4):
 *   1. Formula block       — formula + vars + when + trap + worked ex
 *   2. Compact table       — compare/contrast 2–4 items
 *   3. Memorize-cold table — direct-hit facts (we render concepts here)
 *   4. Worked example box  — folded inside the formula block's `ex`
 *   5. TRAP callout        — named "X is FALSE because Y"
 *   6. Q&A bullet line     — anticipated quiz patterns
 *
 * Plus two structural blocks unique to a full sheet:
 *   - Topics overview       — what's on this sheet (first column)
 *   - Verified Q Patterns   — surfaced FIRST when a past exam was
 *                              supplied (Build Plan §A.8 / OutSpec §7)
 *   - Exam format meta     — the cheap-meta-layer block (PRD §5)
 */
import type {
  Concept,
  ExamFormat,
  Formula,
  Question,
  SheetTable,
  Topic,
  Trap,
  VerifiedPattern,
} from "@/contract/sheet-content";
import { cite, dot, escapeHtml, inlineFormat, noBreak, star } from "./primitives";

/* ─── 1. Formula block (the workhorse) ───────────────────────────────
 * Renders multi-line formulas (engine in Step 6 can emit `\n`-separated
 * code-style formulas) as <pre>; single-line as the compact .formula
 * box. Wrapped in .topic so the whole block stays together when columns
 * break. Matches the proven build's <pre> + .topic technique. */
export function renderFormulaBlock(f: Formula): string {
  const isMultiline = f.formula.includes("\n");
  const formulaHtml = isMultiline
    ? `<pre class="formula">${escapeHtml(f.formula)}</pre>`
    : `<div class="formula">${escapeHtml(f.formula)}</div>`;
  // trap + ex are optional in the contract; skip the row entirely if
  // the engine didn't supply one (cleaner than rendering an empty row).
  const trapRow = f.trap
    ? `<div class="row trap-line"><span class="lbl">⚠ trap</span> ${inlineFormat(f.trap)}</div>`
    : "";
  const exRow = f.ex
    ? `<div class="row ex-line"><span class="lbl">Q</span> ${inlineFormat(f.ex)} ${cite(f.src)}</div>`
    : `<div class="row ex-line">${cite(f.src)}</div>`;
  const inner = `
    <div class="title">
      ${star(f.verified)}<strong>${inlineFormat(f.name)}</strong>${dot(f.conf)}
    </div>
    ${formulaHtml}
    <div class="row"><span class="lbl">vars</span> ${inlineFormat(f.vars)}</div>
    <div class="row"><span class="lbl">use</span> ${inlineFormat(f.when)}</div>
    ${trapRow}
    ${exRow}
  `.trim();
  return `<div class="formula-block topic">${inner}</div>`;
}

/* ─── 2. Compact compare/contrast table ────────────────────────────── */
export function renderCompareTable(t: SheetTable): string {
  const head = t.cols.map((c) => `<th>${inlineFormat(c)}</th>`).join("");
  const rows = t.rows
    .map(
      (r) =>
        `<tr>${r.map((cell) => `<td>${inlineFormat(cell)}</td>`).join("")}</tr>`,
    )
    .join("");
  return noBreak(`
    <section class="compare-table">
      <h3>${inlineFormat(t.title)}</h3>
      <table>
        <thead><tr>${head}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="src-line">${cite(t.src)}</div>
    </section>
  `);
}

/* ─── 3. Memorize-cold concepts table ────────────────────────────────
 * Uses the .kvtable variant (indigo first column) — the proven
 * memorize-cold style. */
export function renderConceptsTable(concepts: Concept[]): string {
  if (concepts.length === 0) return "";
  const rows = concepts
    .map(
      (c) => `
        <tr>
          <td class="term">${star(c.verified)}<strong>${inlineFormat(c.term)}</strong></td>
          <td>${inlineFormat(c.def)}</td>
          <td class="meta">${dot(c.conf)}${cite(c.src)}</td>
        </tr>
      `,
    )
    .join("");
  return `
    <section class="concepts">
      <h2>Memorize cold</h2>
      <table class="kvtable">
        <thead><tr><th>Term</th><th>Def</th><th>·</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
}

/* ─── 5. TRAP callout ──────────────────────────────────────────────── */
export function renderTrapCallout(t: Trap): string {
  // The ⚠ TRAP prefix is added by semantics.css ::before.
  return noBreak(
    `<div class="trap-callout">${inlineFormat(t.text)} ${cite(t.src)}</div>`,
  );
}

/* ─── 6. Q&A bullet line ───────────────────────────────────────────── */
/* Each question wrapped in .qq (indigo left rule, light-indigo bg) —
 * the proven question-box style. break-inside: avoid stays in CSS. */
export function renderQuestionLine(q: Question): string {
  return `
    <li class="qq">
      ${star(q.verified)}<span class="kind">${escapeHtml(q.kind)}</span>
      ${inlineFormat(q.q)} ${dot(q.conf)}${cite(q.src)}
    </li>
  `.trim();
}

export function renderQuestionsList(questions: Question[]): string {
  if (questions.length === 0) return "";
  return `
    <section class="qa-section">
      <h2>Likely questions</h2>
      <ul class="qa-list">
        ${questions.map(renderQuestionLine).join("\n")}
      </ul>
    </section>
  `;
}

/* ─── Topics overview ──────────────────────────────────────────────── */
export function renderTopicsOverview(topics: Topic[]): string {
  if (topics.length === 0) return "";
  const items = topics
    .map(
      (t) => `
        <li>
          ${star(t.verified)}<strong>${inlineFormat(t.name)}</strong>${dot(t.conf)}
          <span class="why">${inlineFormat(t.why)}</span>
          ${cite(t.src)}
        </li>
      `,
    )
    .join("");
  return noBreak(`
    <section class="topics">
      <h2>On this sheet</h2>
      <ul>${items}</ul>
    </section>
  `);
}

/* ─── Verified Q Patterns (FIRST when present) ─────────────────────── */
export function renderVerifiedPatterns(patterns?: VerifiedPattern[]): string {
  if (!patterns || patterns.length === 0) return "";
  const items = patterns
    .map(
      (p) =>
        `<li>${inlineFormat(p.pattern)} ${cite(p.src)}</li>`,
    )
    .join("");
  return `
    <section class="verified-patterns">
      <h2><span class="verified-star">★</span> Verified Q Patterns <span class="hint">(from a prior exam — drill these first)</span></h2>
      <ul>${items}</ul>
    </section>
  `;
}

/* ─── Exam format meta (cheap meta layer) ──────────────────────────── */
export function renderExamFormat(ef?: ExamFormat): string {
  if (!ef) return "";
  const parts: string[] = [`<strong>Format:</strong> ${inlineFormat(ef.mix)}`];
  if (ef.time) parts.push(`<strong>Time:</strong> ${inlineFormat(ef.time)}`);
  if (ef.openBook !== undefined)
    parts.push(`<strong>Open book:</strong> ${ef.openBook ? "yes" : "no"}`);
  if (ef.notes) parts.push(inlineFormat(ef.notes));
  return `<section class="exam-format">${parts.join(" · ")}</section>`;
}

/* ─── Formulas list ────────────────────────────────────────────────── */
export function renderFormulasList(formulas: Formula[]): string {
  if (formulas.length === 0) return "";
  return `
    <section class="formulas">
      <h2>Formulas</h2>
      ${formulas.map(renderFormulaBlock).join("\n")}
    </section>
  `;
}

/* ─── Tables list ──────────────────────────────────────────────────── */
export function renderTablesList(tables?: SheetTable[]): string {
  if (!tables || tables.length === 0) return "";
  return tables.map(renderCompareTable).join("\n");
}

/* ─── Traps list ───────────────────────────────────────────────────── */
export function renderTrapsList(traps: Trap[]): string {
  if (traps.length === 0) return "";
  return noBreak(`
    <section class="traps">
      <h2>Traps</h2>
      ${traps.map(renderTrapCallout).join("\n")}
    </section>
  `);
}
