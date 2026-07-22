# Handoff: CramSheet — Product Design System & Screens

## Overview

CramSheet is a web app that turns a student's uploaded exam materials (slides, review guides, past exams, notes) into a single, dense, printable **Exam Reference Sheet** that ranks what's most likely tested and proves every claim with a **confidence score** and a **real source citation**. Marketing calls it a "cheat sheet"; the product surface and the exported PDF call it an "Exam Reference Sheet."

The product is designed for one specific moment: **2am, ~48 hours before an exam, stress at its peak** — so every screen answers one question and offers one obvious next action.

This bundle contains two design files:

1. **`CramSheet.dc.html`** — the complete design system + a full-screen walkthrough of every product surface (marketing site → auth → app → the sheet). This is the primary reference.
2. **`CramSheet Density Modes.dc.html`** — the hero artifact: a realistic, populated A4-landscape reference sheet shown at all three density modes (MAX / Balanced / Essentials), with the density controls exposed as tweakable props.

> The logo/brand identity files are intentionally **not** included in this handoff — brand assets are being finalized separately.

## About the Design Files

The `.dc.html` files in this bundle are **design references created in HTML** — prototypes that show the intended look, layout, and behavior. They are **not production code to copy directly.**

They are authored as "Design Components" (a streaming HTML component format): each file is a `<x-dc>` template plus a `Component` logic class, mounted by the included `support.js` runtime. **You do not need to keep this format.** `support.js` is a preview runtime only — do not port it.

Your task is to **recreate these designs in the target codebase's environment** (React, Vue, Svelte, SwiftUI, etc.) using its established component patterns, styling approach, and libraries. If no codebase exists yet, choose the most appropriate modern framework (React + TypeScript recommended) and implement there. Lift the exact values (hex, spacing, type, radii, shadows, copy) from this README and the HTML source.

### How to read the source

- **Styling is inline** (`style="..."`) throughout — this is a quirk of the authoring format, not a recommendation. Extract the values into your styling system (CSS variables, Tailwind config, styled-components theme, etc.). The full token set is defined as CSS custom properties in the `:root` block at the top of `CramSheet.dc.html` — **start there.**
- **Repeated rows/cards** use `<sc-for list="{{ items }}" as="item">` (a loop) and the data lives in the `Component` class's `renderVals()` return object. Read that method to get exact content/copy.
- **Conditionals** use `<sc-if value="{{ x }}">`.
- Icons are inline **Lucide** SVG paths (1.6px stroke, 24px grid, round caps/joins).

## Fidelity

**High-fidelity (hifi).** These are pixel-level mockups with final colors, typography, spacing, radii, shadows, motion specs, and real copy. Recreate the UI faithfully using the codebase's libraries. Where this README gives exact hex/px values, treat them as the spec.

**Light color mode only** — there is no dark mode. (The sheet "lives on paper," so the whole product commits to light mode.)

---

## Design Tokens

All tokens are defined as CSS custom properties in `:root` at the top of `CramSheet.dc.html`. Reproduce them in your theme.

### Color — Ink / neutral scale (warm cool-gray)
| Token | Hex | | Token | Hex |
|---|---|---|---|---|
| `--ink-900` | `#111114` | | `--ink-300` | `#b8b8bf` |
| `--ink-800` | `#1c1c21` | | `--ink-200` | `#d9d9de` |
| `--ink-700` | `#2c2c33` | | `--ink-150` | `#e6e6ea` |
| `--ink-600` | `#4a4a53` | | `--ink-100` | `#f0f0f2` |
| `--ink-500` | `#6b6b76` | | `--ink-50` | `#f7f7f8` |
| `--ink-400` | `#909099` | | `--paper` | `#fbfbfa` |
| | | | `--paper-2` | `#f5f5f3` |
| | | | `--white` | `#ffffff` |

### Color — Brand (ink primary + iris "signal")
The primary brand action color is **ink (`#111114`)** — buttons and primary CTAs are near-black. The **iris/indigo "signal"** is the secondary accent (links, upgrade, focus rings, highlights).
- `--signal-700` `#3a34b8` · `--signal-600` `#4b45d6` · `--signal-500` `#5b57e0` · `--signal-100` `#ecebfb` · `--signal-50` `#f5f4fe`
- Editorial salmon (FT-weekend nod, used on "proof"/verified surfaces): `--salmon` `#fdece4`, `--salmon-line` `#f4d3c4`, salmon text `#8a4a2f`

> Note: an alternate brand palette appears in the logo files (primary indigo `#3b3593`, secondary `#6a5cff`, exam-gold `#a08200`). The **product screens use the `--signal-*` indigo above.** Confirm the final brand indigo with the team before shipping; the logo palette and the product signal palette should be reconciled.

### Color — Confidence tiers (THE trust layer — see below)
| Tier | Dot / text | Background |
|---|---|---|
| High confidence (≥80%) | `--conf-high` `#1a7f4b` | `--conf-high-bg` `#e6f4ec` |
| Medium (50–79%) | `--conf-med` `#b26a00` | `--conf-med-bg` `#fbf0dd` |
| Low (<50%) | `--conf-low` `#c0392b` | `--conf-low-bg` `#fbe9e7` |
| Verified ★ | `--verified` `#a5790a` | `--verified-bg` `#fbf3da` |

### Color — Functional
- Info `--info` `#2f6db3` / `--info-bg` `#e8f1fb`
- Warning `--warn` `#b26a00` / `--warn-bg` `#fbf0dd`
- Danger `--danger` `#c0392b` / `--danger-bg` `#fbe9e7`
- Success `--success` `#1a7f4b` / `--success-bg` `#e6f4ec`

### Color — Topic palette (for multi-topic sheets)
`--topic-1` `#5b57e0` · `--topic-2` `#1a7f4b` · `--topic-3` `#b26a00` · `--topic-4` `#2f6db3` · `--topic-5` `#8e44ad` · `--topic-6` `#c0392b`

### Typography
- **Sans (UI):** `Geist` — weights 300–800. Fallback: `-apple-system, BlinkMacSystemFont, sans-serif`.
- **Serif (editorial display):** `Newsreader` — used for hero/section headlines, page titles, big numbers. Fallback: `Georgia, serif`.
- **Mono (citations, formulas, metadata, labels):** `Geist Mono`. Fallback: `ui-monospace, SFMono-Regular, monospace`.
- Body smoothing: `-webkit-font-smoothing: antialiased`; sans uses `font-feature-settings:'ss01','cv01'`.

Type scale (role · font · size / line-height / tracking):
- Display — Newsreader 400 · 56px / 1.05 / −.02em
- H1 — Newsreader 400 · 40px / 1.1
- H2 — Geist 600 · 28px / 1.2
- H3 — Geist 600 · 19px / 1.3
- Body L — Geist 400 · 17px / 1.55
- Body — Geist 400 · 14px / 1.55
- Label — Geist 550 · 13px
- Mono / cite — Geist Mono 500 · 12px / 1.4

### Spacing — 4px base
4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 (px).

### Radius
`--r-xs` 4 · `--r-sm` 6 · `--r-md` 8 · `--r-lg` 12 · `--r-xl` 18 · `--r-full` 999px.

### Shadow (elevation)
- `--sh-xs` `0 1px 2px rgba(17,17,20,.05)` — hairline lift, chips
- `--sh-sm` `0 1px 3px rgba(17,17,20,.07), 0 1px 2px rgba(17,17,20,.04)` — buttons, inputs
- `--sh-md` `0 4px 12px rgba(17,17,20,.08), 0 2px 4px rgba(17,17,20,.04)` — cards, dropdowns
- `--sh-lg` `0 12px 32px rgba(17,17,20,.10), 0 4px 8px rgba(17,17,20,.05)` — popovers, toasts
- `--sh-xl` `0 24px 60px rgba(17,17,20,.14), 0 8px 16px rgba(17,17,20,.06)` — modals, the sheet

### Motion
- Durations: `--dur-fast` 120ms (hovers, color shifts, chip toggles) · `--dur` 200ms (buttons, dropdowns, tab switches) · `--dur-slow` 360ms (page & modal transitions, meter climb).
- Easing: default `cubic-bezier(.2,.6,.2,1)`; entrances `cubic-bezier(.16,1,.3,1)`. **Nothing bounces.** Respect `prefers-reduced-motion`.
- Keyframes used: `ds-climb` (progress/meter width 0→value), `ds-spin` (loading spinner), `ds-pulse` (indeterminate bar), `ds-rise` (modal/entrance fade-up), `ds-shimmer` (skeletons).

### Iconography
**Lucide**, 1.5–1.6px stroke, 24px grid, round caps & joins. Line-only — never filled, **except** the confidence dot (filled circle) and the verified **★** (filled star), which are the two intentional exceptions that carry meaning.

---

## THE trust layer (the product's core — do not simplify away)

Every ranked item on a sheet — and in the app's ranked lists — **must** display three things together. This is the moat; never hide it for a "cleaner" look:

1. **Confidence dot** — a filled circle colored by tier (high/med/low, hexes above), often with a soft ring of the tier's `-bg` color (`box-shadow: 0 0 0 3px <tier-bg>`).
2. **★ Verified marker** — a gold (`--verified` `#a5790a`) star shown only when the item's pattern was matched against a real past exam.
3. **Source citation** — mono text tracing the claim to its origin, e.g. `L08 s23 · Final '19 Q3` (lecture 08, slide 23; appeared on the 2019 final, question 3).

Supporting patterns (all in `CramSheet.dc.html`, "Patterns" section):
- **Ranked topic row** — dot + optional ★ + title + mono citation + rank badge (`#1`, `#2`…).
- **Confidence meter** — a labeled bar that climbs (`ds-climb`) as higher-weight files are added; gradient from `--conf-med` → `--conf-high`; % in mono.
- **Inline citation** — a highlighted phrase with a superscript mono source tag.
- **Warnings strip** — amber `--warn-bg` bar for engine flags (e.g. "topics trimmed to fit one page," "file was image-only / OCR'd").

---

## Screens / Views

All screens live in `CramSheet.dc.html`, each in its own bordered container (marketing screens shown inside a browser-chrome frame; app screens inside app chrome). IDs in the file: `#home`, `#pricing`, `#faq`, `#auth`, `#generate`, `#loading`, `#results`, `#library`, `#states`, `#sheet`.

### Marketing — Home (`#home`)
- **Purpose:** convert a stressed student fast.
- **Layout (top→bottom):** sticky nav (wordmark left; Pricing / How it works / Sign in + primary CTA right) → centered hero on a faint grid background → **hero proof: a real blurred MAX sheet** with one unblurred confidence-callout floating over it → "How it works" 3-step → "Why we're different" (the trust-layer angle, with a salmon evidence-card) → pricing preview (3 tiers) → dark footer.
- **Hero copy:** headline "The one-page cheat sheet that knows what's on the exam." Primary CTA **"Drop your files"**; secondary "See a sample sheet." Sub-line: "Free preview, always · No subscription · $4.99 to unlock a sheet."
- Primary buttons are ink (`--ink-900`) with `--sh-md`, 14px/500 Geist; hover darkens to `--ink-800` and lifts `translateY(-1px)`.

### Marketing — Pricing (`#pricing`)
- **Three one-time tiers, no subscription anywhere.** Free preview always.
  - **Single — $4.99** — one full sheet / one credit, never expires.
  - **3-Pack — $9.99** — three sheets ($3.33 each). **Featured** (ink border, "Best value" badge, `--sh-lg`).
  - **Sprint Pass — $14.99 / 7 days** — unlimited sheets for a week, priority generation.
- Reassurance bar: "Free preview on every sheet."
- Featured-card styling is data-driven (`pricingFull` in `renderVals()` carries `borderColor`, `shadow`, `btnBg`, etc. per tier — do NOT put ternaries in markup; precompute per item).

### Marketing — FAQ (`#faq`)
- One-column read, max ~620px. 6 Q&As (source of truth: `faqs` array). Dark CTA card at the bottom ("Still deciding? The preview is free.").

### Auth (`#auth`)
- Minimal, one-column, two states shown side by side:
  - **Sign in / up** — "Continue with Google" button (inline multicolor Google G), divider, email field, primary **"Email me a magic link."** No password. Sub-copy: a link creates the account.
  - **Magic-link sent** — envelope icon with a success check badge, "Check your email," the address in mono, "link works for 15 minutes," Resend / Use a different email actions.

### App — Generate (`#generate`)  ·  two states
Authenticated app chrome: wordmark, segmented tabs (Generate / My Sheets), a credits pill (amber when low), avatar. Two-column body: left = files, right = settings + generate.
- **Empty state:** big dashed **file-drop zone** ("Drag files here, or browse"; PDF/PPTX/DOCX up to 40MB each; privacy note). Right column settings are disabled/dimmed; confidence meter shows "—"; primary button disabled: "Add files to generate."
- **Loaded state:** list of per-file rows — each with a colored file-type chip (PDF/DOC), name, size/pages, an editable **tag chip** (Slides / Review guide / ★ Past exam / Notes), and a remove ✕. "Add more" affordance. Right column: three controls — **Exam type**, **Density** (segmented MAX / Balanced / Essentials), **Priority**. **Confidence-in-result meter** that climbs as higher-weight files are added (shown at 72% with hint "Add a past exam to push confidence past 85%"). Primary CTA: **"Generate my sheet · 1 credit."**
- File-row content is data-driven (`genFiles`).

### App — Generating / Loading (`#loading`)
- Full dark (`--ink-900`) screen for the 30–90s generation. Centered card with a 4-step **progress narrative** (done / active / pending states, data in `loadSteps`): **"Reading your files → Ranking topics → Drafting the sheet → Verifying page fit."** Done steps get a green check; active step gets a spinner; pending are dimmed. A determinate bar + a caption ("Reading 4 files · 235 pages · verifying against 1 past exam").

### App — Results (`#results`)  ·  two variants
- App chrome with breadcrumb + a "Fits at MAX" / "N warnings" status pill, a **density switcher** (segmented MAX / Balanced / Essentials), **"Make another,"** and **"Export PDF."** Toolbar wraps (`flex-wrap`) so Export PDF is never clipped.
- The sheet sits centered on a **soft-gray workspace** (`--paper-2`) with `--sh-xl`.
- **Variant A (clean):** no warnings — Intro Statistics sheet.
- **Variant B (with warnings):** a stacked **warnings strip** above the sheet — "5 topics trimmed to fit one page" (with "Review trimmed") and "1 file was image-only / OCR'd" (dismissible) — Organic Chemistry sheet.
- Preview content is data-driven (`resStats`, `resChem`, `resVerified`).

### App — Library / My Sheets (`#library`)
- App chrome (My Sheets tab active). Header with count + sort, a search input, and a **"New sheet"** button.
- **4-column grid of sheet cards** (data: `library`): each card is an A4-ratio thumbnail (faux ruled/columned content) with a density badge, plus title, a topic-color dot, course + date. Cards lift on hover (`--sh-lg`, `translateY(-3px)`).

### App — Upgrade & Error states (`#states`)
- **In-app upgrade modal:** shown when credits hit 0. "0 credits left" pill, "Keep the momentum going," a Single vs 3-Pack mini-compare (3-Pack marked "Best value"), actions "Not now" / "Get 3-Pack · $9.99." (A generic modal primitive also exists in the Primitives section.)
- **Error state cards (stack, data: `errorStates`):**
  - **Generation failed** (danger) — "Your credit was refunded automatically." Actions: Try again / Contact support.
  - **File too big** (warning) — 40MB per-file limit. Actions: Choose another file / How to split.
  - **Image-only PDF** (info) — OCR'd, lower accuracy. Actions: Keep with OCR / Replace file.

### The Sheet (`#sheet` in `CramSheet.dc.html`, and the full study of it in `CramSheet Density Modes.dc.html`)
The hero artifact and the whole reason the product exists.

**Two physics constraints (only these are non-negotiable):**
1. **ONE A4 landscape page, print-first** — no gradients, no interactions, nothing that only works on screen. (A4 landscape ≈ **1123 × 794px** at 96dpi; the mocks use exactly this box with `overflow:hidden`.)
2. **Every ranked item shows conf dot + ★-if-verified + source citation.**

Everything else (colors, layout, callout treatments) is fair game. The mock in `CramSheet.dc.html` is a fully-populated **Intro Statistics** MAX sheet: a header with a legend, a 3-up **verified Q-pattern** strip (salmon), then a 4-column body packed with sections (Confidence intervals, z-vs-t table, hypothesis testing, p-value & error types, distributions, regression, critical-values table, most-likely-questions, worked example, common traps, key formulas, definitions, exam-day checklist), and a footer summarizing provenance ("4 files · 235pp · 48 topics ranked · 12 verified · fit at MAX ✓").

#### Density modes — see `CramSheet Density Modes.dc.html`
Same ranked, sourced content; the engine decides how much fits and how big. Content is authored **once** with a `tier` per block (`core` / `high` / `med` / `low`) and filtered per mode:
- **MAX** — everything (all tiers). ~5 tight columns, hairline column rules, ~5.7pt type, minimal gutters/margins — **packed edge-to-edge to fill the whole page.** "MAX means MAX": milk every inch, no unnecessary whitespace. The compact header is a single row (title + inline color-key legend + meta).
- **Balanced** — `core` + `high` tiers. ~3 columns, ~11px type. The high-yield set, less cramped.
- **Essentials** — `core` tier only. ~2 columns, ~13.5px type. Night-before glance, large and readable.
- Each block header carries: topic tag, title, ★ if verified, and a confidence dot. Blocks are colored per topic (tinted header background + a colored left rule). Topic colors in this file: MLlib `#4f46e5`, Spark `#ea7317`, HDFS `#15803d`, NoSQL `#be123c`, MongoDB `#0d9488`, HBase `#7c3aed`, Cassandra `#2563eb`, Exam/traps `#a08200`.

**Density controls are tweakable props** on the density file (read via `this.props`, defined in its `data-props` JSON). Port these as real configuration when you build the sheet renderer:
- `maxColumns` (int, 4–8) — MAX column count.
- `maxColGap` (px) — MAX column gap.
- `maxFontSize` (px, ~5–9) — MAX base font size.
- `maxBlockGap` (px) — vertical gap between MAX blocks.

The right implementation is a **fit algorithm**: measure content, then choose columns/size so the content fills exactly one page without clipping. The prop-driven CSS here is a manual stand-in for that algorithm.

---

## Interactions & Behavior (summary)
- **Nav flows:** Home CTA → Generate. Generate (with files) → Loading → Results. Results → Export PDF; Make another → Generate. Library card → Results. Out of credits → upgrade modal → Pricing.
- **File drop:** drag-over highlights the zone; each added file appends a taggable row and re-computes the confidence meter (past exams weight highest).
- **Confidence meter:** animates width `0 → value` with `ds-climb` (~1s, entrance easing) whenever inputs change.
- **Density switch (Results):** re-renders the sheet at the selected mode; content is the same source filtered by tier.
- **Buttons:** hover = subtle bg shift (120ms) + `translateY(-1px)` on primaries; active resets Y. Loading buttons show an inline spinner and `cursor:wait`.
- **Toasts:** dark (default) and light (warning) variants; auto-dismiss with optional Undo.
- **Modals:** `ds-rise` entrance; backdrop over a dimmed workspace.
- Respect `prefers-reduced-motion` (disable climb/rise/spin → show final state).

## State Management (what a real build needs)
- **Auth:** `user`, magic-link request/verify status.
- **Credits:** `creditsRemaining`, `plan` (Single / 3-Pack / Sprint Pass with expiry).
- **Generate:** `files[]` (each: name, size, type, **tag**, weight), `examType`, `density`, `priority`, derived `confidenceScore`.
- **Generation job:** `status` (reading → ranking → drafting → verifying → done/failed), progress %, refund-on-failure.
- **Sheet:** ranked `items[]` (topic, tier/confidence, `verified` bool, `citation`, body), `warnings[]` (trimmed topics, OCR flags), `fits` bool, chosen `density`.
- **Library:** list of generated sheets (title, course, date, density, thumbnail).

## Assets
- **Fonts:** Geist, Geist Mono, Newsreader — loaded from Google Fonts in each file's `<helmet>`. Self-host in production.
- **Icons:** inline Lucide SVG paths (no external icon files). Use the `lucide-react` (or equivalent) package in your build rather than the hand-inlined paths.
- **Images:** none — all sheet/thumbnail content is real HTML/CSS, no raster assets. (Logo/brand assets are handled outside this bundle.)

## Files in this bundle
- `CramSheet.dc.html` — **primary reference.** Full design system (tokens → primitives → patterns) + every screen. Read the `:root` block for tokens and the `Component.renderVals()` method for all data/copy.
- `CramSheet Density Modes.dc.html` — the A4 sheet at MAX / Balanced / Essentials, with the tier-based content model and the density tweak props.
- `support.js` — preview runtime for the `.dc.html` format. **Reference only — do not port.**

## Screenshots (`screenshots/`)
Rendered reference images of every surface. Use these to understand intended look; use the README values + HTML source for exact specs. (Full-page screens are captured at the top of each surface; the multi-column sheet renders at true A4-landscape width.)

**Design system:**
- `system-01-cover.png` — cover / brand intro
- `system-02-color-tokens.png` — full color palette (ink, brand, confidence tiers, functional, topic)
- `system-03-typography.png` — type scale in real strings
- `system-04-primitives-a.png` / `system-05-primitives-b.png` — buttons, inputs, chips, badges, dropdown, file-drop, callouts, toasts, progress, table, card, nav, tabs, modal
- `system-06-patterns-trust-layer.png` — ranked row, confidence meter, inline citation, warnings strip

**Screen walkthrough:**
- `screen-01-marketing-home.png`
- `screen-02-marketing-pricing.png`
- `screen-03-marketing-faq.png`
- `screen-04-auth-signin-magiclink.png`
- `screen-05-app-generate-empty.png`
- `screen-06-app-generate-loaded.png`
- `screen-07-app-generating-loading.png`
- `screen-08-app-results.png`
- `screen-09-app-library.png`
- `screen-10-app-upgrade-errors.png`
- `screen-11-the-sheet.png`

**The sheet — density ladder:**
- `sheet-density-01-max.png` — everything, ~5 cols, fills page edge-to-edge
- `sheet-density-02-balanced.png` — high-yield set, ~3 cols
- `sheet-density-03-essentials.png` — core only, ~2 cols, large & glanceable

## Recommended build approach
1. Reproduce the token set (`:root`) as your theme (CSS variables / Tailwind config).
2. Build the primitives (buttons, inputs, chips, badges, dropdown, file-drop, callouts, toasts, progress, cards, tables, modal, nav) to match the Primitives section.
3. Build the **trust-layer** components first (ranked row, confidence dot, ★, citation, meter) — they recur everywhere and define the product.
4. Assemble screens per the sections above, pulling copy from `renderVals()`.
5. Build the **sheet renderer** with a real fit-to-one-page algorithm; use the density props as the tuning surface.
6. Recreate faithfully (hifi) using the target codebase's existing patterns/libraries.
