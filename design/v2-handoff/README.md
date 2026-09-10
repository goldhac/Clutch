# Handoff: Clutch — premium redesign (all routes)

## Overview

Clutch turns a pile of course files into **one printable page**, ranked by what is most likely to be tested. Every line on that page carries a confidence score, a source citation, and — when a past exam in the user's own pack asked it — a gold star marking it exam-verified.

This handoff covers a full visual redesign of every route in the existing Next.js app, plus the design system that governs it. The product logic, pricing, copy voice and page structure were kept; what changed is the execution: type, spacing, hierarchy, density, and the introduction of a consistent **trust layer** (score / star / source) that appears identically everywhere a claim is made.

The redesign brief was: *keep the palette, elevate the execution; make it feel premium to a stressed student at 2am, 48 hours before an exam.*

**Audience assumption that drove every decision:** the user is stressed, short on time, and skeptical that an AI tool knows what is on their exam. So the design never asks for trust — it prints the receipt next to every claim and lets the user check it in two seconds.

---

## About the design files

The files in `designs/` are **design references created in HTML**. They are prototypes that show intended look, copy and behavior. **They are not production code to copy directly.**

The task is to **recreate these designs inside the existing Clutch codebase** (Next.js 15 App Router + React + Tailwind, with tokens in `src/renderer/tokens.css` and primitives in `src/components/ui`), using its established patterns, primitives and libraries.

Notes on the format, so nothing here confuses you:

- Each `.dc.html` is a self-contained page that opens in a browser. `designs/support.js` is the tiny runtime that renders them — **it is scaffolding for the prototype only, do not port it.**
- All styling in these files is **inline styles**, deliberately. Do not mirror that in the app — translate the values into Tailwind classes / token references as the codebase already does.
- Each file has a template section and a logic class. The logic class is plain React class-component behavior (state, handlers). Port the *behavior*, not the class shape — the codebase uses function components with hooks.
- Several files have a **screen/state switcher** at the top or a `screen` prop so you can see every state without wiring anything. Those switchers are prototype affordances and **should not be built**.
- `designs/clutch-pool.js` / `clutch-pool.json` hold the realistic ITSS 3300 content pool used across the mocks (131 items, 7 topics). It exists so the mocks show real density instead of lorem. The app already has its own pool; use that.

## Fidelity

**High-fidelity.** Final colors, typography, spacing, radii, shadows, copy and interaction states. Recreate pixel-perfectly using the codebase's existing primitives and tokens. Where a value below differs from what `tokens.css` currently holds, the value below is the intended one.

Two exceptions, both called out again in their sections:

1. **Logo palette is an open decision** (see *Brand*). Two colorways are designed; one must be chosen before implementation.
2. **Results page 2 (the unlocked back page)** uses the front sheet as a stand-in. It needs real back-page content from the engine before it can be built faithfully.

---

## Design tokens

### Color

Light mode only. Ink is the brand; the iris signal is spent sparingly.

**Ink — warm cool-gray (the entire neutral range)**

| Token | Hex | Use |
|---|---|---|
| `ink-900` | `#111114` | Primary text, primary buttons, dark grounds, logo outline |
| `ink-800` | `#1c1c21` | Body text on tinted callouts |
| `ink-700` | `#2c2c33` | Hairlines on dark grounds, swatch labels |
| `ink-600` | `#4a4a53` | Secondary body text |
| `ink-500` | `#6b6b76` | **Minimum for small text on paper.** Meta, captions, mono labels |
| `ink-400` | `#909099` | Meta on dark grounds only — see contrast note |
| `ink-300` | `#b8b8bf` | Disabled text, unfilled progress, body text on ink-900 |
| `ink-200` | `#d9d9de` | — |
| `ink-150` | `#e6e6ea` | **The hairline.** Every divider, card border, table rule |
| `ink-100` | `#f0f0f2` | — |
| `ink-050` | `#f7f7f8` | Inset wells |
| `paper` | `#fbfbfa` | Page background |
| `paper-warm` | `#f5f5f3` | Alternate section ground |
| `surface` | `#ffffff` | Cards, inputs, the sheet itself |
| `field` | `#f2f2f3` | Segmented-control troughs, avatar grounds |
| `border-input` | `#d8d8de` | Input and secondary-button borders |

**Signal — iris (links, focus, paid moments)**

| Token | Hex | Use |
|---|---|---|
| `signal-700` | `#3a34b8` | Link hover in the design-system doc |
| `signal-600` | `#4a46c9` | Link default |
| `signal-500` | `#5b57e0` | Focus rings, the logo bolt, iris accents, active drop state |
| `signal-300` | `#8a86e8` | Mid-weight authority bars |
| `signal-050` | `#ecebfb` | Iris tint ground, avatar ground, selection |

**Confidence tiers — these carry meaning and may not be reused decoratively**

| Tier | Fill | Tint ground | Deep text | Threshold |
|---|---|---|---|---|
| High | `#1a7f4b` | `#e6f4ec` / `#f4f9f6` | — | ≥ 80% |
| Medium | `#a5790a` | `#fdf6e3` | `#8a4a2f` | 50–79% |
| Low | `#b4341f` | `#fdf0ee` | `#8f2a19` | < 50% |
| Verified star | `#a5790a` | — | — | gold `★`, earned only |

**Caution / nudge (the salmon callout)**

| Token | Hex |
|---|---|
| ground | `#fdece4` |
| border | `#f4d3c4` |
| text | `#8a4a2f` |

**Scrim:** `rgba(17, 17, 20, .55)` + `backdrop-filter: blur(2px)`.

#### Contrast rule (must be enforced)

`#909099` on `#fbfbfa` is **3.06:1** — it fails 4.5:1 for small text. In the app, **`#6b6b76` (5.4:1) is the floor for any text under 18px on a light ground.** `#909099` is permitted only on `ink-900` grounds, where it reads 5.3:1.

The mocks are correct on Library, FAQ, Sign in, Modals and Edge States. Home, Generate and Results still have `#909099` mono meta on paper in places — **use `#6b6b76` when you build them.**

### Typography

Three families, loaded from Google Fonts.

| Role | Family | Weights |
|---|---|---|
| Display / headlines | **Newsreader** (serif) | 400 only, `letter-spacing: -0.02em` to `-0.035em` |
| UI / body | **Geist** | 300–700; 500 for UI text, 600 for emphasis and buttons |
| Data / meta | **Geist Mono** | 400–600 |

Fallbacks: `Newsreader, Georgia, serif` · `Geist, system-ui, sans-serif` · `'Geist Mono', ui-monospace, monospace`.

**Scale as used:**

| Use | Size / line-height / tracking |
|---|---|
| Hero h1 | 72px / 1.0 / -0.03em (Newsreader 400) |
| Page h1 | 46–60px / 1.0–1.04 / -0.03em |
| Section h2 | 40–44px / 1.06–1.1 / -0.025em |
| Sub-section h2 | 30px / 1.08 / -0.025em |
| Modal title | 26–29px / 1.1–1.12 / -0.02em |
| Lead paragraph | 16–19px / 1.6–1.65 |
| Body | 14–15px / 1.6–1.65 |
| Small body | 13.5px / 1.6 |
| UI label | 12.5–13px / 600 |
| Mono eyebrow | 10–11px / 600 / `letter-spacing: .08em` / uppercase |
| Mono meta | 11–12px / 400–500 |

`text-wrap: pretty` on paragraphs; `text-wrap: balance` on headlines.

**Rule:** Newsreader is for headlines and modal titles only. Never re-typeset the wordmark, buttons, or UI labels in the serif.

### Spacing, radius, shadow

Spacing is a 4px base used at 4 / 6 / 8 / 9 / 10 / 12 / 14 / 16 / 18 / 20 / 22 / 24 / 26 / 28 / 30 / 32 / 36 / 40 / 44 / 48 / 52 / 56 / 64 / 80 / 88 / 92 / 96 / 120.

| Radius | Use |
|---|---|
| 4px | Formula boxes, dashed inner rules |
| 6–7px | Small squares, icon tiles, segmented pills |
| 8–9px | Buttons, inputs, selects, list rows |
| 10–12px | Cards, tiles, toasts |
| 14px | Modals |
| 999px | Status pills, credits pill, badges |

| Shadow | Value |
|---|---|
| Raised card | `0 1px 2px rgba(17,17,20,.08)` |
| Panel | `0 20px 44px rgba(17,17,20,.1)` |
| Floating sheet | `0 24px 60px rgba(17,17,20,.14), 0 8px 16px rgba(17,17,20,.06)` |
| Lifted sheet (hero) | `0 44px 88px rgba(17,17,20,.26), 0 12px 24px rgba(17,17,20,.08)` |
| Modal | `0 30px 70px rgba(17,17,20,.4)` |
| Toast | `0 14px 34px rgba(17,17,20,.22)` |

**Layout:** content max-width `1180px`, horizontal padding `32px` (app) / `40px` (marketing). App chrome is `60px` tall and sticky with `rgba(251,251,250,.9)` + `blur(10px)`.

### Motion

Deliberately restrained. Keyframes used across the mocks:

| Name | Definition | Use |
|---|---|---|
| `cl-pop` | `opacity 0→1`, `translateY(10px) scale(.985)` → none, **200ms** `cubic-bezier(.2,.7,.3,1)` | Modal entrance |
| `cl-fade` | `opacity 0→1`, **160ms** ease | Scrim |
| `cl-rise` | `opacity 0→1`, `translateY(10px)` → none, **400ms** `cubic-bezier(.2,.7,.3,1)` | Overlay content |
| `cl-spin` | `rotate(360deg)`, **800ms** linear infinite | Step spinner |
| `cl-sweep` | `translateX(-110% → 420%)`, **1.5s** ease-in-out infinite | Indeterminate progress |
| Hover/state transitions | `background .16s, border-color .16s` | Drop zones, rows |

**A fuller motion spec is out of scope of this handoff** — the user's intent is to specify animation separately. Build the above; do not invent additional motion.

---

## Brand

The mark is a study sheet with a folded corner, three ruled lines and a lightning bolt through it — the artifact and the speed in one glyph. Nine repaired SVGs are in `assets/brand/`.

> **The supplied logo pack was broken.** Every file declared its colors as CSS classes (`.navy`, `.blue`, `.lime`) with no `<style>` block present, so all five rendered flat black with the wordmark collapsed to browser-default 16px serif. The files in `assets/brand/` are repaired: explicit `fill` attributes, wordmark set in Geist 700 with an Arial fallback, tightened viewBox.

### ⚠ Open decision — pick one colorway before building

| Option | Files | Colors |
|---|---|---|
| **A — as supplied** | `clutch-horizontal-color.svg`, `-dark.svg`, `clutch-stacked.svg`, `clutch-icon.svg`, `clutch-monochrome.svg` | navy `#0B245C`, electric blue `#1769FF`, lime `#B7F51A`, dark ground `#071536` |
| **B — system palette (recommended)** | `clutch-horizontal-ink.svg`, `-onink.svg`, `clutch-stacked-ink.svg`, `clutch-icon-ink.svg` | ink outline `#111114`, iris bolt `#5b57e0`, gold fold `#a5790a` |

**Why B is recommended:** option A introduces a third blue, a navy that is not ink, and a lime that appears nowhere else in the product. More importantly, green / gold / red already **carry meaning** as confidence tiers on every sheet — a decorative lime competes with the trust layer. Option B is what every mock in this bundle uses.

Both colorways are rendered side by side in section 06 of `designs/Clutch Design System.dc.html`.

### Usage

- **Clear space:** all four sides ≥ the height of the folded corner (≈ ¼ of mark height). Nothing enters it, including the credits pill.
- **Min size:** horizontal lockup ≥ 104px wide. Below that the ruled lines close up — switch to the icon, which holds to 16px.
- **App chrome:** icon at 19×24px (or 26px square) beside the Geist 600 wordmark at 15px, `letter-spacing: -0.01em`, gap 9px. The full lockup SVG is for marketing only.
- **On photography:** reversed only, over ink or a masked dark region. Never the color lockup on an image.
- **Never:** re-typeset the wordmark in Newsreader, add shadow or outline, stretch, rotate, recolor the bolt into a confidence-tier color, or place the mark on the salmon caution ground.
- The wordmark in these SVGs is **live text**. Outline it before sending files outside the team.

---

## The trust layer (build this once, use it everywhere)

This is the single most important pattern in the redesign. Any place the product makes a claim, it shows three things inline:

1. **Confidence dot** — 9–12px circle, tier color, with a 3–4px tint ring (`box-shadow: 0 0 0 4px <tint>`). Green ≥80, gold 50–79, red <50.
2. **Verified star** — gold `★` `#a5790a`. Appears **only** when a past exam in the user's own pack asked this item. Must be stripped automatically when the source file was an image-only scan.
3. **Source line** — `Geist Mono` 12px `#6b6b76`: filename + slide number, e.g. `lecture-databases-slides.pptx · Slide 21`.

Plus a **confidence pill**: `border-radius: 999px`, tier tint ground, `Geist Mono` 12px 600 in the tier's deep color, e.g. `conf high` on `#e6f4ec` in `#1a7f4b`.

`designs/Clutch Home.dc.html` contains an "Anatomy of one line" section that annotates all three parts against a real specimen. Treat it as the spec.

**Rule:** a fake high score is a product failure, not a display bug. The score must be calibrated and the star must be earned, or neither should render.

---

## Screens

Routes map to the existing app. Each design file is listed with its route.

### 1. Marketing home — `/` → `designs/Clutch Home.dc.html`

**This file contains three side-by-side options in a canvas layout.** Each is wrapped in a `<div>` with a visible badge id. **Build `2a`.**

| Option | What it is |
|---|---|
| `1a` | As-shipped reference, for comparison only |
| `1b` | Elevated typographic direction (no photography) |
| `2a` | **The chosen direction** — photographic |

**`2a` structure, top to bottom:**

1. **Nav** — sticky, 60px, hairline bottom, `rgba(251,251,250,.9)` + blur. Icon + wordmark left; `Pricing` / `How it works` / `Sign in` right; ink CTA far right.
2. **Hero** — 660px tall, ink ground, photograph full-bleed behind a directional scrim: `linear-gradient(97deg, rgba(17,17,20,.96) 0%, rgba(17,17,20,.9) 32%, rgba(17,17,20,.42) 68%, rgba(17,17,20,.08) 100%)`. Content max-width 560px, padding `96px 40px 0`.
   - Mono eyebrow `48 HOURS OUT` in `#909099`
   - h1 72px Newsreader 400, `#fff`: *"It decides what's on the exam. Then it proves it."*
   - Lead 17px `#b8b8bf`, max 44ch
   - Buttons: white/ink primary `Drop your files` (50px h, 24px pad, 8px radius); ghost secondary `See a real sheet` (1px `#3a3a44` border, `#e6e6ea` text)
   - Mono trust row: `free preview · no subscription · $4.99 to unlock`
3. **The output** — two-column: left text column (max 400px), right holds the real sheet component **cropped and floating off the right edge**, scaled `1.42` from its top-left corner, in a 920×568 rounded window with the lifted shadow. Caption underneath in mono: *"the real sheet, cropped — the page runs on past the edge."*
   - Left column: mono eyebrow `THE OUTPUT`, h2 44px *"Read it at a glance. Print it at 100%."*, 16px body, then a 3-row hairline fact table (`Format` / `Density` / `Provenance`), then a text link `See the whole page →`.
4. **What goes in** — 320px band, photograph of the paper pile with a left-to-right paper scrim (`rgba(251,251,250,.97) → 0` at 66%). Mono label `WHAT GOES IN` + one 19px sentence. No headline (the photo carries it).
5. **Anatomy of one line** — the trust-layer spec section. Hairline structure: header row (h2 + explanatory paragraph) over a `#111114` rule, then a specimen panel on `#fbfbfa` showing one real pool item with dot + star + title + dark formula box + confidence pill + source line, then a 3-cell annotation table (`01 · SCORE`, `02 · VERIFIED`, `03 · SOURCE`) divided by hairlines.
6. **How it works** — editorial three-up on the ranking rules. Headline: *"Ranked by likelihood. Checked against your own past exams."*
7. **Pricing strip** — the $4.99 / 3-pack proposition inline.
8. **Closer** — ink ground, photograph on the right at 58% width under a diagonal mask: `linear-gradient(95deg, transparent 2%, rgba(0,0,0,.85) 38%, #000 72%)`. h2 72px *"One page. Print it. Take it."*, 16px `#b8b8bf` lead, white CTA, mono `no account needed to preview`.
9. **Footer** — inside the ink block, hairline `#2c2c33` top, reversed icon + wordmark, 5 links at 13px `#909099`, `© 2026 Clutch`.

**Responsive:** the marketing page is authored at 1180px for canvas review. In the app it must reflow — `max-width`, wrapping grid tracks (`minmax(0,1fr)`), no fixed heights on text boxes.

### 2. Generate — `/generate` → `designs/Clutch Generate.dc.html`

**Purpose:** build the file pack, tag each file, see how strong the pack is, spend one credit.

**Layout:** app chrome → page head (mono `STEP 1 OF 2 · BUILD THE PACK`, h1 46px, right-aligned 34ch subhead, over a `#111114` rule) → two columns `minmax(0,1fr) 340px`, gap 44px, right column `position: sticky; top: 88px`.

**Left column — the pack:**

- **Drop zone** — 2px dashed `#d8d8de` on `#fff`, 14px radius, 26px/24px padding. Ink 44px rounded square with upload glyph, title 16px 600, 14px `#4a4a53` sub (`PDF, PPTX, TXT or MD · up to 40 files · past exams count most`), `Browse` secondary button right. **Active drag state:** 2px dashed `#5b57e0` on `#ecebfb`. Real HTML5 drag-and-drop.
- **File ledger** (replaces the shipped card list) — grid `minmax(0,1fr) 132px 96px 34px`, gap 16px. Mono uppercase header row (`File` / `Tagged as` / `Authority`) over a `#111114` rule; each row 15px vertical padding, `#e6e6ea` bottom hairline.
  - Extension chip: 36px square, `#f2f2f3`, mono 10px 600 `#6b6b76`
  - Filename 14px 500, ellipsised; mono 11px meta under it
  - Tag `<select>`: 32px h, 8px radius. **Past-exam state gets `#f4f9f6` ground and `#1a7f4b` text.**
  - Authority bar: 4px track `#e6e6ea`, fill width `weight / 30`, tier-toned; mono `×30` label
  - Remove `✕` button, 28px, hover `#f2f2f3`
- **Tally line** — mono `#6b6b76`: `4 files · 1 past exam · authority total 76` + `clear pack` link
- **Nudge callout** — salmon. Copy is conditional on past-exam count: 0 → nothing can be exam-verified; 1 → a second exam is the biggest available lift; 2+ → enough to verify.

**Authority weights (the ranking contract, surfaced in the UI):**

| Tag | Weight | Bar color |
|---|---|---|
| `past_exam` ★ | 30 | `#1a7f4b` |
| `review` | 22 | `#5b57e0` |
| `homework` | 18 | `#5b57e0` |
| `slides` | 14 | `#8a86e8` |
| `notes` | 10 | `#b8b8bf` |
| `formula_sheet` | 6 | `#b8b8bf` |

**Empty state** — teaches the weighting instead of showing a lonely dropzone: a 4-row hairline table of source classes with their multipliers and bars, a 52ch explanatory paragraph, and a `Load a sample pack →` link.

**Right column:**

- **"How to build it" card** — Exam type (segmented: Conceptual / Problem-solving / Mixed), Density (3 radio rows: MAX / Balanced / Essentials, each with a note; selected row gets `#111114` border + `#fbfbfa` ground + 4px filled radio), Priority (segmented: Balanced / Formulas / Concepts), then Course code + Professor inputs in a 2-col grid.
- **"Confidence in result" card** — big mono percentage in the tier color, then a **stacked segment bar built from each file's actual contribution** (`flex: <weight>` per file, tier-toned, 8px tall, 4px radius, 2px gaps). Note below explains what the next file buys. Empty state reads `—` in `#b8b8bf`.
- **CTA** — 52px ink button `Generate my sheet · 1 credit`; disabled `#e6e6ea` / `#909099` with label `Add files to generate`. Mono note under it: `free preview first · you see it before you pay`.

**Generating overlay** (`screen: "generating"`) — full `#111114`, 460px column, `cl-rise` entrance. Reversed mark in a translucent 44px square, h2 34px Newsreader *"Building your sheet"*, honest 4-step list with three states (done = green `✓` circle; active = spinning ring + `in progress` mono; pending = 1px outline, transparent glyph), indeterminate `cl-sweep` bar, mono caption `reading 4 files · verifying against 1 past exam`, and a **Cancel** link (which the shipped version lacked).

**Step timings:** Reading files 3.2s → Ranking topics 6.0s → Drafting the sheet 9.0s → Verifying page fit (holds).

**Segmented control pattern (reused across the app):** 3px-padded `#f2f2f3` trough, 9px radius; selected pill `#fff` + `0 1px 2px rgba(17,17,20,.08)` + `#111114` 600 text; unselected `#6b6b76`.

### 3. Results — `/results` → `designs/Clutch Results.dc.html`

**Purpose:** read the generated sheet, switch density, unlock the sealed back page, export.

The front page is always free and fully readable. The back page is generated, scored and fitted, then **sealed** — the paywall is a seal over finished work, not a teaser for work not done. Unlock reveals it and enables the 2-page PDF.

Uses the trust layer on every line. Density switcher mirrors the Generate control. `designs/Clutch Sheet.dc.html` is the sheet component itself (7-column MAX layout, 131 items, 1122×794 at A4 landscape).

> **Gap:** page 2 in the mock reuses the front sheet as a stand-in. Real back-page content (traps, worked formulas, the exam-verified block) is needed before this can be built faithfully.

### 4. My Sheets — `/library` → `designs/Clutch Library.dc.html`

Saved sheets with the pool and density each was built from. Hairline list, not cards. Row actions include delete (fires the `delete` modal).

### 5. Pricing — `/pricing` → `designs/Clutch Pricing.dc.html`

$4.99 single / $9.99 3-pack. No subscription. Credits never expire. The free-preview path is stated, never hidden.

### 6. FAQ / How it works — `/faq` → `designs/Clutch FAQ.dc.html`

Explains scores, stars and sources — the trust layer in prose.

### 7. Sign in — `/auth` → `designs/Clutch Sign In.dc.html`

**Split layout**, `grid-template-columns: repeat(auto-fit, minmax(360px, 1fr))` — collapses to one column under ~720px.

**Left (paper, `#fbfbfa`), max 368px column, vertically centered:**
- Icon + wordmark
- h1 40px Newsreader *"Sign in to Clutch"*, 15px sub *"No password. We'll email you a link."*
- `Continue with Google` — 46px, `#fff`, 1px `#d8d8de`, 9px radius, official 4-color Google glyph at 16px, gap 10px
- Divider: hairline / mono `OR` / hairline
- Email input 46px, then submit button 46px
- **Validation:** button is ink `#111114`/white only when `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` passes; otherwise `#e6e6ea`/`#6b6b76`. Submitting an invalid address shows the salmon callout: *"That address does not look complete — check for a typo before we send the link."* Sending state sets label `Sending…` and `opacity: .75`; resolves after ~1.1s.
- 13.5px note: *"New here? The link creates your account."*
- `← Back home` at 12.5px `#6b6b76`

**Sent state** — green 52px envelope circle (`#e6f4ec` / `#1a7f4b`), h1 38px *"Check your email"*, address rendered in mono 13.5px ink, mono note *"the link works for 15 minutes"*, then `Resend` (iris, and it acknowledges itself by changing the note to `link resent · works for 15 minutes` for 3s) and `Use a different email`.

**Right (ink `#111114`):** corridor photograph at `opacity: .5` under a bottom-up mask (`linear-gradient(180deg, transparent 0%, rgba(0,0,0,.7) 46%, #000 100%)`). Mono eyebrow `WHY AN ACCOUNT`, h2 44px *"Your sheets follow you."*, three hairline rows (saved sheets on any device / the pool and density each was built from / credits and unlocks already paid for), closing mono line: *"the preview needs no account · sign in only to keep things."*

### 8. Modals & overlays → `designs/Clutch Modals.dc.html`

A pattern library, not a route. Eight modals and four toasts. Each modal sits on a dark tile labeled with its mono key and its trigger; clicking opens it over the real page.

**Card spec:** max-width 420px in gallery / 460px live, 14px radius, `#fff`, padding `28px 30px 26px`, modal shadow, `cl-pop` entrance over a `cl-fade` scrim. Header row = 7px tone dot + mono uppercase eyebrow, with a 28px `✕` on the live card. Title 26–29px Newsreader. Body 14px `#4a4a53`. Then either a 2-up option grid (ink primary tile + white bordered tile, each with a label and a mono sub-line) **or** a primary/secondary button row. Footer strip: `13px 30px`, hairline top, mono 11px, tinted to the consequence.

**Tone dots:** iris `#5b57e0` = a decision; red `#b4341f` = destructive; gold `#a5790a` = caveat. Destructive modals get a `#b4341f` primary button.

**Footer tints:** good `#f4f9f6`/`#1a7f4b` · bad `#fdf0ee`/`#8f2a19` · warn `#fdece4`/`#8a4a2f` · plain `#fbfbfa`/`#6b6b76`.

| Key | Trigger | Decision | Footer |
|---|---|---|---|
| `unlock` | results · sealed back page | `Unlock · $4.99` / `3-Pack · $9.99` | `page 1 stays free, forever · no subscription` (good) |
| `credits` | generate · no credits left | `Single · $4.99` / `3-Pack · $9.99` | `previews are always free` (plain) |
| `save-signin` | results · save while signed out | `Email me a link` / `Not now` | `no password · we email nothing else` (plain) |
| `delete` | library · trash icon | `Delete sheet` / `Keep it` | `cannot be undone` (bad) |
| `export` | results · export while locked | `Front page` (free) / `Both pages` (needs unlock) | `prints at 100% on A4 landscape, borderless` (plain) |
| `export-failed` | results · render violated a rule | `Try Balanced` / `Back to sheet` | `error 422 · clip verifier` (bad) |
| `generation-failed` | generate · engine failed twice | `Try again` / `Change the pack` | `credit refunded · 2 credits available` (good) |
| `scan-warning` | generate · image-only files | `Generate anyway` / `Swap those files` | `11 items would come from those two files` (warn) |

**Toasts** — 2.6s, top center, `#111114`, 10px radius, toast shadow, 11px/16px padding, 13px 500 white label with a leading mark (green `✓` `#4ade80`, gold `★` `#f0c14b`): `Saved to My Sheets` · `Exported · 2-page PDF` · `Unlocked · both pages are yours` · `Link resent · works for 15 minutes`.

**The three interruption rules (enforce these in review):**

1. **A modal costs the user their place.** Use one only when the next step needs a decision — money, deletion, or a failure the user must know about. Progress and success go to toasts.
2. **Say what it costs, in the modal.** Prices, refunds and what happens to a credit are on the card, not one click away. No modal ever hides the free path.
3. **Dismissal is always free.** Scrim click, `Escape`, and a named secondary action all leave state untouched. Nothing is charged or deleted by closing a card.

### 9. Edge states → `designs/Clutch Edge States.dc.html`

Three states behind a prototype switcher.

- **404** (`/*`) — mark, mono `ERROR 404`, h1 60px *"This page isn't on the sheet."* over a `#111114` rule, 16px lead, ink `Back home` + secondary `Make a sheet` (both 48px), then a 3-row hairline list (`Make a sheet` / `Pricing` / `How it works`) each with a right-aligned 13.5px note. Copy is unchanged from the shipped page.
- **Print error** (`/print?token=…` with a dead token) — 560px card. Red dot + mono `PRINT TARGET · NO POOL`, h1 30px *"This print link has expired."*, explanation that pools are held for minutes then dropped so a sheet can never render from a stale token and **nothing was charged**, `Back to my sheet` / `My Sheets`, red footer `no-pool · token expired or invalid`. Below the card, a mono note that `/print` is a headless render target.
- **Offline** — 52px slashed-wifi circle, h1 44px *"You're offline."*, then a 3-row availability table: saved sheets `available`, printing an open sheet `available`, generating and unlocking `needs a connection` (in `#8f2a19`). Ink `Open My Sheets` button.

`/print` itself needs no visual design beyond this error state — it is a headless target for the PDF pipeline and must stay free of app chrome.

### 10. Design system doc → `designs/Clutch Design System.dc.html`

Seven sections: 01 Color, 02 Type, 03 Space & elevation, 04 Primitives, 05 Trust layer, 06 Brand, 07 Laws. Read this first; it is the reference the other files were built against.

---

## Interactions & behavior

| Surface | Behavior |
|---|---|
| Generate drop zone | Real `dragover` / `dragleave` / `drop`. Dropped filenames are auto-tagged by regex: `/exam\|midterm\|final\|quiz/` → `past_exam`; `/review/` → `review`; `/\bhw\d?\b\|homework/` → `homework`; `/note/` → `notes`; `/formula/` → `formula_sheet`; else `slides`. |
| Tag change | Recomputes that row's bar, the tally, and the confidence bar synchronously. |
| Confidence | `min(100, Σ weights)`. Tier at 80 / 50. |
| Generate CTA | No-op while the pack is empty. Starts the overlay and the step timeline. |
| Overlay cancel | Clears all timers and returns to the form. |
| Modals | Open on tile click; close on scrim click, `✕`, `Escape`, or any action button. Every action in the prototype closes — wire real handlers. |
| Sign in | Email regex gates the button; invalid submit shows the callout; send resolves after ~1.1s to the sent state; `Resend` flashes its note for 3s; `Use a different email` returns to the form. |
| Density switch | Re-renders the sheet at the new density; the fit check must pass before it commits. |
| Export | Must fail closed — if a block clips, stop and show `export-failed`; never hand over a cut-off sheet, and never charge for one. |
| Generation failure | After two contract-check failures, refund the credit automatically and say so in the modal. |

**Cleanup:** every timer set in these prototypes is cleared on unmount, and the `Escape` listener is removed. Preserve that discipline.

## State

Per surface, the state the UI actually needs:

- **Generate:** `files[] {name, size, tag}`, `examType`, `density`, `priority`, `courseCode`, `professor`, `generating`, `step`, `dragging`
- **Results:** `density`, `unlocked`, `page`, `exporting`
- **Sign in:** `email`, `sent`, `sending`, `invalid`, `resent`
- **Modals:** one `openModal` key, nullable
- **Edge states:** `screen`

Derived, never stored: confidence total, tier, per-row bar widths, tally string, nudge copy, CTA enablement.

## Assets

| Asset | Source | Notes |
|---|---|---|
| `assets/brand/*.svg` (9) | Repaired from the user's supplied logo pack | Wordmark is live text — outline before external use |
| Hero photograph (corridor) | **AI-generated for these mocks** | Placeholder. Replace with licensed or original photography before shipping. |
| Paper-pile photograph | **AI-generated for these mocks** | Same. |
| 2am desk flat-lay | **AI-generated for these mocks** | Same. |
| Fonts | Google Fonts: Newsreader, Geist, Geist Mono | Self-host in production |
| Icons | Inline SVG, 1.6–2.1px stroke, round caps/joins | Match the codebase's icon set if one exists |

**Photography is currently referenced by URL from the generator's CDN.** Those URLs are not permanent — download and re-host, or swap in real photography, before building. In the prototypes each photo sits in a drag-and-drop slot (`designs/image-slot.js`, prototype-only) so it can be swapped by dropping a file.

**No AI-generated imagery should ship.** Treat all three photographs as art direction: what the shot should be, framed how, lit how.

## Files

```
design_handoff_clutch_premium/
├── README.md                       ← this file
├── assets/brand/                   ← 9 repaired logo SVGs
└── designs/
    ├── Clutch Design System.dc.html    reference — read first
    ├── Clutch Home.dc.html             / — build option 2a
    ├── Clutch Generate.dc.html         /generate (+ generating overlay)
    ├── Clutch Results.dc.html          /results
    ├── Clutch Sheet.dc.html            the sheet component itself
    ├── Clutch Library.dc.html          /library
    ├── Clutch Pricing.dc.html          /pricing
    ├── Clutch FAQ.dc.html              /faq
    ├── Clutch Sign In.dc.html          /auth
    ├── Clutch Modals.dc.html           modal + toast library
    ├── Clutch Edge States.dc.html      404, print error, offline
    ├── clutch-pool.js / .json          demo content pool (do not port)
    ├── image-slot.js                   prototype drop-slot (do not port)
    └── support.js                      prototype runtime (do not port)
```

Open any `.dc.html` directly in a browser. Files with a `screen` prop or a switcher expose every state without wiring.

## Before you start — the three open items

1. **Pick a logo colorway** (option A or B above). B is recommended and is what all mocks use.
2. **Get real back-page content** for Results page 2, or build the seal and defer the reveal.
3. **Replace the three photographs** with licensed or original shots, and re-host them.

And one correction to apply as you build: **`#6b6b76` is the floor for small text on paper.** Home, Generate and Results still carry `#909099` mono meta in places — do not reproduce it.
