# CramSheet — STATE & HANDOFF (read this first)

**This is the continue-here document.** A fresh session should read this top-to-bottom, then go straight to §7 "Next action." Everything below is current as of commit `40fd440` (R1 complete). Update this file's §3 status table + §7 whenever a phase lands.

Owner: **Gold Nwobu** (`akporkofi11@gmail.com`). Repo: **`/Users/goldnwbou/Documents/Clutch/`** (folder is "Clutch", product is **CramSheet**). GitHub: **https://github.com/goldhac/Clutch** (public). Live: **https://cramsheet-production.up.railway.app** (Railway, auto-builds on `railway up`).

---

## 1. What CramSheet is (the 60-second version)

A web app: a student uploads exam materials (slides, review guides, past exams, notes) → gets **one dense, printable, A4-landscape "Exam Reference Sheet"** that decides what's most likely tested and **proves it** — every item carries a **confidence dot** (green/gold/gray), a **★** if a past exam confirmed it, and a **real source citation**.

- **The moat is trust, not AI access.** Wrong prioritization kills retention, so the Zod schema *rejects* fake `high` confidence, and a sanitize pass strips `verified` when a past-exam PDF is image-only. The ability to say "this is on the exam, here's why" IS the product.
- **Positioning:** marketing says "cheat sheet" (what students search); product surface + PDF say "Exam Reference Sheet" (defuses the cheating-accusation fear). Enforced: "cheat sheet" appears ONLY on marketing pages + code comments.
- **Voice:** decisive, imperative, no hedging. "Read NOT and EXCEPT twice. They flip the answer."
- **Pricing:** transaction-first, never subscription-led. Free preview → Single $4.99 → 3-Pack $9.99 → Sprint Pass $14.99/7d. Credits never expire.
- **Scope:** v1 = the single hero artifact + cheap meta. NOT a study suite (that's the crowded loser). Notes/flashcards/CLUTCH/course-mode are roadmap, gated on the hero proving out.

Full detail: [`01-PRD.md`](01-PRD.md).

---

## 2. Architecture & stack

```
upload+tags → ENGINE (Gemini, once) → full ranked pool (SheetContent JSON)
            → STORE pool + scoring ctx (sessionStorage now → Supabase later)
            → RELEVANCE (deterministic, code, per density — no engine call):
                 A score → B compose (mix + fill) → C FitController (measure)
            → RENDERER (React <Sheet>, fixed A4-landscape box)
            → PDF (Playwright Chromium → verified one page)
```
**The split that matters:** the model owns *what matters + terse phrasing*; deterministic code owns *layout + selection*. One page + the right mix are guaranteed, not hoped for.

| Layer | Choice | Why |
|---|---|---|
| Framework | Next 15 App Router + React 19 + TS strict + Tailwind v4 | one codebase, RSC |
| LLM | **Google Gemini** (`gemini-2.5-pro` default) behind provider-agnostic `LLMClient` | owner's key; swap-able. Key in `.env.local` (from `~/.zshrc` `GEMINI_API_KEY`) |
| Backend | **Supabase** (auth+Postgres+Storage+RLS) — *SDK installed, NOT wired yet* | collapses auth+db+files |
| Payments | **Stripe** — *installed, NOT wired* | transaction-first pricing |
| PDF | **Playwright** Chromium + `pdf-lib` page-count | no python dep |
| Parsing | `pdf-parse` (import `pdf-parse/lib/pdf-parse.js` — the bare import crashes `next build`) + pasted text; PPTX/DOCX stubbed | |
| Design | ink-primary + iris `--signal` + editorial `--salmon`; Geist / Newsreader / Geist Mono; light-mode only | adopted from `design/` handoff wholesale |

Repo map: `src/app/{(marketing),generate,results,library,auth,sheet,debug,api}` · `src/components/{ui,trust,sheet}` · `src/engine` (llm-client, gemini-client, prompt, rank, sanitize) · `src/renderer` (tokens/semantics/density/sheet `.css` + primitives.ts) · `src/contract/sheet-content.ts` (Zod) · `src/parse` · `src/lib/pdf-verify.ts` · `samples/` · `scripts/` · `reference/` (gitignored ground-truth packs).

---

## 3. Status — what's done, live, and pending

**Legend:** ✅ done+committed · 🟡 in progress · ⬜ not started

### Foundation & engine (Phase 0–1 core) — all ✅ live
| | |
|---|---|
| Scaffold, design tokens, contract + Zod trust rule | ✅ |
| MAX renderer + 6 content patterns (React components) | ✅ |
| PDF route + page-count enforcement ("one page sacred") | ✅ |
| **Engine (Gemini)** — parse → prompt → rank → Zod → sanitize | ✅ (real sheets from real packs; citation audit 100% on Big Data pack) |
| Minimal upload UI + results + CLI (`gen:cli`) | ✅ |

### Design implementation (D1–D6) — all ✅ live
| Phase | |
|---|---|
| D1 tokens + Geist/Newsreader/Geist Mono | ✅ |
| D2 20-component design system (`/debug/primitives`) | ✅ |
| D3 marketing home (blurred-sheet hero) + pricing + faq | ✅ |
| D4 app screens (generate, dark loading, results, library, auth) + density rename `minimal→essentials`, `standard→balanced` | ✅ |
| D5 sheet editorial redesign + fixed-A4 fill-to-page | ✅ |
| D6 favicon, OG tags, copy sweep, deploy | ✅ |

### Relevance & Fit system (R1–R6) — the CURRENT work
The one thing left half-done. Spec: [`09-RELEVANCE-AND-FIT.md`](09-RELEVANCE-AND-FIT.md) (v2, passed a 3-lens adversarial review; full findings in `reviews/09-review-raw.json`).
| Phase | Status | What |
|---|---|---|
| **R1** Relevance core (scorer + composer + estimator, pure) + 22-check gate | ✅ done (`40fd440`) | `src/components/sheet/relevance.ts` + `scripts/check-relevance.ts` (`npm run check:relevance`, 22/22) |
| **R2** Store scoring ctx (files/tags/examType/priority) with the pool | ✅ done | stash + results Stash carry `ctx`; `/results` scores with it |
| **R3** Sheet wiring + `FitController` | ✅ done | `FittedSheet.tsx` — measures, trims lowest-scored, gap-fills bench; per-item right-edge clip test |
| **R4** PDF pool transport | ✅ done | `pool-store.ts` + `/print` + `/api/pdf` POST + real clip verifier (422 `ClipError`) |
| **R5** Engine POOL TARGET prompt | ✅ done | pool-supply prompt + `deepenSheet()` top-up passes (`gen-cli --topup=N`) |
| **R6** Front/back 2-page | ✅ done | FRONT and BACK both 7-col MAX — one continuous sheet (see §4) |

**Not started (post-relevance):** Supabase auth+persistence (auth/library/pricing are UI shells today), Stripe paywall, real SSE loading progress.

---

## 4. Decisions locked (don't re-litigate)

- **FRONT and BACK are BOTH 7-col MAX** — one continuous sheet, two sides of a single page (user decision 2026-07-28, OVERRIDES the earlier BACK=Balanced call; matches the proven cheatsheet-maxdensity.html). Pool target ~2.5× one page.
- **Trap scoring = scorer-side** (traps base 35, or 50 if exam-cited; tables 20). No `conf`/`verified` added to `TrapSchema`. (Phase-2 option only.)
- **The relevance model = "keep adding by rank until full."** All items ranked (verified→high→med→low), included; the fixed A4 box + bigger type per density decide how many show. **The page is ALWAYS full, never dead space, always top-ranked first.** Do NOT reintroduce hard item caps that cause underflow.
- **User controls move the mix SHARES** (±percentage-points), not just per-section scores (constant multipliers don't change within-section order).
- **Density = a type-size choice**, not a different content set. max 4-5col/5.7pt · balanced 3col/8pt · essentials 2col/9pt.
- Marketing/product copy split (see §1). Light mode only. Model owns content, code owns layout.

---

## 5. Gotchas (things that WILL bite a fresh session)

1. **Machine build speed:** local `next build` can take 10+ min when Google Drive / iCloud sync thrash disk I/O (project is under `~/Documents`, which iCloud may sync). Prefer the dev server + browser screenshots for iteration; full build only before deploy. Pause Google Drive/iCloud sync if builds crawl.
2. **Dev server staleness:** changes to `tsconfig.json` paths, `next.config.ts`, `postcss.config.mjs`, or a project move need a **`npm run dev` restart** — hot reload doesn't cover config.
3. **`pdf-parse`:** import `pdf-parse/lib/pdf-parse.js`, NOT `pdf-parse` (the index shim opens a test file at load → crashes `next build`).
4. **Playwright ↔ Docker version:** `Dockerfile` base image tag MUST equal the installed `playwright` npm version (e.g. `v1.60.0-jammy`) or the PDF route 500s "Executable doesn't exist." Same for local: re-run `npx playwright install chromium` after a Playwright bump.
5. **PDF route upstream:** uses `http://127.0.0.1:${PORT}` internally, NOT `req.url.origin` (behind Railway's TLS proxy the origin is `https://localhost` → `ERR_SSL_PROTOCOL_ERROR`).
6. **No root `page.tsx`:** home lives in `src/app/(marketing)/page.tsx`; there MUST be a `src/app/not-found.tsx` or `next build` fails prerendering `/404` with a misleading `<Html> import` error.
7. **Multicol overflow is HORIZONTAL** (fixed-height `column-fill:auto` + `overflow:hidden`): a clipped item lands in an off-screen column to the RIGHT, never "below." Any fit measurement MUST test `rect.right > cols.right`. (This sank the first fit design.)
8. **Browser MCP re-asks which browser** most turns — expect an AskUserQuestion before screenshots; the session browser is usually "browswer".
9. **Harness project path** still says `pepelwerk_agents` but the code is at `~/Documents/Clutch/`. Run everything from `~/Documents/Clutch/`.

---

## 6. How to run

```bash
cd ~/Documents/Clutch
npm run dev              # http://localhost:3000  (restart after config changes)
npm run typecheck        # tsc --noEmit
npm run lint
npm run check:contract   # Zod contract gate (7/7)
npm run check:relevance  # relevance core gate (22/22)
npm run gen:cli reference/exam-prep/Big_Data_Exam/... -- --density=max --out=/tmp/x.json   # engine on a real pack (needs GEMINI_API_KEY)
git push && railway up --detach --service cramsheet   # deploy (Railway builds the image)
```
Key screens: `/` (marketing), `/generate`, `/results`, `/library`, `/sheet?density=max|balanced|essentials`, `/debug/tokens`, `/debug/primitives`.

---

## 7. NEXT ACTION

**The R-track (R1–R6) is DONE — and superseded in part by the
sequential-fill architecture (2026-08-07, commits 6dfaf0c..007d4a0):**

- **TwoPageSheet.tsx is THE front/back renderer.** Both pages in one
  document, filled sequentially by real measurement (page 1 takes all it
  can hold, page 2 gets the exact remainder + smallest-first tail
  packing). splitFrontBack/estimated budgets are legacy — do NOT tune
  them; the two-page path never touches them.
- **Vision ingest shipped** (§7c): parse/ingest.ts reads text + SmartArt
  + speaker notes + rasterized/vision-transcribed image content.
- **Questions carry answers** (contract-required `a` field, green → on
  the sheet); **items carry explicit `topic` tags** (exact topics[].name,
  contract + prompt enforced) driving topic-grouped layout + color key.
- **Adjust-the-sheet feature** on /results: free presets (deterministic
  ScoreCtx steering, instant) + Pro free-text tweaks (/api/tweak →
  tweakSheet(), contract re-validated, 422 on degradation).
- **/results previews the FULL two-page sheet at MAX.** Free tier sees
  the real back page BLURRED behind an unlock card ("Unlock with Pro ·
  $4.99") — the conversion surface Stripe will gate. Pro sees both pages
  + exports the 2-page PDF in one pass.
- Demo/QA: `/results?g=<pool>&tier=free|pro` self-seeds from
  samples/generated via /api/dev-pool.

**Next up: Supabase (auth + saved sheets + server-side tier), then
Stripe on the back-page paywall + /api/tweak entitlement.**

R-track status (all committed):
- **R1 ✅** relevance core (scorer + composer + estimator + 22/22 gate).
- **R2 ✅** scoring ctx stored: `generate/page.tsx` writes `ctx:{files,examType,priority}` into the stash; `results/page.tsx` carries it into `FittedSheet`.
- **R3 ✅** `FittedSheet.tsx` (client Layer C): composes then MEASURES, trims lowest-scored on overflow, gap-fills bench into slack. Clip test is the PER-ITEM right-edge (matches the PDF verifier). Concepts are inline row-blocks (was a monolithic table). Section `no-break` removed; `overflow-monitor.tsx` retired. Topic color-coding restored (tinted section bars + cycling `tk-0..9` left-rules).
- **R4 ✅** `pool-store.ts` + `/print` route + `/api/pdf` POST transport; REAL clip verifier in the route (422 `ClipError` if any visible block spills past the columns). `/results` Export PDF POSTs the session pool.
- **R5 ✅** engine emits a ranked POOL (supply) not a page; `deepenSheet()` + `gen-cli --topup=N`.
- **R6 ✅** `splitFrontBack`: FRONT and BACK are BOTH the full 7-col MAX — one continuous sheet across two sides of a page (user decision 2026-07-28, overriding the earlier BACK=Balanced call; matches the proven cheatsheet-maxdensity.html which ran 7-col on both sides). Front split 0.8× so trimmed items flow to the back; back gets the full remainder and its FitController fills to the boundary.

Gotcha the verifier caught: the FitController's container-`scrollWidth` overflow test disagreed with the per-item right-edge test → blocks stayed clipped past `data-fit-done`. Both now use the per-item right edge; Phase-B gap-fill re-checks GLOBAL clipping after each reveal (a bench item sits mid-flow and can push later sections off-page).

Then R4 (PDF transport + verifier) → R6 (front/back full mode).
**R5 landed early** (2026-07 detour): engine now emits a ranked POOL
(supply) not a page; `deepenSheet()` + `gen-cli --topup=N` top-up passes
reach ~140 items; density is layout-only. **MAX is now the full 7-col
weapon** (was silently capped at 4/5 cols) — matches the proven
`cheatsheet-maxdensity.html`. FRONT=7-col MAX, BACK=Balanced remainder
via `splitFrontBack()`.

After the relevance system: Supabase (auth + saved sheets), then Stripe (paywall).

---

## 7c. Vision ingest (SHIPPED 2026-08-06)

`src/parse/ingest.ts` is now the single entry point; it reads the text
layer AND the pixels.

- `parse/pptx.ts` — real PPTX reader: slide `<a:t>` runs (exact tag match;
  `<a:t[^>]*>` also matches `<a:tabLst>` and dragged raw XML into the
  text), **SmartArt** text from `ppt/diagrams/dataN.xml`, and **speaker
  notes**. This alone recovered "critical path" on the ITSS 3300 deck —
  it was in a SmartArt shape, not an image.
- `parse/rasterize.ts` — `pdftoppm` (poppler) renders image-only PDF
  pages at 110 dpi. Missing binary ⇒ warning, not failure.
- `parse/vision.ts` — multimodal transcription (Gemini Flash, temp 0.1)
  with a TRANSCRIBE-don't-summarize prompt; emits `SKIP` for decorative
  images, which we filter. Output appended under a
  `===== VISION TRANSCRIPTION =====` marker so provenance is visible.
- Triggers only where text extraction failed: PPTX slides with pictures
  and < 120 chars of text; PDF pages far below the doc's average text
  density; whole PDFs under ~100 chars/page (scans).
- `LLMRequest` gained `images` + `plainText`; `GeminiClient` sends
  `inlineData` parts.
- Measured on the ITSS 3300 pack: **31 images transcribed, +33.8k chars**
  of previously invisible content; the Gantt-chart slide (18 chars of
  text) yielded its full task/duration/predecessor table.

## 7b. BACKLOG / known limitations

- ~~**Engine reads text, not pixels (P1).**~~ **FIXED 2026-08-06.** See
  §7c below. Original problem: the ingest pipeline extracted only the
  *text layer*.
  Anything drawn as an image is invisible to the engine: Excel
  regression-output screenshots (e.g. Lecture 6 Fig 8 — Multiple R / R² /
  ANOVA tables), chart figures, scanned/handwritten notes. It didn't hurt
  the OPRE 3333 detour (key coefficients were repeated in body text and
  the xlsx workbooks were dumped to markdown separately), but a pack whose
  only copy of a number lives inside a chart image would silently lose it.
  **Fix:** add a vision pass (render image-heavy pages → multimodal model,
  or OCR) for slide decks before the text engine runs. Scope with the
  Supabase upload work (real arbitrary uploads is when this bites).
- **Back-page slack (folds into R3).** `splitFrontBack()` uses the
  *estimated* budget cutoff, so the Balanced BACK can leave a little
  bottom slack when the remainder pool is thin. FitController (R3) with
  measured visibility closes it (tail-only monotone gap-fill).

---

## 8. Document index

| Doc | What |
|---|---|
| **`00-STATE.md`** | ← you are here — the continue-here handoff |
| `01-PRD.md` | product vision, strategy, pricing, metrics |
| `02-OUTPUT-SPEC.md` | proven rendering + content standard (from the hand-built sheets) |
| `03-ROADMAP.md` | phases + acceptance gates |
| `04-CLAUDE-CODE-HANDOFF.md` | original stack/architecture kickoff |
| `05-BUILD-PLAN.md` | engineering execution plan (data model, repo layout) |
| `06-V1-CHECKLIST.md` | every v1 feature mapped to a step |
| `07-ENGINE-PROMPT-PLAYBOOK.md` | verbatim patterns from the hand-built sheets → the engine prompt anchor |
| `08-DESIGN-IMPLEMENTATION-PLAN.md` | the D1–D6 design system implementation |
| `09-RELEVANCE-AND-FIT.md` | **the current work** — the selection + fit algorithm (v2, reviewed) |
| `reviews/09-review-raw.json` | the 3-lens adversarial review of the relevance spec |
| `design/` | the product-design handoff (gitignored assets, mirrored into tokens.css) |
| `reference/` | gitignored ground-truth exam packs (CS6320 NLP, CS6360 Big Data) |
