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
| **R2** Store scoring ctx (files/tags/examType/priority) with the pool | ⬜ **NEXT** | extend the sessionStorage stash + results Stash type so Layer A can score on `/results` |
| **R3** Sheet wiring + `FitController` | ⬜ hardest | React-state visibility (not DOM mutation), correct clip axis (`item.right > cols.right` — multicol overflow is HORIZONTAL), mix-aware trim, tail-only monotone gap-fill, remove section-level `no-break` |
| **R4** PDF pool transport | ⬜ | `/print` route + POST the pool to `/api/pdf` (Playwright can't see sessionStorage) + real clip verifier (422 on timeout, never print clipped) |
| **R5** Engine POOL TARGET prompt | ⬜ | drop density tuning → emit ~1.5–2× pool so every density fills (MAX currently est-fills only 52% because the sample is old-sized) |
| **R6** Front/back 2-page | ⬜ | `pages:1\|2`, sequential fit, page-2 = pool minus page-1 visible, **BACK = Balanced density** |

**Not started (post-relevance):** Supabase auth+persistence (auth/library/pricing are UI shells today), Stripe paywall, real SSE loading progress.

---

## 4. Decisions locked (don't re-litigate)

- **BACK page = Balanced density** (front/back). Roomier "annotation/desk" layer; ~1.5× pool; lower engine risk.
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

**Do R2, then R3.** (R1 is done and committed.)

- **R2 (quick):** extend the sessionStorage stash written in `src/app/generate/page.tsx` (and the `Stash` interface in `src/app/results/page.tsx`) to carry `ctx: { files: [{name, tag}], examType, priority }`. This is what Layer A (`relevance.ts scoreItem`) needs to compute source-authority + control multipliers on `/results`. Without it, every item scores by evidence only (silently degraded). Spec: `09 §1`, `F-BLK-3`.
- **R3 (the hard one):** wire `<Sheet>` to render from a `visibleIds` React state set with `data-fit-id` on break-inside:avoid leaves; build `src/components/sheet/FitController.tsx` (client) that measures and outputs `hiddenIds` state; remove the section-level `no-break` in `TrapCallout.tsx`'s `TrapsSection`; retire `overflow-monitor.tsx`. Follow `09 §4` exactly — the clip axis, the try-and-revert monotone gap-fill, and the React-state (not DOM-mutation) visibility are the three things the review said MUST be right. Verify in-browser that zero items are clipped and the page fills at all three densities.

Then R4 (PDF transport + verifier) → R5 (engine pool prompt; will finally make MAX fill) → R6 (front/back).

After the relevance system: Supabase (auth + saved sheets), then Stripe (paywall).

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
