# CramSheet — Claude Code Handoff

Kickoff instructions for building CramSheet. Read `01-PRD.md`, `02-OUTPUT-SPEC.md`, and `03-ROADMAP.md` first — this file tells you how to start and how to work.

---

## What you're building

A web app where a student uploads course materials and gets an **exam-calibrated one-page reference sheet** in three density modes (Minimal / Standard / **MAX** = hero). The differentiator is **prioritization with evidence** — every item ranked by likely testability, with a confidence label and a source citation. The proven output standard is fully specified in `02-OUTPUT-SPEC.md`; build to it.

You are building **Phase 0 + Phase 1 only** for now (see roadmap). Everything else is documented for context but deferred.

## Recommended stack

- **Frontend:** Next.js (App Router) + React + TypeScript. Tailwind for layout chrome; **the sheet itself is authored as HTML/CSS using the exact tokens + geometry in the output spec** (not Tailwind utility soup — the column/print CSS must be precise).
- **Generation:** Anthropic API (Claude). Structured JSON out (the sheet content object), then deterministic rendering of that object to the HTML sheet. Keep the model responsible for *content + ranking*, and keep *layout* in deterministic code.
- **PDF:** headless Chromium via Puppeteer/Playwright `printToPDF` (server route). Verify page count after render.
- **Storage:** start minimal — object storage for uploads, a light DB (Postgres/SQLite to start) for sheets + metadata.
- **Parsing:** PDF + plain text first (e.g. `pdf-parse` / `pdfjs`). PPTX/DOCX are a known cost — stub the interface, implement after the PDF path is solid.

> If you (Gold) prefer a different stack, swap freely — the only hard requirements are: deterministic HTML/CSS rendering of the sheet to the output-spec geometry, headless-Chromium PDF with page-count verification, and a clean separation between "model produces ranked content JSON" and "code renders it."

## Architecture (separation that matters)

```
upload → extract text (+ file tags) 
       → ENGINE: model call → ranked content JSON  (content + confidence + sources)
       → RENDERER: deterministic JSON → HTML sheet (tokens + density geometry)
       → PDF: headless Chromium → verified one-page PDF
       → (optional) TIGHTEN: critique pass on JSON → patched JSON → re-render
```

**Why this split:** the model is good at *deciding what matters and phrasing it tersely*; it is unreliable at *pixel-precise one-page layout*. Let code own the layout so the one-page constraint and density geometry are guaranteed, not hoped for.

## The content JSON contract

The engine emits an object the renderer consumes. Suggested shape:

```ts
type Conf = "high" | "med" | "low";

interface SheetContent {
  title: string;
  examFormat?: { mix: string; time?: string; openBook?: boolean; notes?: string };
  topics:   { name: string; why: string; src: string; conf: Conf; verified?: boolean }[];
  formulas: { name: string; formula: string; vars: string; when: string;
              trap: string; ex: string; src: string; conf: Conf; verified?: boolean }[];
  concepts: { term: string; def: string; src: string; conf: Conf }[];
  tables?:  { title: string; cols: string[]; rows: string[][]; src: string }[];
  traps:    { text: string; src: string }[];      // "X is FALSE because Y"
  questions:{ q: string; kind: "MCQ"|"short"|"problem"|"T/F"; conf: Conf }[];
}
```

Renderer maps this → the six content patterns in the output spec. Confidence → colored dot. `verified` → ★ prefix. `src` → small italic citation.

## Hard rules (from the proven build — do not deviate)

1. **One page is sacred** for the cheat sheet. Programmatically verify page count on every PDF render; if MAX overflows, the tighten/trim path must bring it back to one page.
2. **`column-fill: auto`** for the multi-column sheet. Target ~25% content overflow then truncate at the page boundary — never balance (causes bottom whitespace).
3. **MAX font floor = 5.5pt.** Engineered density, not max characters. No paragraphs; ≤3 bullet levels; structural whitespace around formula boxes.
4. **Trust layer is P0.** Every item gets confidence + source. Never emit `high` on single-source/no-exam signal.
5. **Named traps**, not vague advice: "X is FALSE because Y."
6. **Worked numeric example > bare formula** wherever numbers apply.
7. **Author the sheet as HTML/CSS**, not markdown — markdown can't express the column layout + inline classes.
8. **Two-pass:** fast pass-1, optional one-tap "Tighten" critique pass.
9. **Positioning:** marketing copy may say "cheat sheet"; **in-product + PDF title say "Exam Reference Sheet."**
10. **Three controls only** pre-generation; no full editor in v1.

## Suggested build order (Phase 0 → 1)

1. Render pipeline first: hardcode a `SheetContent` sample → HTML (MAX geometry) → verified one-page PDF. Prove the hardest constraint before anything else.
2. Wire the three density renders off the same sample object.
3. Add the engine: upload text/PDF + tags → model call → `SheetContent` JSON. Validate against the contract.
4. Add confidence + source rendering; the most-likely-tested rail.
5. Add the verified-exam refactor path (when a `past exam` file is tagged).
6. Add refine actions + the two-pass "Tighten."
7. Upload UX, file tagging, confidence meter.
8. Free preview + pricing gate.
9. Run the acceptance checklist (`02-OUTPUT-SPEC.md` §10) against real packs.

## Definition of done for v1

The Phase 1 gate in `03-ROADMAP.md` is met: a real (slides + review + past exam) pack produces a MAX sheet that passes the §10 acceptance checklist, exports as a verified one-page A4-landscape PDF across all three densities, shows confidence + source on every item, and a test user reaches "this is exactly what I needed."

## Test materials

Gold has real, validated packs to test against (NLP CS6320 + Big Data CS6360 — slides, prior quizzes, prior final, class notes). Use these as the first real-pack acceptance tests; they're ground-truth because the manual output was already verified against the actual exams.
