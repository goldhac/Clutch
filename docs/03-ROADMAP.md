# CramSheet — Phased Roadmap

The full vision is in `01-PRD.md`. This file sequences it. Each phase has an acceptance gate; do not start the next phase until the gate is met. The guiding principle: **ship one great hero artifact, validate it, then expand.** Do not become the bloated suite the strategy warns against.

---

## Phase 0 — Foundations (pre-feature)

**Goal:** the skeleton everything else hangs on.

- Project scaffold, stack, repo conventions (see `04-CLAUDE-CODE-HANDOFF.md`).
- File upload + storage; text extraction for **PDF + pasted text** first (PPTX/DOCX deferred within this phase if needed).
- The HTML-authoring → headless-Chrome → PDF render pipeline, with automated page-count verification.
- Design tokens + typography from `02-OUTPUT-SPEC.md` wired as CSS variables / a shared style module.

**Gate:** can take a hardcoded sample content object → render a one-page A4-landscape HTML sheet → export a verified one-page PDF.

---

## Phase 1 — v1: The hero artifact (LAUNCH)

**Goal:** the cheat sheet, end to end, good enough that a student uses it for a second exam.

**Build:**
1. **Upload + tagging** — drop files, tag each (slides / review / past exam / homework / notes / formula sheet). Single-file fallback solid first. Confidence meter that climbs with higher-weight files.
2. **Three controls** — exam type, density, priority. Nothing more.
3. **Prioritization engine** — the ranking rubric (§7 of output spec), confidence + source on every item, the verified-exam refactor path when a past exam is present.
4. **The six content patterns** — formula blocks, tables, memorize-cold, worked examples, named traps, Q&A lines.
5. **Three density renders** — Minimal / Standard / MAX, exact geometry from output spec; MAX as hero.
6. **Two-pass generation** — fast pass-1; optional one-tap "Tighten."
7. **Results 3-pane** — sheet (hero) + most-likely-tested rail + refine controls.
8. **Refine actions** — denser / more formulas / more examples / simpler / rebalance / switch density.
9. **Cheap meta layer** — exam-format + professor-notes block (low cost, high trust).
10. **PDF export** — print-first A4 landscape; PDF titled "Exam Reference Sheet."
11. **Pricing** — free preview (blurred sheet + top-5 Qs + top-8 concepts), single $4.99, 3-pack $9.99, sprint pass.

**Explicitly NOT in v1:** notes, Q&A docs, flashcards, CLUTCH, master/cross-topic, podcasts, tutor chat, spaced repetition, full editor, collaboration, mobile app.

**Gate (all must hold):**
- Generated MAX sheet passes the acceptance checklist in `02-OUTPUT-SPEC.md` §10.
- Verified one-page PDF export across all three densities.
- Every item shows confidence + source; no false-`high` on weak signal.
- A test user with a real (slides + review + past exam) pack rates the sheet "this is what I needed."
- Free→paid flow works; preview shows real value before payment.

---

## Phase 2 — The study kit expansion

**Goal:** deepen value for users who want more than the cram sheet — only after v1 retention is proven.

- **Notes** — distilled lecture-equivalent (B.1 recipe): TL;DR, bold-red key terms, analogies, worked examples, "Likely Q" callouts. Cut anything not in 2+ sources.
- **Q&A / Flashcards** — one content set, two renders: a Q&A doc (prof phrasing, each answer ends in a trap) and a flip-card mode. This *is* the flashcard feature — exam-shaped, not generic.
- **Per-artifact quality loop** — each new artifact gets its own acceptance checklist before it ships.

**Gate:** v1 shows repeat usage (second-exam generations) and acceptable unit economics before adding generation cost. Each new artifact independently passes its quality bar.

---

## Phase 2.5 — CLUTCH (depth mode)

**Goal:** serve the student who has *time* (day -7), the opposite of the cram sheet.

- The ~40-page "if you read one thing" walkthrough (B.5 recipe): numbered sections, TL;DRs, analogies, worked numerics, trap blockquotes, "Likely Exam Qs" per section, an "if you blank out" decision tree, a "last 15 minutes" checklist.
- Reuses the engine + tokens; markdown → HTML → PDF path.

**Gate:** Phase 2 stable; demand signal that users want depth, not just compression.

---

## Phase 3 — Course mode (multi-topic)

**Goal:** move from one-exam to whole-course.

- **Master cheat sheet** — multi-topic, color-coded with legend strip (the 2-page, multi-column course master).
- **Cross-topic / tradeoff** docs — "when to use X vs Y" comparison tables, sourced from the user's materials + quiz patterns.
- **Game-plan** — a study schedule for the final 7–14 days.

**Gate:** single-exam product mature; clear user pull toward course-level coverage.

---

## Cut (revisit only on evidence)

- **Podcasts** — the manual pipeline was NotebookLM-via-browser, one PDF at a time. Not scalable, a commodity (students can self-serve), and serves the lowest-urgency job (passive review). Revisit only if Phase 2 retention data shows passive review drives return visits — and only with an owned, scalable TTS pipeline, never a manual browser step.

---

## Cross-cutting (every phase)

- **Trust layer is P0 always** — confidence + sources are not optional polish.
- **One-page constraint is sacred** for the cheat sheet — verify page count programmatically on every render.
- **Keep the wedge** — every proposed feature is checked against "does this make us the bloated suite?" If yes, defer or cut.
