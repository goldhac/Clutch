# CramSheet — Build Plan (the working phase document)

**Status:** active · **Owner:** Gold Nwobu · **Updated:** 2026-05-24

This is the **engineering execution plan**. The product-level "what ships when" lives in [`03-ROADMAP.md`](03-ROADMAP.md); this file is the *how* — locked technical decisions, the data model, the repo layout, and a phase-by-phase task list with concrete acceptance gates. When this conflicts with a generic instinct, follow the proven standard in [`02-OUTPUT-SPEC.md`](02-OUTPUT-SPEC.md).

Read order for anyone new: [`01-PRD.md`](01-PRD.md) → [`02-OUTPUT-SPEC.md`](02-OUTPUT-SPEC.md) → [`03-ROADMAP.md`](03-ROADMAP.md) → [`04-CLAUDE-CODE-HANDOFF.md`](04-CLAUDE-CODE-HANDOFF.md) → this file.

---

## 0. The one thing that must never break

**One page is sacred, and trust is the moat.** Every render is page-count-verified in code; every ranked item carries a confidence dot + a real source citation; we never emit `high` confidence on weak (single-source, no-exam) signal. If a phase threatens either of these, the phase is wrong, not the rule.

---

## 1. Locked decisions

| Area | Decision | Why |
|---|---|---|
| **Framework** | Next.js (App Router) + React + TypeScript | Matches handoff; one codebase for UI + API routes. |
| **Styling** | Tailwind for app chrome **only**; the sheet is hand-authored HTML/CSS with the exact tokens + geometry | Column/print CSS must be pixel-precise — Tailwind utility soup can't express it. |
| **LLM engine** | Anthropic **Claude Sonnet** (default) behind a provider-agnostic `LLMClient` interface | The ranking/confidence judgment is the moat; Sonnet ≈ Opus quality at far lower cost. Interface lets us A/B Haiku/Gemini for a budget tier on real packs. |
| **Engine output** | Structured JSON (`SheetContent`), validated with **Zod** before render | Model owns content+ranking; code owns layout. Untrusted output gets validated at the boundary. |
| **PDF** | Headless Chromium via **Playwright** `page.pdf()` (server route) | Full CSS control; doubles as the test runner. Page count verified after every render. |
| **Page-count verify** | `pdf-lib` in-process | No python dependency; same guarantee as the spec's `pypdf` check. |
| **Backend / DB / Auth / Storage** | **Supabase** (Postgres + Auth + Storage + RLS) | Collapses auth + DB + file storage + row-level security into one managed service. We don't hand-build boring infra. Engine/renderer don't care where bytes live. |
| **Payments** | **Stripe** (Checkout + webhooks) | Transaction-first pricing ($4.99 single, $9.99 3-pack, sprint pass). Supabase has no payments; Stripe is the standard pair. |
| **Parsing** | PDF + pasted text first; PPTX/DOCX **stubbed behind one interface**, implemented after PDF path is solid | Known engineering cost; don't block the hero on it. We have a `.pptx` + `.docx` in the test packs for when we do. |

### Why Supabase over the handoff's "SQLite to start"
The handoff said start minimal *and explicitly allowed swapping*. For a real product we already know we need: user accounts (auth), per-user uploaded files (storage), saved sheets + purchase records (DB), and access control (a free user must not read a paid sheet — RLS). Supabase gives all four out of the box and scales past launch, so we skip a throwaway SQLite step. The clean engine/renderer split means storage is an implementation detail either way.

> **MCP note:** there is currently **no Supabase MCP** connected in this environment. It isn't required — we use the `supabase-js` SDK + the Supabase dashboard for migrations. If we later want Claude to run migrations/queries directly, we can connect one then.

---

## 2. Architecture

```
upload (browser)
  → Supabase Storage (raw files) + Postgres row (pack + per-file tag)
  → PARSE      extract text per file (PDF/text now; pptx/docx later)
  → ENGINE     LLMClient(Claude Sonnet) → ranked SheetContent JSON
               (content + confidence + source on every item;
                verified-exam refactor path when a past exam is tagged)
  → VALIDATE   Zod parse → reject/repair invalid model output
  → RENDERER   deterministic SheetContent → HTML sheet (tokens + density geometry)
  → PDF        Playwright Chromium → page-count-verified one-page PDF → Storage
  → (optional) TIGHTEN  critique pass on JSON → patched JSON → re-render + re-verify
```

**The split that matters:** the model decides *what matters and phrases it tersely*; deterministic code owns *layout*, so the one-page constraint and density geometry are guaranteed, not hoped for.

---

## 3. Data model (Supabase / Postgres)

Minimal v1 schema. All tables RLS-scoped to `auth.uid()`.

```
profiles        id (=auth user), email, created_at, credits_remaining
packs           id, user_id, title, exam_type, created_at
pack_files      id, pack_id, storage_path, filename, tag, extracted_text, char_count
                # tag ∈ {slides, review, past_exam, homework, notes, formula_sheet}
sheets          id, pack_id, user_id, density, content_json (SheetContent),
                pdf_path, page_count, score, status, created_at
                # status ∈ {pass1, tightened}; one row per (pack, density) render
purchases       id, user_id, stripe_session_id, product, amount_cents, status, created_at
```

The `confidence meter` (PRD §7) is derived from `pack_files.tag` weights — no separate table.

---

## 4. The content contract

Base is the handoff's `SheetContent`, with the two additions the output spec implies. Density is a **render argument**, not part of the content (same ranked content renders at all three densities).

```ts
type Conf = "high" | "med" | "low";

interface RankedItem { src: string; conf: Conf; verified?: boolean }   // trust layer on every item

interface SheetContent {
  title: string;                                   // PDF title = "Exam Reference Sheet"
  examFormat?: { mix: string; time?: string; openBook?: boolean; notes?: string };
  verifiedPatterns?: { pattern: string; src: string }[];  // surfaced FIRST when a past exam exists
  topics:    ({ name: string; why: string } & RankedItem)[];
  formulas:  ({ name: string; formula: string; vars: string; when: string;
                trap: string; ex: string } & RankedItem)[];
  concepts:  ({ term: string; def: string } & RankedItem)[];
  tables?:   { title: string; cols: string[]; rows: string[][]; src: string }[];
  traps:     { text: string; src: string }[];      // "X is FALSE because Y"
  questions: ({ q: string; kind: "MCQ"|"short"|"problem"|"T/F" } & RankedItem)[];
}
```

**Zod enforces the trust rule** (not just docs): reject any item with `conf: "high"` that has no `verified: true` and no exam-grade `src`. Weak signal must downgrade to `low`/"possible".

Renderer mapping: `conf` → colored dot (green/gold/gray) · `verified` → ★ prefix · `src` → small italic citation · the six patterns (§4 of output spec) → their renderers.

---

## 5. Repo structure

```
cramsheet/
  docs/                          # specs + this plan (committed)
  reference/                     # GITIGNORED — ground-truth test packs + BUILD-LOG (never pushed)
  src/
    app/
      page.tsx                   # landing (blurred MAX preview before signup)
      generate/page.tsx          # upload + tag + 3 controls
      results/page.tsx           # 3-pane: sheet + most-likely-tested rail + refine
      api/generate/route.ts      # parse → engine → validate → render
      api/pdf/route.ts           # SheetContent → HTML → Chromium → verified PDF
      api/tighten/route.ts       # critique pass
      api/stripe/webhook/route.ts
    engine/
      llm-client.ts              # provider-agnostic; Claude Sonnet default
      prompt.ts                  # ranking + verified-exam-refactor prompts (prompt-cached)
      rank.ts                    # orchestration → SheetContent
      verified-exam.ts           # past-exam refactor (first-class path)
    renderer/
      sheet.ts                   # SheetContent → HTML
      tokens.css                 # design tokens as CSS vars (spec §1–2)
      density.css                # minimal / standard / MAX geometry (spec §3)
      patterns/                  # the 6 content-pattern renderers
    contract/sheet-content.ts    # TS type + Zod schema (trust rule enforced here)
    parse/{pdf,text,pptx,docx}.ts
    lib/{supabase,stripe,pdf-verify}.ts
  samples/sample-content.ts      # hardcoded SheetContent for Phase 0
  tests/
```

---

## 6. Phases, tasks, and gates

### Phase 0 — Render pipeline (prove the hardest constraint first)
No API key, no auth, no test packs needed. Just prove we can guarantee a one-page sheet.

- [ ] Scaffold Next.js + TS + Tailwind; wire `tokens.css` + `density.css` from spec §1–3.
- [ ] Hardcode `samples/sample-content.ts` — a realistic stats sheet (CI formulas, z-vs-t table, named traps, a few Qs, mixed confidence + sources).
- [ ] `renderer/sheet.ts`: deterministic `SheetContent → HTML` for **MAX** geometry (4 cols, `column-fill: auto`, 6.1pt, formula boxes, ● confidence dots, ★, citations).
- [ ] `api/pdf/route.ts`: HTML → Playwright Chromium → A4 landscape PDF.
- [ ] `lib/pdf-verify.ts`: assert exactly **1 page**; throw if not.
- [ ] Render the **same sample object** through Minimal (2col/9pt) and Standard (3col/7.5pt).

**Gate:** hardcoded sample → one-page A4-landscape HTML → **verified one-page PDF across all three densities**. Show the PDFs. (Roadmap Phase 0 gate.)

### Phase 1 — The hero artifact, end to end (LAUNCH)
Build order mirrors handoff §"suggested build order"; gates mirror roadmap Phase 1.

- [ ] **Engine v1:** `parse` (PDF + text) → `LLMClient` (Claude Sonnet) → `SheetContent` → Zod validate. Prompt-cache the spec/system context.
- [ ] **Trust rendering:** confidence dots + source citations wired; the **most-likely-tested rail** in the results pane.
- [ ] **Verified-exam refactor:** when a `past_exam` file is tagged, run the §7 refactor; surface `verifiedPatterns` first.
- [ ] **Refine + two-pass:** denser / more formulas / more examples / simpler / rebalance / switch density; one-tap **Tighten** (critique → patched JSON → re-render + re-verify). Target 8.5 → 9.1.
- [ ] **Upload UX:** drop + per-file tag + confidence meter that climbs with higher-weight files; single-file fallback rock-solid first.
- [ ] **Auth + persistence:** Supabase auth; packs/files/sheets persisted with RLS.
- [ ] **Pricing gate:** free preview (blurred sheet + top-5 Qs + top-8 concepts) → Stripe Checkout ($4.99 single / $9.99 3-pack / sprint pass) → credits in `profiles`.
- [ ] **Export:** print-first A4 landscape PDF; PDF title = "Exam Reference Sheet."

**Gate (all must hold):**
- MAX sheet passes the §10 acceptance checklist in the output spec.
- Verified one-page PDF across all three densities.
- Every item shows confidence + source; no false-`high` on weak signal.
- Free→paid flow works; preview shows real value before payment.
- A real pack (slides + review + past exam) produces a sheet a test user rates **"this is exactly what I needed."**

### Deferred (documented, not built in v1)
Notes, Q&A/flashcards, CLUTCH, master/cross-topic, course mode, podcasts (cut), tutor chat, spaced repetition, full editor, collaboration, mobile app, PPTX/DOCX parsing (stub the interface now, implement after PDF is solid).

---

## 7. The quality loop (our unfair advantage)

We have **ground-truth packs** in `reference/` — Gold's real grad CS courses where the manual output was already validated against the actual exams:

- **NLP (CS 6320, Prof. Ouyang):** 24 lecture PDFs + manual notes/cheatsheets/Q&A + CLUTCH + a `.pptx` and `.docx` (parser test fodder).
- **Big Data (CS 6360, Prof. Nagar):** 14 topics + **6 prior quizzes + 9 class-note transcripts + prior final exam** + the centerpiece **`cheatsheet-maxdensity.html/.pdf`** (the proven MAX output) + CLUTCH.

Every engine change is scored against these: does it surface the same high-yield items the hand-built sheet did? Right confidence calls? Real citations (no invented "Slide 14")? One-page MAX hold? This is also how we **settle the model-tier question with data** — run Sonnet vs Haiku vs a cheap external model on these packs and let the scores pick the budget tier, instead of guessing.

The Big Data `cheatsheet-maxdensity` is the **target output** for the Phase 1 acceptance demo.

---

## 8. Cost & model strategy

- **Default engine:** Claude Sonnet. At $4.99/generation, even a large pack is cents of tokens — cost is not a reason to drop below frontier-tier for the *judgment* step.
- **Prompt caching:** the large, repeated system/spec context is cached → big savings on multi-density + tighten runs over the same pack.
- **Cheaper where safe:** Haiku/Gemini are candidates for mechanical sub-tasks (extraction cleanup, the cheap meta layer) and a future budget tier — but only after they pass the §7 ground-truth bar. They fail most often at exactly the trust layer (fake confidence, invented sources), which is the one place we won't gamble.
- **Two-pass economics:** pass-1 always runs; Tighten is opt-in (one tap), so we only pay for the expensive critique when the user wants it.

---

## 9. Open items to confirm

- Anthropic API key (needed at Phase 1 engine step, not Phase 0).
- Supabase project + Stripe account (needed at Phase 1 auth/pricing steps).
- Playwright vs Puppeteer (leaning Playwright) and Prisma vs raw `supabase-js` for DB access.
