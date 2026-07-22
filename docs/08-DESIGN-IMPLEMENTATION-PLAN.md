# CramSheet — Design Implementation Plan

**Status:** active · **Source design:** `design/` (CramSheet Product Design handoff, in-repo) · **Owner:** Gold Nwobu

This is the execution plan for implementing the product design across the ENTIRE surface — marketing site, auth, app, and the sheet. The design handoff (`design/README.md` + `design/CramSheet.dc.html` + `design/CramSheet Density Modes.dc.html` + 20 screenshots) is the spec. Where this plan deviates from the handoff, the deviation is deliberate and noted.

## Decisions locked

1. **Palette: adopt the design's system wholesale.** Ink-primary CTAs (`--ink-900`), iris signal (`--signal-500/600/700`), salmon proof surfaces, re-tuned confidence tiers (green/amber/red + gold verified). The old `#3b3593` indigo / teal / orange palette is retired from the app chrome. The eventual logo must be commissioned against THIS palette.
2. **Typography: Geist (UI) + Newsreader (editorial display) + Geist Mono (citations/formulas/meta)**, loaded via `next/font/google`, self-hosted automatically by Next at build time.
3. **MAX density: implement exactly as designed.** `sheet-density-01-max.png` is the target. Topic-tinted block headers, inline color-key legend in a single-row compact header, salmon verified strip, provenance footer, edge-to-edge fill.
4. **Balanced + Essentials: redesigned by us** (see "Density ladder" below) — the handoff's versions were directionally right (tier filtering) but the visual treatment is ours.
5. **Density names:** user-facing + code both move to `max / balanced / essentials` (replacing `max / standard / minimal`).
6. **Copy rule preserved:** "cheat sheet" appears ONLY on marketing surfaces. App chrome + PDF say "sheet" / "Exam Reference Sheet". (The handoff's app-nav CTA "Make a cheat sheet" is a spec bug — we ship "New sheet".)
7. **Light mode only.** The sheet lives on paper.

## Design tooling used during builds

- **Skills (installed globally, loaded from `~/.claude/skills/*/SKILL.md` at build time):** `impeccable` (primary), `emil-design-eng` (polish/motion), `high-end-visual-design` (agency-grade detailing), `redesign-existing-projects` (for restyling existing screens), `full-output-enforcement` (no truncated builds).
- **Magic MCP (21st.dev)** — component inspiration for marketing elements (nav, pricing cards, FAQ, footers); adapted to our tokens, never pasted verbatim.

---

## The density ladder (our design)

Three densities = three moments in the final 48 hours. Content is authored once; each mode filters by **tier**, derived deterministically from the trust layer (no contract change in v1):

| tier | derived from |
|---|---|
| `core` | `verified === true` (past-exam-backed) · plus examFormat + verifiedPatterns + universal rules always |
| `high` | `conf === "high"` (not verified) |
| `med` | `conf === "med"` |
| `low` | `conf === "low"` |

**Essentials guarantee:** if `core` is thin (no past exam in pack), promote highest-confidence items until the sheet has a minimum viable set (~8–10 items). An Essentials sheet must never render sparse.

### MAX — the exam-room weapon *(as designed — do not deviate)*
All tiers. ~5 columns, ~5.7pt, hairline rules, minimal gutters, packed edge-to-edge. Compact single-row header (title + inline color legend + meta). Salmon verified strip. Topic-tinted block headers with colored left rule. Provenance footer ("4 files · 235pp · 48 topics ranked · 12 verified · fit at MAX ✓").

### Balanced — the day-before desk sheet *(ours)*
**Design stance: Balanced is the sheet you write ON; MAX is the sheet you read FROM.**
- Tiers: `core` + `high`. 3 columns, ~10px body.
- Keeps: verified strip (compressed to one row), formula blocks WITH worked examples, compare tables, named traps.
- Drops: low/med questions, background concepts, deep code blocks.
- Visual: double the block gap vs MAX; wider page margins (annotation space); topic headers go **tinted-background** (not solid dark) so pencil notes stay legible next to them; formula boxes get real breathing room.

### Essentials — the walk-to-the-exam glance card *(ours)*
**Design stance: closer to a boarding pass than a newspaper. Absorbable in 90 seconds, standing up.**
- Tier: `core` only (+ promotion fallback). 2 columns, ~13px body.
- Strict priority stack, not a wall of sections:
  1. ★ Verified patterns (full-width, salmon)
  2. Universal rules / exam-day tactics
  3. The core formulas — bigger boxes, one per formula, worked example inline
  4. Top traps ("X is FALSE because Y")
  5. Exam-day checklist footer
- No compare tables, no question drill lists, no code blocks (unless verified-core).
- Big type, heavy hierarchy, generous whitespace.

All three MUST still: fit one A4-landscape page (page-count-verified by `/api/pdf`), and show conf dot + ★ + citation on every ranked item.

---

## Full surface inventory (everything we ship)

| # | Surface | Route | Design ref | Status today |
|---|---|---|---|---|
| 1 | Marketing home | `/` | screen-01 | placeholder → **rebuild** |
| 2 | Pricing | `/pricing` | screen-02 | doesn't exist → **build** |
| 3 | FAQ / How it works | `/faq` | screen-03 | doesn't exist → **build** |
| 4 | Shared marketing nav + footer | (layout) | screen-01 | doesn't exist → **build** |
| 5 | Auth: sign in / magic-link sent | `/auth` | screen-04 | doesn't exist → **UI shell now, Supabase wiring later** |
| 6 | Generate — empty state | `/generate` | screen-05 | exists → **restyle + app chrome** |
| 7 | Generate — loaded state | `/generate` | screen-06 | exists → **restyle** |
| 8 | Generating / loading screen | (overlay) | screen-07 | doesn't exist → **build** (staged: optimistic timed steps now, real SSE later) |
| 9 | Results — clean | `/results` | screen-08 | exists → **restyle** |
| 10 | Results — with warnings | `/results` | screen-08 | exists (amber strip) → **restyle to design's stacked strips** |
| 11 | Library / My Sheets | `/library` | screen-09 | doesn't exist → **build local-first (localStorage), Supabase later** |
| 12 | Upgrade modal | (component) | screen-10 | doesn't exist → **build UI (Stripe wiring later)** |
| 13 | Error state cards | (components) | screen-10 | doesn't exist → **build** (gen-failed / file-too-big / image-only-OCR) |
| 14 | The Sheet — MAX | `/sheet` + PDF | sheet-density-01 | exists → **redesign to spec** |
| 15 | The Sheet — Balanced | `/sheet` + PDF | ours | exists as "standard" → **redesign (ours)** |
| 16 | The Sheet — Essentials | `/sheet` + PDF | ours | exists as "minimal" → **redesign (ours)** |
| 17 | Token/debug gallery | `/debug/tokens` | system-02..06 | exists → **update to new system** |

---

## Phases

### D1 — Foundation: tokens + typography  *(gate: /debug/tokens shows the new system; build clean)*
- [ ] New `tokens.css`: the design's `:root` block verbatim (ink scale, signal, salmon, conf tiers, functional, topic palette, radii, shadows, motion vars, keyframes).
- [ ] **Legacy aliases kept** (`--color-primary-indigo` etc.) at their CURRENT values so the sheet CSS is untouched until D5. Deleted in D5.
- [ ] Fonts via `next/font/google`: Geist, Geist Mono, Newsreader → CSS vars wired to `--sans/--serif/--mono`.
- [ ] `globals.css`: body = Geist on `--paper`, ink-800 text, `font-feature-settings:'ss01','cv01'`, selection = signal tint.
- [ ] Tailwind v4 `@theme` mapping so `bg-ink-900`, `text-signal-600`, `shadow-md` etc. exist as utilities.
- [ ] `/debug/tokens` updated to the new palette/type scale.

### D2 — Primitives  *(gate: components visually match system-04/05/06 screenshots)*
Restyle: `Button` (ink primary, hover lift −1px), `TextInput`, `Select`, `FileDrop` (design's dashed zone + copy), `Callout` (info/warn/danger/success on new tokens), `Progress` (→ gradient conf meter, `ds-climb`), `Chip` (file-type PDF/DOC chips + tag chips incl. salmon ★ Past exam), `Card`.
New: `SegmentedControl` (density switcher, Generate/My Sheets tabs), `Modal` (`ds-rise` + backdrop), `Toast` (dark default / light warn), `RankedRow` (dot + ★ + title + mono citation + rank badge), `ConfMeter` (labeled climbing bar + hint), `CreditsPill` (amber when low), `AppChrome` (app nav: wordmark, tabs, credits, avatar), `MarketingNav` + `Footer`, `Skeleton` (`ds-shimmer`).

### D3 — Marketing site  *(gate: matches screen-01/02/03; loads skills + Magic MCP first)*
- [ ] Home: sticky nav → serif hero on faint grid → **blurred MAX sheet proof with one unblurred conf-callout** → How it works (3-step) → Why we're different (salmon evidence card) → pricing preview → dark footer.
- [ ] Pricing: 3 one-time tiers, 3-Pack featured (ink border, "Best value · $3.33 a sheet"), reassurance bar. Copy: "Pay for the sheet, not a subscription."
- [ ] FAQ: one-column ~620px, 6 Q&As, dark CTA card.
- [ ] Hero copy per handoff: "The one-page cheat sheet that knows what's on the exam." CTA "Drop your files".

### D4 — App screens  *(gate: matches screen-05..10; full flows click-through)*
- [ ] AppChrome on all app routes; density rename `standard→balanced`, `minimal→essentials` across contract-adjacent code (`Density` type, CSS classes, /sheet parser, /api/pdf, engine prompt, gen-cli, UI selectors).
- [ ] Generate: two-column layout (files left / settings right), per-file rows with type chip + tag chip + remove, "Add more", disabled-until-files right column, ConfMeter with hint, CTA "Generate my sheet · 1 credit".
- [ ] Loading: full dark screen, 4-step narrative (Reading → Ranking → Drafting → Verifying page fit), determinate bar, meta caption. v1 = optimistic timed steps around the single API await; SSE later.
- [ ] Results: breadcrumb + "Fits at MAX"/warnings status pill, SegmentedControl density switcher, "Make another", "Export PDF"; sheet centered on `--paper-2` with `--sh-xl`; stacked dismissible warning strips.
- [ ] Library `/library`: header + search + "New sheet"; 4-col grid of A4-ratio thumbnail cards (density badge, title, topic dot, course + date, hover lift). Local-first (localStorage index of generated sheets).
- [ ] Upgrade modal (0 credits → Single vs 3-Pack mini-compare) — UI only, Stripe later.
- [ ] Error cards: generation-failed (credit refunded) / file-too-big (40MB) / image-only-OCR.
- [ ] Auth UI shells `/auth`: Google button + magic-link email form + "check your email" state. No backend yet.

### D5 — The Sheet  *(gate: MAX matches sheet-density-01; all three densities export verified 1-page PDFs)*
- [ ] Rewrite sheet CSS on the new tokens (retire legacy aliases).
- [ ] MAX per design: compact single-row header + inline legend, salmon verified strip, topic-tinted block headers w/ left rule, dark section-header bars where designed, provenance footer.
- [ ] Tier derivation (`verified→core`, `conf→tier`) + Essentials minimum-viable promotion.
- [ ] Balanced (ours): 3-col, core+high, annotation margins, tinted headers.
- [ ] Essentials (ours): 2-col priority stack, core only, checklist footer.
- [ ] OverflowMonitor + `/api/pdf` page-count verification work for all three.
- [ ] Sample content upgraded so all three modes demo well.

### D6 — Consistency, brand, deploy  *(gate: every route live on Railway; smoke green)*
- [ ] Copy pass: "cheat sheet" only on marketing; app says "New sheet"; PDF title "Exam Reference Sheet".
- [ ] Favicon + wordmark from the design's mark (ink rounded square + white sheet glyph) as placeholder until the real logo lands.
- [ ] `/debug/tokens` final polish as the living design-system page.
- [ ] Full route smoke, PDF verification, Railway deploy.
- [ ] Re-run `/design-sync` so claude.ai has the new system.

**Deliberately NOT in this design pass:** Supabase auth wiring, Stripe payments, real SSE progress, the 2-page front/back mode (Playbook §9 — next milestone after design lands), engine changes (tier stays renderer-derived).
