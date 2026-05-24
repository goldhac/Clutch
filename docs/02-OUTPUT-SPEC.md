# CramSheet — Output Specification

**The proven rendering + content standard.** Build to this. These recipes are not theoretical — they are extracted from a working version of this product that was built by hand and validated against real exams. Where this conflicts with a generic instinct, follow this.

Companion to `01-PRD.md`. Covers: design tokens, density geometry, content patterns, the prioritization rubric, and the render pipeline.

---

## 1. Design tokens (reuse everywhere)

```
Primary indigo    #3b3593   (h1/h2 banner default)
Primary indigo-2  #6a5cff   (gradient pair for h1)
Strong red        #b53756   (bold "must-know" text, danger callouts)
Emphasis teal     #0d8b8b   (emphasis / "watch out" — rendered bold, not italic)
Correct green     #1f7d3a   (✓ marks, high confidence)
Warning orange    #b35c00   (trap callouts)
Exam gold         #a08200   (exam-verified / likely-question accents)
Code bg dark      #1c2030
Code fg light     #e6e9f0
Light fill        #f1f3f8   (inline code bg)
Light bg          #f6f7fb   (zebra rows)
Border light      #d8dbe4   (table border)
Border mid        #b8bbc4   (column rule, hr)
```

**Topic palette** (for color-coding topics on multi-topic sheets — cycle through these):
```
BLUE   #1e5fa3      GREEN  #1f7d3a
PINK   #c8336b      MAROON #8b1a1a
TEAL   #0d8b8b      PURPLE #6a3d9a
ORANGE #b35c00      GOLD   #a08200
INDIGO #3b3593      OLIVE  #5e5326
```

## 2. Typography

- **Body:** `-apple-system, "Helvetica Neue", Arial, sans-serif`
- **Code/mono:** `"Menlo", "Consolas", monospace`
- **Inline semantic conventions** (apply consistently across all artifacts):
  - `**bold**` = must-know fact → renders **strong red** `#b53756`
  - `*emphasis*` = watch-out → renders **teal, bold, non-italic** `#0d8b8b`
  - `★` prefix = exam-verified (a prior exam confirmed this)
  - `✓` = correct option · `✗` = wrong option (often struck through)
  - blockquote (`>`) = trap callout → orange-tinted box
  - any 2–4 item comparison → **table**, never prose

## 3. Density geometry

Three render modes of identical ranked content. CSS-driven, print-first.

### Minimal
```css
column-count: 2;
body  { font-size: 9pt;  line-height: 1.35; }
/* ~70% page coverage, generous whitespace, clearer wording, fewer items */
```

### Standard
```css
column-count: 3;
body  { font-size: 7.5pt; line-height: 1.25; }
/* ~85% coverage, balanced formulas + concepts + a few example Qs */
```

### MAX (the hero)
```css
@page { size: A4 landscape; margin: 0.16in 0.14in; }
.cols {
  column-count: 4;          /* default 4; allow 5; never promise 7 on one page */
  column-gap: 5pt;
  column-rule: 0.4pt solid #b8bbc4;
  column-fill: auto;        /* CRITICAL — see §3.1 */
}
body  { font-size: 6.1pt; line-height: 1.15; }  /* hard floor 5.5pt */
code, pre { font-size: 5.2pt; }
h2    { font-size: 6.4pt; }
table { font-size: 5.6pt; }
/* 92–97% coverage */
```

### 3.1 The `column-fill: auto` lesson (do not skip)
- `column-fill: balance` (the default) makes all columns end at the same height — if content is short, **every** column gets short and you get whitespace at the bottom. Bad.
- `column-fill: auto` fills column 1, then 2, etc. — but if content is too short, trailing columns are **empty**.
- **Fix:** generate ~25% more content than seems necessary, then let `column-fill: auto` truncate naturally at the page boundary. Target slight overflow, never underflow.

### 3.2 MAX is *engineered* density, not max characters
- No paragraphs. Everything is a list, table, or labeled callout box.
- ≤3 bullet levels.
- Keep small structural whitespace **around** formula boxes and traps — it speeds scanning and recall. A literal 100% fill is *worse*.
- Color first, text second: under stress the eye finds color instantly, reads slowly. Color-code and add a legend strip if multi-topic.

## 4. The six content patterns (the building blocks)

| Pattern | When | Shape |
|---|---|---|
| **Formula block** | Any formula | formula + var defs + when-to-use + 1-line trap + micro example Q |
| **Compact table** | Compare 2–4 items | e.g. z-test vs t-test |
| **Memorize-cold table** | Direct-hit facts | "QUORUM = RF/2 + 1" style |
| **Worked example box** | Anything with numbers | show real numbers, not just the formula |
| **TRAP callout** | False-statement gotchas | "X is FALSE because Y" in a red/orange-tinted box |
| **Q&A bullet line** | Anticipated quiz pattern | "Q → answer ✓ · distractor ✗" |

**Hard content rules:**
1. **No filler.** If a sentence doesn't change what the student does on the exam, cut it.
2. **Worked numeric example > bare formula.** A formula says what to compute; a worked example shows the answer *pattern*.
3. **Name the traps.** "X is FALSE because Y" beats "be careful about X."
4. **Every section ends with something concrete** — a worked example, a table, or a memorize-cold row. No theory-only sections.
5. **Code/algorithm blocks get goal + step comments** (`# 1. Goal`, `# 2. step`) so the pattern is recognizable at a glance.

## 5. Formula block — canonical shape

```
[★ if exam-verified] FORMULA NAME                    ● confidence dot
┌─────────────────────────────────────────┐
│  x̄ ± t*(s/√n)                            │   ← mono, dark bg
└─────────────────────────────────────────┘
vars: x̄ sample mean, s sample SD, n size, t from t-table (df=n-1)
use:  σ unknown AND small n
⚠ trap: NOT z* here — that's only when σ is known
Q: build a 95% CI for n=10, x̄=50, s=4                 · Review p2
```

## 6. Per-item metadata (the trust layer — non-negotiable)

Every ranked item carries:
- **confidence:** `high` (green dot) / `med` (gold dot) / `low` (gray dot)
- **source:** short citation — "Slide 14", "Review p2", "HW3 Q5", "Past exam 2024 Q5"
- **★** if a prior exam directly confirms it

Never emit a `high` confidence on weak (single-source, no-exam) signal. Weak signal → `low` + "possible". This is what makes a wrong call survivable.

## 7. Prioritization rubric (engine)

Score each extracted item; rank desc.

**Highest weight:** in a past exam · in a review guide · repeated across homework · in worked examples · explicitly flagged important.
**Medium:** repeated across lectures · in headings/summary slides · formula reused in multiple contexts · concept tied to a known mistake.
**Lowest:** single mention in notes only · background · filler.

**Verified-exam refactor (when a past exam is supplied):**
1. Read every prior question (including ones the student got right — they reveal reused patterns).
2. Catalogue each by topic, question type (MCQ / select-all / code-completion / T-F / matching), and trap pattern.
3. Compute topic "heaviness" → double down where the prof asked the most.
4. Map each prior Q to the section that should answer it; if it doesn't, that's a **gap**.
5. Fill gaps: worked numbers for numeric Qs, exact syntax where options differ by one token, named FALSE-statement boxes for select-the-true Qs, memorize tables for ordering Qs.
6. Surface a "Verified Q Patterns" block first.

Professors reuse ~70% of question patterns. Cover those with worked numbers and the student pattern-matches instead of computing under pressure.

## 8. Render pipeline

- **Author the sheet as HTML** with an embedded `<style>` block (markdown isn't expressive enough for the column layouts + inline classes). Generic-doc artifacts (notes, CLUTCH later) may go markdown → HTML.
- **HTML → PDF via headless Chrome**, not pandoc-direct (pandoc PDF is ugly; HTML→Chrome gives full CSS control):
  ```bash
  chrome --headless --disable-gpu --no-pdf-header-footer \
    --print-to-pdf="sheet.pdf" "file://$(pwd)/sheet.html"
  ```
  (In a Node/serverless context, use Puppeteer/Playwright headless Chromium with `printToPDF`.)
- **Verify page count** after render — MAX must hold to **one** page:
  ```bash
  python3 -c "from pypdf import PdfReader; print(len(PdfReader('sheet.pdf').pages))"
  ```

## 9. Two-pass quality loop

- **Pass 1:** generate + render fast. Show it.
- **Pass 2 (optional "Tighten"):** a critique step scores the sheet /10 and emits TODOs (missing traps, theory-only sections, under/overflow, weak confidence calls). Fix every TODO or explicitly reject with reason, then re-render and re-verify page count.
- Manual benchmark: pass 1 ≈ 8.5/10, pass 2 ≈ 9.1/10. The tighten pass is where "good" becomes "this saved me."

## 10. Acceptance checklist (per generated sheet)

- [ ] Fits exactly one A4 landscape page at the chosen density (verified by page count).
- [ ] MAX body font ≥ 5.5pt; no paragraph blocks; ≤3 bullet levels.
- [ ] `column-fill: auto`; no bottom whitespace; no empty trailing column.
- [ ] Every item has a confidence dot + source citation.
- [ ] No `high` confidence on single-source/no-exam signal.
- [ ] Every section ends with a concrete element (example/table/row).
- [ ] At least the proven patterns present where applicable (formula blocks, named traps).
- [ ] Traps are named ("X is FALSE because Y"), not vague.
- [ ] Passes the 5-second scan test; reads like a top student made it under pressure.
