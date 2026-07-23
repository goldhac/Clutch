# CramSheet — Relevance & Fit System (v2, post-review)

**Status:** spec revised after 3-lens adversarial review → ready to implement
**Owner:** Gold Nwobu
**Supersedes:** the blind overfill-and-clip model in `src/components/sheet/tiers.ts` (D5), which clips items mid-render at the page boundary.
**Review:** `docs/reviews/09-review.md` (17 findings; all blockers + confirmed majors folded in below).

## 0. Contract (non-negotiable)

1. **Pool stored once, ranked.** The engine emits a full superset per pack (`SheetContent`), independent of density. Density/page switching NEVER re-calls the engine.
2. **Every sheet is full.** Selection keeps adding best-mix items until nothing more fits whole. No dead space beyond a small natural remainder (< ~2 line-heights) **in any column**, not just the last.
3. **Everything placed is fully visible.** No item is ever partly clipped — not at the page bottom, not into an overflow column. If it doesn't fit whole, a smaller item that does takes its place.
4. **Fixed A4 landscape, one page per density view.** `overflow: hidden` is belt-and-braces; the fit system's job is that the clip *never actually cuts a placed item*.
5. **Best content, right mix.** A portfolio (formulas/concepts/traps/questions in deliberate shares) that the user's two controls **actually move** — not top-N.
6. **Extends to front/back.** Page 2 = same pool, second budget; page-2 content = pool **minus page-1's post-fit visible set**. Nothing here may assume exactly one page.
7. **Deterministic.** Same pool + same controls + same density ⇒ byte-identical selection. No NaN-ordering, no iteration-order dependence.

## 0.5 Prior art — we build on proven algorithms

| Our layer | Proven ancestor | What we take |
|---|---|---|
| Scoring (A) | Search/feed ranking (BM25 field-weighting; deterministic score functions) | Hand-tuned linear model over strong signals; explainable ("why is this on my sheet") |
| Redundancy (A½) | **MMR** (Carbonell & Goldstein) | Demote near-duplicates so two slots aren't spent on one fact |
| Mix / slate (B) | **Proportional-fair scheduling** (telecom) + feed slate diversification | Deficit water-filling = proportional-fair: lowest `allocated/target` gets the next slot; converges to shares at any cutoff |
| Remainder fill (B) | **Best-fit-decreasing bin packing** | Last inches → highest-value item that physically fits |
| Whole-page selection | **Multiple-choice knapsack** (value=score, weight=height, capacity=budget) | Greedy-by-value + floors; exactness unneeded because C corrects |
| Measured fit (C) | **TeX fit-to-box** (Knuth-Plass render-measure) + **newspaper pagination** (rank stories, whole-story placement only) | No half-items, whole-item placement, measured correction |
| Future per-student | **SM-2 / Anki priority** | Phase 2+: items the student got wrong rank up |

### A½ — Redundancy (MMR-lite)
Per section, walk items in score order; an item whose Jaccard token overlap (lowercased alpha, stopwords dropped) with any already-kept item > **0.6** gets score ×0.5 (demoted, not dropped — can still fill remainder). Deterministic, cheap.

## 1. Pipeline (with the review's plumbing fixes)

```
files+tags → ENGINE (Gemini, once) → FULL ranked pool (~2× one MAX page)
           → STORE { pool, ctx:{files:[{name,tag}], examType, priority}, density }
             (sessionStorage now, Supabase later — ctx is REQUIRED; see F-BLK-3)
     ┌─────────────────────────────────────────────────────────────────┐
     │  per density view — deterministic, pure, no network:            │
     │    A  score(item, section, ctx)                                 │
     │    B  compose(scored, densityBudget) → ordered list + bench     │
     │  React renders all (bench items pre-hidden via state, not DOM)  │
     │    C  FitController measures → sets hiddenIds/visibleIds STATE   │
     │       (React owns visibility — no classList mutation)           │
     └─────────────────────────────────────────────────────────────────┘
           → /print route renders from POSTed payload (F-BLK-4)
           → PDF: wait data-fit=done → page.evaluate verifier → 422 or print
```

Layers A + B are pure functions in `relevance.ts` (unit-tested). Layer C is a client controller that outputs a **React state set**, not DOM mutations (the keystone fix — see §4).

## 2. Layer A — Scoring

`score(item, section, ctx) → number`. Deterministic. `ctx = { files:[{name,tag}], examType, priority }`.

### 2.1 Evidence base — DEFINED for every type (fix F-BLK-6)
| Type | verified=true | conf high | conf med | conf low | no conf field |
|---|---|---|---|---|---|
| topic / formula / concept / question | 50 | 35 | 20 | 8 | — |
| **trap** | (src exam-match → 50) | — | — | — | **35** (schema guarantees named falsity = "inherently high-trust") |
| **table** | — | — | — | — | **20** |

Traps with an exam-grade `src` (matches a `past_exam` file, or keyword `exam|final|midterm|quiz|prior`) are treated as verified (50). Otherwise 35. Tables base 20.
**DECIDED (Gold, 2026-07): scorer-side bases, no contract change.** v1 scores traps/tables by these bases in `relevance.ts` — no `conf`/`verified` added to `TrapSchema`, no engine change, no re-test of the contract. (Adding those fields stays a documented Phase-2 option if traps ever need finer confidence gradation.)

### 2.2 Source authority (+0–22) — needs stored file tags
Match `src` against `ctx.files` filenames (fuzzy, as `sanitize.ts`), take highest-weight matched tag: `past_exam +22 · review +14 · homework +10 · formula_sheet +8 · slides +6 · notes +4`. No filename match → keyword fallback on `src`: `exam|final|midterm|quiz|prior +18 · review +12 · hw|homework +8`, else +0.

### 2.3 Corroboration (+0–12)
`(distinct cited sources − 1) × 6`, cap 12. Split `src` on `;` and `·`.

### 2.4 Controls move SHARES, not just scores (fix F-BLK-1)
The knobs shift the §3.2 **share targets** (percentage points), because per-section-constant multipliers can't change within-section order or the static mix. Per-item multipliers survive ONLY where they differ within a section (question kinds).

**Share deltas (applied to the base share table, then re-normalized to 100%):**
| Control | formulas | concepts | traps | questions | tables |
|---|---|---|---|---|---|
| examType `problem-solving` | +8pp | −6pp | 0 | +3pp | −2pp |
| examType `conceptual` | −8pp | +8pp | +3pp | 0 | 0 |
| priority `formulas` | +5pp | −5pp | — | — | — |
| priority `concepts` | −5pp | +5pp | — | — | — |

**Within-section item multipliers (change ordering, not shares):**
- examType `problem-solving`: questions kind `problem` ×1.15, else ×0.95.
- examType `conceptual`: questions kind `MCQ`/`T/F` ×1.10, else ×0.95.

Determinism tie-break: `(score desc, fixed section order, engine emission index)`, stable sort.

## 3. Layer B — Composition

### 3.1 Budget — fixtures MEASURED, not estimated (fix F-MIN, ×cols amplification)
Two-phase on each density render: (1) render the fixtures (header, exam-format strip, verifiedPatterns strip, footer) and read their **real** heights via `getBoundingClientRect`; (2) then compose. Fixtures span all columns, so a 5pt strip misestimate costs `cols×` phantom budget — measuring removes the only ×cols error term.
```
usable   = pageH − padY·2 − headerH − footerH        (measured)
colBudget= usable − examFormatH − verifiedPatternsH  (measured, span-all)
B        = colBudget × cols
target   = 0.97 × B
```

### 3.2 Base section shares (of B, before §2.4 deltas)
| Section | MAX | Balanced | Essentials |
|---|---|---|---|
| topics | 8% | 6% | **0** |
| formulas | 40% | 40% | 46% |
| tables | 8% | 6% | **0** |
| concepts | 15% | 16% | 18% |
| traps | 14% | 16% | 22% |
| questions | 15% | 16% | 14% |

Pinned **scalar** targets (share × B) — zero-target sections are EXCLUDED from the ratio loop entirely (no 0/0 NaN — fix F-MAJ determinism).

### 3.3 Placement (deterministic water-fill)
1. **Floors** (if pool has them): 3 formulas, 2 traps, 2 concepts, 2 questions — never a single-section wall.
2. **Water-fill:** repeatedly pick the non-excluded section with lowest `allocated/target`; place its next-highest item if `estHeight ≤ remaining`, else mark blocked. Start-tie and deficit-tie broken by fixed section order `[formulas, concepts, traps, questions, topics, tables]`. Stop when all blocked.
3. **Remainder (no dead space):** among ALL unplaced items (INCLUDING demoted duplicates; EXCLUDING share-0 sections **unless projected fill < 90%**, then they re-enter — fix F-MAJ Essentials/remainder contradiction), place highest-scored that fits `remaining`, repeat. Order `(score desc, section order, emission idx)`.

### 3.4 Height estimator — corrected (fix F-MAJ estimator)
Per field: `lines = ceil(effectiveChars / charsPerLine(font, effectiveWidth))`.
- **Multiline `<pre>` formulas:** split on `\n`, ceil EACH line separately (a 4-line acc/prec/rec/F1 cluster is 4 lines, not `ceil(80/50)=2`).
- **Effective width:** def cell in `.kvtable` ≈ `colWidth − measured(term+meta reserve)`; inline-label rows add the label chars.
- **Per-field pt:** mono fields at code pt, sans at body pt; advance 0.52em sans / 0.62em mono.
- `height = Σ lines × lineHeight + chrome(patternType, density)`, chrome = measured constants per pattern×density (in the unit test).
Estimation stays approximate (±10–15%) — Layer C is the truth. **Bench depth** = enough items past the cutoff to cover 1.5× the worst observed column error (≈ 6–10 items), so C always has candidates to fill.

## 4. Layer C — Measured fit (rewritten)

`<FitController>` (client) mounted on `/sheet` and `/print`. Outputs `hiddenIds: Set<string>` as **React state**, which `<Sheet>` reads to render `.fit-hidden` — **no DOM classList mutation** (fix F-BLK stale-state; also gives truthful header/footer counts + the page-2 handoff). Remount key `${density}-${poolHash}` guarantees each composition starts from clean markup.

### 4.1 Item identity
Every placeable leaf carries `data-fit-id = "{section}:{emissionIndex}"` (stable across renders — enables §7 page handoff). `data-fit-id` is on **break-inside:avoid leaves only** (formula-block, `.qq`, trap-callout, each concept `<tr>`, each table `<tr>`) — never section wrappers (fix F-MIN granularity).

### 4.2 Clip predicate — CORRECT axis (fix F-BLK-2, all 3 lenses)
Multicol overflow is **horizontal**: a clipped item lands in an off-screen column to the RIGHT, or a fragment extends past the last visible column. Per-item leaf rect (union of `getClientRects()`):
```
clipped(item) ⇔ itemRect.right > colsRect.right + ε   (ε = 0.5px)
```
Bottom-crossing is NOT the test. (Belt: also flag `rect.bottom > colsRect.bottom + ε` for the rare non-fragmenting overflow.)

### 4.3 Section headers & empty sections (fix F-MIN orphans)
Section h2 + `<thead>` are bound to their section: rendered iff the section has ≥1 visible `data-fit-id`. A clipped **header** is resolved by hiding the section's lowest item (pulls the header back into a visible column), never treated as unfixable.

### 4.4 Trim pass — mix-aware "water-draining" (fix F-MAJ mix/floors)
While any item is clipped: hide the lowest-scored item from the section currently **most over its target share**, but never below that section's §3.3 floor while any above-floor section has a hideable item. Same comparator as water-fill, reversed → deterministic, mix-preserving. Re-measure per hide (multicol reflows).

### 4.5 Gap-fill — monotone, tail-only (fix F-BLK oscillation, all 3 lenses)
Mid-flow unhiding reflows non-linearly and can re-clip. So gap-fill is **tail-only + try-revert**:
- A dedicated **remainder slot** sits after the last section. Gap-fill inserts bench items THERE (end of flow) — consuming exactly the trailing gap, never shifting upstream breaks.
- Per-column end-gaps (EVERY column, not just last — fix F-MAJ mid-column holes) that exceed ~2 line-heights are addressed by **swapping a smaller same-section item ahead of the oversized block that caused the jump** (score-adjacent reorder within the section), re-measured.
- **try-and-revert:** insert/swap → force reflow → re-measure; if clipped count rose, **revert and permanently disqualify** that candidate this run. An item hidden by the trim pass is **never** unhidden this run. Termination bounded by `benchSize + initialClipped`; provably monotone.

### 4.6 Prerequisite CSS fix
Remove section-level `no-break` (TrapsSection wraps the whole traps section in `.no-break` today — fix F-MAJ, listed in §9). `break-inside: avoid` lives on **items only**, so a full section can't jump columns as one unit leaving inch-high holes.

### 4.7 Terminal state & counts
When the pass budget (≤8) is exhausted, run one **hide-only** terminal sweep (monotonically clears clipping) → set `data-fit="done"`. Header meta + footer render from the **post-fit visible set** via React state ("58 in pool · 34 shown · 12 verified" — truthful, never a DOM-mutation the re-render clobbers).

## 5. Engine supply-side — genuine 2× pool (fix F-MAJ pool-size)
Density leaves the engine's job. Prompt POOL TARGET = ~2× one MAX page, so both the bench and the future BACK page always have surplus:
- **18–24 formulas · 14–18 concepts · 12–16 traps · 14–18 questions · 4–6 topics · 2–3 tables · 3–4 verifiedPatterns** (when a past exam exists).
Before committing, verify Gemini sustains citation quality at this volume on the Big Data pack (the §8 live test). If it can't, fall back to the **BACK = Balanced-density** product decision (§7) and a ~1.5× pool. examType/priority stay in the prompt (shape what's generated) AND the scorer (shape what's selected).

## 6. Expected visible counts (landing zones)
| Density | formulas | concepts | traps | questions | topics | tables | ≈ total |
|---|---|---|---|---|---|---|---|
| MAX | 8–12 | 6–9 | 6–8 | 6–9 | 4–6 | 1–2 | 30–45 |
| Balanced | 5–7 | 4–6 | 4–6 | 4–6 | 3–5 | 0–1 | 20–30 |
| Essentials | 4–5 | 3–4 | 4–5 | 3–4 | 0 (0–2 sparse) | 0 | 14–18 |

## 7. Front/back — data flow defined now (fix F-MAJ, contract #7)
Sequential fit: page 1 runs A→B→C to `data-fit="done"`; C exports `visibleIds(page1)`. Page-2 composer input = `pool − visibleIds(page1)`, seeded (score order) with page-1's fit-**hidden** items; page 2 then fits. Invariant test: `visible(p1) ∩ visible(p2) = ∅` and no item that was scored-in appears on neither.
**DECIDED (Gold, 2026-07): BACK = Balanced density.** The back is the roomier "annotation / desk" layer; front = the dense exam-room weapon. Needs only ~1.5× content, so §5's pool target can be the lower end and engine citation-quality risk stays low. Page-2 composer uses Balanced shares + geometry.

## 8. Test plan
- **Unit (`scripts/check-relevance.ts`, like `check:contract`):** scorer determinism + type bases defined (no item scores by the missing-conf default); composer respects floors, hits targets ±tol, remainder-fills, never exceeds budget; determinism across shuffled input; extreme pools (0 verified / all verified / empty sections / one giant `<pre>`).
- **Integration (Playwright, after `data-fit="done"`):** zero `[data-fit-id]` rects with `right > colsRect.right` (the real clip test); PDFs = exactly 1 page A4-landscape via the §4 verifier (not the vacuous page-count); every column's end-gap < 2 line-heights when the pool has surplus; density switch on /results produces identical output to a fresh load (no stale hidden state).
- **Live:** Big Data NoSQL pack through the new pool prompt → citation audit still 100%, sheet full + zero clipped at all densities, 2-page invariant holds.

## 9. Implementation map (with the review's added call sites)
| Piece | File | Note |
|---|---|---|
| scorer + composer + estimator | `src/components/sheet/relevance.ts` (new; replaces `tiers.ts`) | pure A+B |
| Sheet renders from visibleIds state + data-fit-id leaves | `src/components/sheet/Sheet.tsx` + pattern components | B/C bridge |
| FitController → hiddenIds React state | `src/components/sheet/FitController.tsx` (new, client) | C |
| **remove section-level no-break** | `src/components/sheet/TrapCallout.tsx` (`TrapsSection`) | §4.6 |
| **store scoring ctx** (files/tags/examType/priority) | `src/app/generate/page.tsx` stash + `results/page.tsx` Stash type | F-BLK-3 |
| **/print route + POST pool transport** | `src/app/print/page.tsx` (new) + `src/app/api/pdf/route.ts` | F-BLK-4 |
| **PDF verifier** (page.evaluate clip check, 422 on timeout) | `src/app/api/pdf/route.ts` | §4.7 |
| **marketing home** safe defaults + estimator-only (no FitController on the blurred hero) | `src/app/(marketing)/page.tsx` | F-MIN |
| retire/rewrite OverflowMonitor (superseded by FitController) | `src/app/sheet/overflow-monitor.tsx` | — |
| engine pool prompt (drop density tuning → POOL TARGET) | `src/engine/prompt.ts` | §5 |
| unit gate | `scripts/check-relevance.ts` + `package.json` | §8 |
