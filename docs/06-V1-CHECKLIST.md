# CramSheet — v1 Master Checklist

**Status:** active · **Owner:** Gold Nwobu · **Updated:** 2026-05-24

The single source of truth for **everything that has to ship in v1**, mapped to the 10 build steps from [`05-BUILD-PLAN.md`](05-BUILD-PLAN.md). Every feature from [`01-PRD.md`](01-PRD.md), [`02-OUTPUT-SPEC.md`](02-OUTPUT-SPEC.md), [`03-ROADMAP.md`](03-ROADMAP.md), [`04-CLAUDE-CODE-HANDOFF.md`](04-CLAUDE-CODE-HANDOFF.md), and the BUILD-LOG (in `reference/`) appears below with a checkbox + the step that ships it.

If a feature is not on this list, it is not in v1.

---

## A. Feature audit (every v1 feature, mapped to a step)

### A.1 — User flow (PRD §11)
| ✓ | Feature | Source | Step |
|---|---|---|---|
| ☐ | Landing page with one promise + a real (blurred) MAX sheet visible before signup | PRD §11.1, §14 | **10** |
| ☐ | Upload screen: drop files | PRD §11.2 | **8** |
| ☐ | Per-file tagging: slides / review / past_exam / homework / notes / formula_sheet | PRD §7 | **8** |
| ☐ | Single-file fallback path (one PDF still produces a sheet) | PRD §7 | **6, 8** |
| ☐ | Confidence meter that climbs as higher-weight files are added | PRD §7 | **8** |
| ☐ | Pre-generation controls: exam type / density / priority — **exactly 3** | PRD §12 | **8** |
| ☐ | Generate button → fast pass-1 sheet | PRD §11.4 | **6, 8** |
| ☐ | Results 3-pane: sheet (hero) + most-likely-tested rail + refine controls | PRD §11.5 | **8** |
| ☐ | PDF export, A4 landscape, PDF title = "Exam Reference Sheet" | PRD §11.7, Handoff rule 9 | **4, 8** |

### A.2 — The three artifacts in v1 (PRD §5)
| ✓ | Artifact | Source | Step |
|---|---|---|---|
| ☐ | Cheat sheet in 3 densities (Minimal / Standard / **MAX hero**) | PRD §5, §6 | **3, 5** (render) / **6** (engine) |
| ☐ | Exam-format + professor-notes meta block (cheap, high-trust) | PRD §5 | **6** (engine emits) / **3** (renderer) |
| ☐ | Most-likely-tested ranking view (its own surface) | PRD §5 | **7** (rail content) / **8** (UI placement) |

### A.3 — Density + page-count geometry (Output Spec §3 + Playbook §9)
| ✓ | Mode | CSS lock-ins | Step |
|---|---|---|---|
| ☐ | **Minimal** — 2 cols, 9pt body, ~70% coverage | OutSpec §3 | **5** |
| ☐ | **Standard** — 3 cols, 7.5pt body, ~85% coverage | OutSpec §3 | **5** |
| ☐ | **MAX** — 4 cols (allow 5), 5.7pt body (floor 5.5pt), 4.7pt pre, 4.9pt code, `column-fill: auto`, A4 landscape margins 0.16/0.14in, 92–97% coverage | OutSpec §3, §3.1, §3.2 | **3** (done) |
| ☐ | Engineered density rules: no paragraphs, ≤3 bullet levels, structural whitespace around formula boxes | OutSpec §3.2 | **3** (done) |
| ☐ | Color-first scanning; legend strip if multi-topic | OutSpec §3.2 / Playbook §9 | **3.5** (CSS ready) / **6** (engine wires up topic IDs) |
| ☐ | **1-page OR 2-page front/back** — `pages: 1 \| 2` in RenderOptions; 2-page version has duplicated color legend on both pages + topic-split (FRONT = topic-anchored lookup, BACK = NoSQL/deep-dive + meta tools per Playbook §9) | Playbook §9 (proven 2-page Big Data MAX) | **5** (renderer) / **6** (engine emits `topicsByPage`) |

### A.4 — The six content patterns (Output Spec §4)
Each pattern needs a renderer; the engine needs to emit content that maps to it.
| ✓ | Pattern | Use | Step |
|---|---|---|---|
| ☐ | **Formula block** (formula + var defs + when-to-use + 1-line trap + micro example Q) | any formula | **3** render / **6** engine |
| ☐ | **Compact compare/contrast table** | 2–4 items | **3** / **6** |
| ☐ | **Memorize-cold table** | direct-hit facts | **3** / **6** |
| ☐ | **Worked example box** | anything with numbers | **3** / **6** |
| ☐ | **TRAP callout** ("X is FALSE because Y") | false-statement gotchas | **3** / **6** |
| ☐ | **Q&A bullet line** (`Q → answer ✓ · distractor ✗`) | anticipated quiz patterns | **3** / **6** |

### A.5 — Design system (Output Spec §1–2)
| ✓ | Item | Step |
|---|---|---|
| ☐ | All 14 color tokens wired as CSS vars (primary indigo, indigo-2, strong red, emphasis teal, correct green, warning orange, exam gold, code bg/fg, light fill, light bg, border light, border mid) | **1** |
| ☐ | 10-color topic palette (cycled for multi-topic legend) | **1** |
| ☐ | Body font stack: `-apple-system, "Helvetica Neue", Arial, sans-serif` | **1** |
| ☐ | Code font stack: `"Menlo", "Consolas", monospace` | **1** |
| ☐ | Inline semantic conventions: `**bold**` → strong red; `*em*` → teal bold non-italic; `★` exam-verified; `✓`/`✗`; blockquote → orange trap callout | **3** |

### A.6 — Trust layer (P0; PRD §8, OutSpec §6)
| ✓ | Rule | Step |
|---|---|---|
| ☐ | Every ranked item carries `conf` ∈ {high/med/low} | **6** (engine) |
| ☐ | Every ranked item carries `src` (e.g. "Slide 14", "Review p2", "HW3 Q5", "Past exam 2024 Q5") | **6** |
| ☐ | `★` prefix when a prior exam directly confirms | **6** render / **3** |
| ☐ | **Zod rejects** any `high` confidence without `verified: true` or exam-grade `src` (trust rule enforced at the boundary, not in prompts) | **6** |
| ☐ | Renderer maps `conf` → green/gold/gray dot | **3** |
| ☐ | Source citation rendered as small italic per item | **3** |

### A.7 — Prioritization engine (OutSpec §7, PRD §8)
| ✓ | Capability | Step |
|---|---|---|
| ☐ | Scoring weights: past_exam > review_guide > repeated_homework > worked_examples > flagged_important (highest) | **6** |
| ☐ | Medium weights: repeated across lectures, in headings/summary, formula reused, concept tied to known mistake | **6** |
| ☐ | Lowest: single mention in notes only, background, filler | **6** |
| ☐ | Tag-weighted file ingestion (drives both score + confidence meter) | **6** |

### A.8 — Verified-exam refactor (highest-leverage; OutSpec §7, PRD §8)
| ✓ | Step | Step # |
|---|---|---|
| ☐ | Detect `past_exam`-tagged file → enter refactor path | **7** |
| ☐ | Catalogue each prior Q by topic, type (MCQ/select-all/code-completion/T-F/matching), trap pattern | **7** |
| ☐ | Compute topic heaviness → double down where prof asked most | **7** |
| ☐ | Map each prior Q → section that should answer it; find gaps | **7** |
| ☐ | Fill gaps: worked numbers / exact syntax / named FALSE traps / memorize tables for ordering Qs | **7** |
| ☐ | Surface `verifiedPatterns` block **first** in the sheet | **7** |

### A.9 — Two-pass generation (PRD §10, OutSpec §9)
| ✓ | Capability | Step |
|---|---|---|
| ☐ | **Pass 1** — fast generate + render; show immediately | **6** |
| ☐ | **Pass 2 "Tighten"** — critique scores /10, emits TODOs (missing traps, theory-only sections, under/overflow, weak conf), fixes or explicitly rejects, re-renders, re-verifies page count | **7** |

### A.10 — Refine actions (PRD §12, post-gen)
| ✓ | Action | Step |
|---|---|---|
| ☐ | denser / cleaner | **7, 8** |
| ☐ | more formulas / more examples / more conceptual | **7, 8** |
| ☐ | simpler wording | **7, 8** |
| ☐ | regenerate | **7, 8** |
| ☐ | switch density (Minimal / Standard / MAX without re-running engine) | **5, 8** |
| ☐ | one-tap **Tighten** | **7, 8** |

### A.11 — Inputs (PRD §7)
| ✓ | Format | Step |
|---|---|---|
| ☐ | **PDF** — first-class | **6** (parse) |
| ☐ | **Pasted text** — first-class | **6** |
| ☐ | **PPTX** — interface stubbed in v1; implement after PDF is solid | **6** (stub) |
| ☐ | **DOCX** — interface stubbed in v1; implement after PDF is solid | **6** (stub) |
| ☐ | Test pack present: `reference/exam-prep/maia-llms.pptx` + `oral-midterm-sample.docx` for parser tests when we ship pptx/docx | (later) |

### A.12 — PDF pipeline (OutSpec §8, Handoff)
| ✓ | Capability | Step |
|---|---|---|
| ☐ | Headless Chromium via Playwright `page.pdf()` (server route) | **4** |
| ☐ | A4 landscape, no header/footer chrome | **4** |
| ☐ | In-process `pdf-lib` page-count verification — **throws** if MAX > 1 page | **4** |
| ☐ | PDF metadata title = "Exam Reference Sheet" | **4** |
| ☐ | Same pipeline for all three densities | **5** |

### A.13 — Persistence (Supabase; Build Plan §3)
| ✓ | Table / capability | Step |
|---|---|---|
| ☐ | Supabase project provisioned; env vars wired | **9** |
| ☐ | `profiles` table (id, email, credits_remaining, created_at) | **9** |
| ☐ | `packs` (id, user_id, title, exam_type, created_at) | **9** |
| ☐ | `pack_files` (id, pack_id, storage_path, filename, tag, extracted_text, char_count) | **9** |
| ☐ | `sheets` (id, pack_id, user_id, density, content_json, pdf_path, page_count, score, status, created_at) | **9** |
| ☐ | `purchases` (id, user_id, stripe_session_id, product, amount_cents, status, created_at) | **9, 10** |
| ☐ | RLS policies scoped to `auth.uid()` on every table | **9** |
| ☐ | Supabase Storage bucket for raw uploads (private, signed URLs) | **9** |
| ☐ | Supabase Storage bucket for generated PDFs (private, signed URLs) | **9** |

### A.14 — Auth (Supabase Auth; Build Plan §1)
| ✓ | Capability | Step |
|---|---|---|
| ☐ | Email + Google OAuth sign-in | **9** |
| ☐ | Magic-link option (defer if friction) | **9** |
| ☐ | Server components read `auth.uid()` for RLS | **9** |
| ☐ | Sign-out + session refresh | **9** |

### A.15 — Pricing & payments (PRD §14; Stripe)
| ✓ | Capability | Step |
|---|---|---|
| ☐ | **Free preview** — blurred full MAX sheet + top-5 likely Qs + top-8 high-probability concepts | **10** |
| ☐ | **Single exam rescue** — $4.99 Stripe Checkout | **10** |
| ☐ | **3-exam pack** — $9.99 Stripe Checkout | **10** |
| ☐ | **Finals Sprint pass** — $12.99–14.99, 7 days / up to ~10 packs | **10** |
| ☐ | Stripe webhook → `purchases` row + `credits_remaining` increment | **10** |
| ☐ | Credit decrement on each generation; gate full sheet behind credits | **10** |
| ☐ | **Do NOT** ship: $19.99/mo lead, forced annual, split-by-output-type pricing, token economy | (anti-rule) |

### A.16 — Positioning (PRD §4; Handoff rule 9)
| ✓ | Rule | Step |
|---|---|---|
| ☐ | Marketing copy may say "cheat sheet" (landing, ads) | **10** |
| ☐ | In-product surfaces + PDF title say "Exam Reference Sheet" | **4, 8** |

---

## B. Per-step breakdown (the 10 steps, expanded)

Each step lists subtasks, files touched, demoable output, and the acceptance criterion. **Done** = subtasks all checked + demoable output works + acceptance hits.

### Step 1 — Scaffold + design tokens
**Goal:** repo boots, design system wired, ready to render anything.
- [ ] `npx create-next-app@latest` (TypeScript, App Router, Tailwind, ESLint)
- [ ] Install deps: `playwright`, `pdf-lib`, `zod`, `@anthropic-ai/sdk`, `@supabase/supabase-js`, `stripe` (install now, use later)
- [ ] Repo conventions: Prettier, basic ESLint rules
- [ ] Create folder skeleton from Build Plan §5
- [ ] `src/renderer/tokens.css` — all 14 design tokens + 10 topic colors as CSS vars
- [ ] `src/renderer/density.css` — three density blocks exactly per OutSpec §3 (including `column-fill: auto`, A4 landscape margins, font floors)
- [ ] Inline semantic styles (bold→red, em→teal-bold, blockquote→orange, ★, ✓/✗)
- [ ] `.env.example` with placeholders for Anthropic/Supabase/Stripe keys
**Demoable:** `npm run dev` → boot; a debug page shows all token swatches + a typography sample.
**Gate:** clean lint + the swatches render at the spec colors.

### Step 2 — The `SheetContent` contract + sample
**Goal:** the contract code owns, model fills.
- [ ] `src/contract/sheet-content.ts` — TS types from Build Plan §4
- [ ] Zod schema in the same file; **trust rule** enforced (no `high` without `verified:true` OR an exam-grade `src` pattern)
- [ ] `samples/sample-content.ts` — realistic stats sheet: ~10 formulas (CI, z-test, t-test, regression), z-vs-t compare table, 5+ named traps, 4+ worked examples, mixed conf levels, real-looking `src` citations, one `verifiedPatterns` block
**Demoable:** `tsc` clean; Zod parse of the sample passes.
**Gate:** intentionally bad samples (fake `high`) are rejected by Zod with the right error.

### Step 3 — MAX renderer
**Goal:** the hero geometry, end to end from a typed object.
- [ ] `src/renderer/sheet.ts` — pure function `SheetContent → HTML string`
- [ ] Six content-pattern renderers in `src/renderer/patterns/` (formula-block, compact-table, memorize-cold-table, worked-example, trap-callout, qa-line)
- [ ] Confidence dot component (green/gold/gray)
- [ ] `★` prefix for `verified: true`
- [ ] Source citation in italic per item
- [ ] `verifiedPatterns` block surfaced **first** when present
- [ ] Exam-format / professor-notes block rendered if `examFormat` present
- [ ] MAX-specific layout: 4-col `column-fill: auto`, structural whitespace around formula boxes
- [ ] Route `/sheet?density=max` that renders the sample
**Demoable:** browser shows a real MAX sheet from the sample object.
**Gate:** visual matches the proven `reference/exam-prep/Big_Data_Exam/00-meta/cheatsheet-maxdensity.html` in *kind* (the geometry + density feel).

### Step 4 — PDF + page-count verify
**Goal:** the one-page constraint is **guaranteed** in code.
- [ ] `src/lib/pdf-verify.ts` — `assertOnePage(buf): void` using `pdf-lib`
- [ ] `src/app/api/pdf/route.ts` — Playwright launches Chromium, renders the `/sheet` HTML, calls `page.pdf({ format: 'A4', landscape: true, margin: 0.14/0.16in, printBackground: true })`, sets PDF metadata title = "Exam Reference Sheet"
- [ ] Wire `assertOnePage` — throw if MAX > 1 page
- [ ] Save output to `/tmp` for local dev
**Demoable:** hit `/api/pdf?density=max`, download a one-page PDF titled "Exam Reference Sheet."
**Gate:** **Phase 0 gate (roadmap).** A deliberately overflowed sample throws; the normal sample renders one page.

### Step 5 — Minimal + Standard densities
**Goal:** all three densities off the same content object.
- [ ] CSS already in `density.css`; renderer reads `density` arg, applies wrapper class
- [ ] Page-count check still 1 for Minimal/Standard (they hold easily)
**Demoable:** three PDFs from one sample object, all one page.
**Gate:** acceptance checklist (OutSpec §10) passes for the sample at all three densities.

### Step 6 — Engine v1 (the moat)
**Goal:** real pack in → ranked `SheetContent` out → validated → rendered.
- [ ] `src/parse/pdf.ts` (`pdf-parse` or `pdfjs`), `src/parse/text.ts`, stubbed `pptx.ts` + `docx.ts` returning a "not supported yet" error
- [ ] `src/engine/llm-client.ts` — provider-agnostic interface: `generate({system, user, tools?}): Promise<{json, usage}>` ; Anthropic Sonnet implementation; prompt caching on the static system context
- [ ] `src/engine/prompt.ts` — the ranking prompt: encodes the rubric (OutSpec §7), the six content patterns, the trust rules, the hard "never feign high" instruction, the format JSON schema
- [ ] `src/engine/rank.ts` — orchestrator: ingest text+tags → call LLM → parse JSON → Zod validate → return `SheetContent`
- [ ] Emit `examFormat` block when source signal exists (cheap meta layer)
- [ ] Tag-weighted prompt: tell the model which file is which tag, with weights
- [ ] `src/app/api/generate/route.ts` — accepts files+tags (form-data), runs parse→engine→render→pdf
- [ ] CLI helper `scripts/gen.ts` for local pack-driven testing without the UI
**Demoable:** point `scripts/gen.ts` at `reference/exam-prep/Big_Data_Exam/{slides,quizzes,past-final}` → real generated MAX PDF.
**Gate:** generated sheet passes OutSpec §10 checklist on at least one ground-truth pack; no fake `high` confidence.

### Step 7 — Verified-exam refactor + Tighten + refine variants
**Goal:** the "9.1/10" pass and the highest-leverage feature.
- [ ] `src/engine/verified-exam.ts` — when any `past_exam` file present: catalogue Qs (topic, type, trap), compute heaviness, map to sections, identify gaps, fill with worked numbers / exact syntax / named FALSE traps / memorize-tables-for-ordering
- [ ] Engine outputs `verifiedPatterns` (renderer already places this first)
- [ ] `src/app/api/tighten/route.ts` — critique pass: scores /10, lists TODOs, applies fixes (or rejects with reason), re-validates, re-renders, re-asserts page count
- [ ] Refine action handlers (denser/more-formulas/etc.) — same engine, different priors passed in
- [ ] Most-likely-tested rail: derive top-N items from `SheetContent` (ranked by score + verified) — pure render, no extra call
**Demoable:** Big Data pack (with past final) generates pass-1, then Tighten lifts it; pass-2 is visibly tighter on the same content.
**Gate:** pass-1 ≈ 8.5/10 by self-score; pass-2 ≈ 9.1/10. Verified-patterns block leads the sheet.

### Step 8 — Upload UX + controls + results 3-pane
**Goal:** a non-technical user can drive it.
- [ ] `/generate` page: drag-and-drop file upload, per-file tag dropdown, **confidence meter** that ticks up by weight (`past_exam` fills most, `notes` least)
- [ ] Three controls only (exam type / density / priority); enforce — no fourth knob
- [ ] Loading state during generate (the engine call takes seconds)
- [ ] `/results/[sheetId]` 3-pane: sheet (hero, iframe to `/sheet` HTML for live re-render) + most-likely-tested rail + refine controls
- [ ] Density switcher (instant — pure CSS re-render, no engine call)
- [ ] Refine buttons fire the right API endpoints
- [ ] Export button → download verified PDF
- [ ] Error states (engine fail, parse fail, page-count fail) with retry
**Demoable:** stranger uploads pack, clicks generate, sees sheet, hits Tighten, exports PDF.
**Gate:** end-to-end flow works on 2+ different real packs without dev intervention.

### Step 9 — Supabase wiring (auth + persistence + storage)
**Goal:** users + their work persist; access is gated correctly.
- [ ] Supabase project + run `schema.sql` (the 5 tables from Build Plan §3 with RLS policies)
- [ ] `src/lib/supabase.ts` — server + client helpers
- [ ] Auth: email + Google OAuth via Supabase Auth UI components; sign-out
- [ ] Sign-up creates a `profiles` row with `credits_remaining = 0` (free preview only)
- [ ] Upload → Supabase Storage (raw bucket, private, signed URLs); `pack_files` row per file
- [ ] Generate writes `packs` + `sheets` rows; PDF saved to Storage (pdf bucket)
- [ ] Results page reads `sheets` row scoped by RLS
- [ ] "My sheets" list page (basic; user's history)
**Demoable:** sign up → upload → generate → log out → log back in tomorrow → sheet still there. Another user cannot access it.
**Gate:** RLS verified — second account literally cannot read first account's data via API.

### Step 10 — Free preview + Stripe + landing page (LAUNCH-READY)
**Goal:** money in, gates work, landing converts.
- [ ] Landing page: one promise + a real blurred MAX preview image + CTA
- [ ] Free preview mode: render MAX with `preview=true` → blur full sheet via CSS filter, show top-5 Qs + top-8 concepts in the clear, paywall everything else
- [ ] Stripe Checkout: 3 products (Single $4.99, 3-Pack $9.99, Sprint Pass $12.99–14.99)
- [ ] Webhook `src/app/api/stripe/webhook/route.ts` → write `purchases` row → `credits_remaining +=` (1 / 3 / 10)
- [ ] Sprint Pass: stamp expiry on `profiles` (7 days); credits decrement until expiry
- [ ] Credits decrement on each *completed* generation
- [ ] If `credits_remaining === 0` → free preview only; otherwise full sheet
- [ ] Pricing page + small reassurance copy ("one upload, one outcome — no subscription")
**Demoable:** stranger lands, sees preview, hits paywall, pays $4.99 (test card), gets full PDF.
**Gate:** **Phase 1 launch gate (roadmap):** all of A.1–A.16 checked; real pack passes OutSpec §10 checklist; free→paid flow works on test cards; no false-`high` confidence on any generated sheet.

---

## C. Always-on rules (cross-cutting; checked on every change)

| ✓ | Rule | Source |
|---|---|---|
| ☐ | Trust layer is P0 — confidence + source on every item; never feign `high` on weak signal | PRD §16, Handoff rule 4 |
| ☐ | One page is sacred — programmatic page-count check on every MAX render | Handoff rule 1 |
| ☐ | `column-fill: auto` on the multi-col sheet — target ~25% overflow, never balance | Handoff rule 2, OutSpec §3.1 |
| ☐ | MAX font floor = 5.5pt; engineered density not max characters | Handoff rule 3 |
| ☐ | Named traps ("X is FALSE because Y"), not vague advice | Handoff rule 5 |
| ☐ | Worked numeric example > bare formula | Handoff rule 6 |
| ☐ | HTML/CSS for the sheet, not markdown | Handoff rule 7 |
| ☐ | "Cheat sheet" marketing, "Exam Reference Sheet" in-product + PDF title | Handoff rule 9 |
| ☐ | Three controls only pre-generation — no fourth knob | Handoff rule 10 |
| ☐ | Every proposed feature checked against "does this make us the bloated suite?" — defer/cut if yes | Roadmap cross-cutting |
| ☐ | Model owns content+ranking; deterministic code owns layout | Handoff architecture |

---

## D. Explicitly NOT in v1 (anti-feature list, so we don't drift)

- Notes, flashcards, Q&A docs (Phase 2)
- CLUTCH walkthrough (Phase 2.5)
- Master / cross-topic / course mode (Phase 3)
- Podcasts (cut — revisit only on retention evidence)
- AI tutor chat
- Spaced repetition
- Full drag-and-drop editor
- LMS integrations
- Native mobile app
- Note libraries / course workspaces
- Collaboration / social features
- Handwriting-heavy OCR
- Monthly subscription as the lead offer ($19.99/mo)
- Forced annual billing
- Per-output-type pricing splits
- Opaque token economy

---

## E. What I need from you, and when

| When | What | Why |
|---|---|---|
| **Before Step 1** | Green light to start | You're reviewing now |
| **Before Step 6** | Anthropic API key in `.env.local` | Engine call |
| **Before Step 9** | Supabase project URL + anon/service keys | Auth + persistence |
| **Before Step 10** | Stripe account (test mode is fine to start) + product price IDs | Payments |
| **For the Phase 1 gate** | 30 min to test the real-pack flow end-to-end and give the "this is what I needed" verdict | Roadmap gate |

---

## F. How we track progress

This file is the tracker. As steps land, we check the boxes here in commits. Step 4 (Phase 0 gate) and Step 10 (Phase 1 launch gate) get explicit sign-off from you before we cross them.
