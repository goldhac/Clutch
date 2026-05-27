# CramSheet

Upload your course materials, get an exam-calibrated **one-page reference sheet** that ranks what's most likely tested — with the formulas, traps, and likely questions your professor is most likely to use.

> Marketing says "cheat sheet." The product and the PDF say **"Exam Reference Sheet."**

## What this is

A web app that turns an uploaded exam pack (slides, review guides, past exams, homework, notes) into a dense, print-first one-page study sheet. The differentiator is **prioritization with evidence**: every item is ranked by likely testability and carries a confidence label + a source citation.

The hero artifact is the **MAX density** sheet — engineered density (4–5 columns, 5.5pt font floor) that a stressed student can scan in 5 seconds 48 hours before an exam.

## Scope

Building **Phase 0 + Phase 1 (v1)** only. Later phases (notes, flashcards, CLUTCH, course mode) are documented for context but deferred.

## Docs

The full spec lives in [`docs/`](docs/):

| File | What it covers |
|---|---|
| [`docs/01-PRD.md`](docs/01-PRD.md) | Product vision, strategy, scope, pricing, success metrics |
| [`docs/02-OUTPUT-SPEC.md`](docs/02-OUTPUT-SPEC.md) | The proven rendering + content standard — design tokens, density geometry, content patterns, prioritization rubric, render pipeline |
| [`docs/03-ROADMAP.md`](docs/03-ROADMAP.md) | Phases and acceptance gates |
| [`docs/04-CLAUDE-CODE-HANDOFF.md`](docs/04-CLAUDE-CODE-HANDOFF.md) | Stack, architecture, conventions, build order |
| [`docs/05-BUILD-PLAN.md`](docs/05-BUILD-PLAN.md) | The working phase document — locked decisions, data model, repo layout, phase tasks + gates |
| [`docs/06-V1-CHECKLIST.md`](docs/06-V1-CHECKLIST.md) | The single source of truth for v1 — every feature mapped to a step, per-step subtasks, always-on rules, explicit out-of-scope |

## Architecture (the separation that matters)

```
upload → extract text (+ file tags)
       → ENGINE:   model call → ranked content JSON (content + confidence + sources)
       → RENDERER: deterministic JSON → HTML sheet (tokens + density geometry)
       → PDF:      headless Chromium → verified one-page PDF
       → (optional) TIGHTEN: critique pass on JSON → patched JSON → re-render
```

The model owns **content + ranking**; deterministic code owns **layout**. The one-page constraint is guaranteed, not hoped for.

## Stack

- Next.js (App Router) + React + TypeScript (Tailwind for chrome only)
- Anthropic **Claude Sonnet** for content/ranking, behind a provider-agnostic `LLMClient` (structured JSON out, Zod-validated)
- **Supabase** (Postgres + Auth + Storage + RLS) for backend; **Stripe** for transaction-first pricing
- Headless Chromium via **Playwright** `page.pdf()` + in-process page-count verification
- PDF + plain-text parsing first; PPTX/DOCX deferred (interface stubbed)

See [`docs/05-BUILD-PLAN.md`](docs/05-BUILD-PLAN.md) for the full rationale and phase plan.

## Status

Project scaffolding in progress. See the roadmap for the Phase 0 gate.
