# CramSheet — Product Requirements Document

**Status:** v1.0 (build-ready)
**Owner:** Gold Nwobu
**Last updated:** May 2026

> One-line: Upload your course materials, get an exam-calibrated one-page reference sheet that ranks what's most likely tested — with the formulas, traps, and likely questions your professor is most likely to use.

This document is the full product vision. **Everything is documented here**, but the product ships in phases (see `03-ROADMAP.md`). v1 is deliberately narrow: the hero artifact plus a cheap, high-trust meta layer. Later phases expand toward the full study kit.

Companion files:
- `02-OUTPUT-SPEC.md` — the exact rendering + content recipes (geometry, fonts, colors, density modes, content patterns). This is the proven standard; build to it.
- `03-ROADMAP.md` — phases, what ships when, acceptance gates.
- `04-CLAUDE-CODE-HANDOFF.md` — kickoff instructions, stack, architecture, conventions.

---

## 1. Problem

Students facing an exam have scattered materials (50+ slides, messy notes, a review sheet, old homework) and no fast way to decide **what actually matters**. The pain peaks 24–72 hours before the exam, late at night, under stress. Existing tools either:

- **Summarize without judgment** — they compress but don't decide what's high-yield (Cheatish, generic AI).
- **Bundle everything** — broad suites (StudyFetch, Knowt, Mindgrasp) that feel like *more* workflow, not less, right when the student wants *one* decisive artifact.
- **Require manual prompting** — ChatGPT/Claude/NotebookLM can approximate this, but output is inconsistent, not printable, not professor-aware by default.

The hole worth owning: **exam-calibrated, one-page, print-first output that ranks testability and shows its evidence** — fast, trusted, and built for panic mode.

## 2. Strategic wedge (do not drift from this)

- **Not** an AI study suite. The suite is the crowded loser. The single decisive artifact is the opening.
- **Compression *with judgment*** — the product decides what's most likely tested, not just what's in the doc.
- **Trust is the moat, not AI access** — confidence labels + source citations on every item. Wrong prioritization is the failure that kills retention ("it told me what NOT to study, and it was wrong").
- **The prior exam is the highest-leverage input** — a sheet built from slides alone is a guess; a sheet calibrated against a prior exam pattern-matches the ~70% of questions professors reuse. Onboarding should actively pull for it.

## 3. Target user

**Primary (launch wedge):** undergraduates in quantitative / problem-solving courses — calculus, statistics, physics, general chemistry, accounting, finance. These users have the sharpest pain and the clearest cheat-sheet behavior; formulas, traps, and worked patterns make the value obvious.

**Phase 2 wedge:** memorization-heavy courses (anatomy, nursing, bio). Strong market, but v1's engine is tuned for formula/pattern logic first.

**User state:** exam is close, materials are messy, time is low, wants signal over completeness, fears both hallucination and being accused of cheating.

**Core job-to-be-done:** *"Take my course materials and give me one dense page that tells me what to study, what formulas matter, what traps to avoid, and what questions are likely — and let me trust it."*

## 4. Positioning & naming

- **Acquisition / marketing copy:** "cheat sheet." Catchy, high-intent, what students search for.
- **In-product + on the PDF itself:** "exam reference sheet" / "exam sheet." Safer, more legitimate, more shareable, defuses the cheating-accusation fear (the #1 adoption brake for students).
- Commit to this split firmly. It is a deliberate decision, not an inconsistency.

## 5. The full product surface (vision)

The product turns an uploaded course/exam pack into study artifacts. The complete vision includes seven artifact types (from the proven manual build). They are **phased**, not all in v1:

| Artifact | What it is | Phase | Rationale |
|---|---|---|---|
| **Cheat sheet** (3 densities, MAX hero) | One-page, ranked, print-first exam sheet | **v1** | The hero. The screenshot-worthy, share-worthy artifact. |
| **Exam-format + professor-notes** | Tiny meta doc: question mix, time, open/closed book, prof tendencies | **v1** | Near-free to generate, high trust signal ("this knows my class"). |
| **Most-likely-tested ranking** | The prioritization layer, surfaced as its own view | **v1** | The differentiator; powers the cheat sheet but shown explicitly. |
| **Notes** | Distilled lecture-equivalent, 1–2 pp per topic | **v2** | High value ("I missed lecture"), scalable, reuses engine. |
| **Q&A / Flashcards** | Anticipated Qs in prof phrasing; same content as flip cards | **v2** | Smarter than flashcards (exam-shaped). One content set, two renders. |
| **CLUTCH walkthrough** | ~40-pp "if you read one thing" deep doc | **v2.5** | Serves the student with *time* (day -7), opposite of the cram sheet. |
| **Master / cross-topic** | Multi-topic compare, "when to use X vs Y" | **v3 (course mode)** | Only matters across a whole course, not one exam. |
| ~~Podcasts~~ | Audio passive-review | **CUT** | Scaling wall (was manual NotebookLM), commodity, lowest-urgency job. Revisit only if retention demands passive review. |

**Why phased and not all-at-once:** the strategic wedge explicitly warns against becoming the bloated all-in-one suite. Each artifact is a separate quality bar and a separate generation cost. Ship one great hero artifact, prove it, then expand. v1 stays true to the wedge; v2+ deepens once the hero is validated.

## 6. Density modes (the core compression feature)

Three render densities of the **same** ranked content. Density is a *rendering* choice; the underlying prioritization is identical. Full geometry in `02-OUTPUT-SPEC.md`.

| Mode | Columns | Body font | Page coverage | Built for |
|---|---|---|---|---|
| **Minimal** | 2 | ~9 pt | ~70% | Learning / readability; more whitespace, clearer wording |
| **Standard** | 3 | ~7.5 pt | ~85% | Default exam prep; balanced |
| **MAX** 🔥 | 4–5 | 5.7–6.5 pt (hard floor 5.5pt) | 92–97% | The cram weapon; engineered density |

**MAX rules (hard-won, from the manual build):**
- MAX is **engineered density, not "smallest font + most words."** A wall of 5pt text fails. Structural whitespace around formula boxes, color-first scanning, ≤3 bullet levels.
- Default **4 columns**, allow 5. Do **not** promise 7 — that was a 2-page, 14-topic *course* master; a single-exam one-pager tops out lower.
- **Font floor 5.5pt.** Below that it's a screenshot, not a study tool.
- Acceptance test: a stressed student opens it 48h out and instantly thinks *"yes, this is exactly what I needed"* — and can scan it in 5 seconds, not *"too much text."*

## 7. Inputs (the exam pack)

- **Accept:** PDF, PPTX, DOCX, pasted text. (v1 may start with PDF + text reliably; PPTX/DOCX parsing is a known engineering cost — see roadmap.)
- **File tagging** — user labels each file: lecture slides / review guide / past exam / homework / notes / formula sheet. Tags drive ranking weight (Section 8).
- **Single-file fallback** — one PDF still produces a sheet. This is the panic-mode path and is architected as the MVP core; multi-file pack is the smarter, upsell path.
- **Confidence meter** — a visible indicator that climbs as the user adds higher-weight files (a past exam fills it most). This makes the value of uploading a prior exam *tangible* instead of nagging. Doubles as the GTM hook.

## 8. The prioritization engine (the differentiator)

The engine ranks every extracted item by likely testability and attaches a **confidence** label + **source citation**. It does not summarize; it *decides*.

**Signal weights (highest → lowest):**
- **Highest:** appears in a past exam; appears in a review guide; repeated across homework/problem sets; appears in worked examples; explicitly marked important in slides/notes.
- **Medium:** repeated across multiple lectures; in headings/summary slides; formula used in multiple contexts; concept linked to a common mistake.
- **Lowest:** appears once in notes only; broad background; filler.

**Output per item:** priority level + confidence (`high` / `med` / `low`) + source trail (e.g. "Slide 14", "Review p2", "HW3 Q5"). The engine must **not feign certainty when evidence is weak** — weak signal → `low` / "possible", never a false "highly likely."

**The verified-exam refactor (the highest-leverage technique):** when a prior exam is supplied, map each prior question to a section, find gaps, and fill them with worked numbers / exact syntax / named false-statement traps. This is the single biggest quality multiplier and should be a first-class code path, not an afterthought.

## 9. Content patterns (what goes on the sheet)

These six patterns are the proven building blocks (full detail in `02-OUTPUT-SPEC.md`):

1. **Formula block** — formula + variable defs + when-to-use + one-line trap + micro example question.
2. **Compact compare/contrast table** — anything 2–4 comparable items.
3. **Memorize-cold table** — direct-hit facts.
4. **Worked example box** — anything with numbers (worked numeric example > bare formula).
5. **TRAP callout** — named: "X is FALSE because Y." Not vague advice.
6. **Q&A bullet line** — anticipated quiz pattern, answer + trap.

**v1 emphasis call:** promote **traps** above generated questions. A wrong trap is obviously dismissable; a wrong "likely question" sends a student down a bad path. Generated questions ship in v1 but are clearly labeled lower-confidence than traps.

## 10. Generation UX: the speed/quality resolution

The proven good output was **two-pass** (a critique pass took a sheet from ~8.5 to ~9.1). Raw speed and top quality conflict. Resolution:

- **Pass 1 (fast):** render the sheet immediately. This satisfies panic-mode.
- **Pass 2 (optional, one tap):** a "Tighten this" action runs a critique-and-fix pass — checks density, names missing traps, fills gaps, verifies one-page fit.
- Do not hide this tradeoff behind a fake "instant + perfect" promise. The fast pass is good; the tighten pass is great.

## 11. User flow (v1)

1. **Landing** — one promise; a real (blurred) MAX sheet visible before signup.
2. **Upload** — drop files, tag each; confidence meter climbs. Single file is fine.
3. **Controls** — exactly three: exam type (conceptual / problem-solving / mixed), density (minimal / standard / MAX), priority (formulas / concepts / balanced). No fourth knob.
4. **Generate** — fast pass-1 sheet appears.
5. **Results (3-pane)** — the sheet (hero), "most likely tested" rail, refine controls.
6. **Refine** — denser / more formulas / more examples / simpler / rebalance; switch density; one-tap "Tighten."
7. **Export** — clean A4 landscape PDF, print-first. PDF title says "Exam Reference Sheet."

## 12. Controls reference

**Pre-generation (3 only):**
- Exam type: conceptual / problem-solving / mixed
- Density: minimal / standard / MAX
- Priority: formulas / concepts / balanced

**Post-generation (light refinements only — no full editor in v1):**
- denser / cleaner
- more formulas / more examples / more conceptual
- simpler wording
- regenerate; switch density; one-tap "Tighten"

A full drag-and-drop editor is **out of v1** — it slows shipping and blurs the product.

## 13. Out of scope for v1 (explicit)

Flashcards, Q&A docs, notes, CLUTCH, master/cross-topic (all phased later) · podcasts (cut) · AI tutor chat · spaced repetition · lecture recording · collaboration · note libraries · course workspaces · social features · full editor · LMS integrations · native mobile app · handwriting-heavy OCR.

## 14. Pricing (transaction-first, episodic)

Exam demand is spiky and emotional; do not price like a broad monthly suite out of the gate. Show the artifact *before* payment.

- **Free preview:** top-5 likely questions + top-8 high-probability concepts + a blurred full-sheet preview.
- **Single exam rescue:** $4.99 — one full generation from one pack.
- **3-exam pack:** $9.99.
- **Finals Sprint pass:** $12.99–$14.99 — 7 days / up to ~10 packs.
- **Later (after retention data):** $29–$39 semester pass.

**Do not:** lead with $19.99/mo; force annual billing; split charges by output type; build an opaque token economy. One upload buys one complete outcome. Keep first purchase under the "costs as much as lunch" threshold.

## 15. Success metrics

**Primary:**
- % of users who **download** the generated sheet
- % who **generate again for a second exam** (the clearest signal of real value vs. novelty)
- post-export usefulness rating

**Secondary:**
- % using refine actions / "Tighten"
- % uploading >1 file (pack vs. single)
- % choosing MAX
- time from upload to export
- free→paid conversion

## 16. Risks & guardrails

| Risk | Guardrail |
|---|---|
| Wrong prioritization (kills trust) | Confidence labels + source citations on every item; never feign certainty on weak signal. **P0.** |
| MAX too dense → unreadable | Engineered-density rules + 5.5pt font floor + 5-second-scan acceptance test. |
| Generic / AI-slop feel | Formula boxes, named traps, worked examples, citations, the proven color system. |
| Parsing failures (bad pack in) | Single-file PDF path is rock-solid first; degrade gracefully; tell the user when input is thin. |
| "Cheating tool" perception | Market "cheat sheet," ship "exam reference sheet." |
| Speed vs. quality | Two-pass: fast pass-1 + optional one-tap tighten. |
| Unit economics (multi-artifact cost) | v1 = one heavy artifact + cheap meta only. Expansion gated on validated retention. |

## 17. Quality bar (the one test that matters)

A student opens the sheet 48 hours before an exam and instantly thinks: **"Yes. This is exactly what I needed."**

If the first reaction is "too much text" / "too generic" / "hard to scan" / "not enough formulas" / "I don't trust this" — the product failed, regardless of backend cleverness.
