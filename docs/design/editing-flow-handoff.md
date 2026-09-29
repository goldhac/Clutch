# Handoff: Sheet editing flow, trays and modals

Repo: `goldhac/Clutch` · Companion to `docs/16-UX-AUDIT.md` (2026-09-29) and `docs/15-SHEET-MODULES-PRD.md`. The v2 handoff and `src/renderer/tokens.css` remain the source of truth for tokens — nothing here adds new colours.

## Overview
Redesigns everything the audit listed as shipped-but-undesigned on `/results`:
1. The `you` marker and student-owned lines/notes on the sheet (audit 2.1 / item 1)
2. The topic rail, incl. the hover→sheet preview (2.4 / item 2)
3. Dock information architecture — 21 controls → 7 (2.1, 2.7 / item 3)
4. A shared `Tray` primitive distinct from `Modal` (2.2 / item 4)
5. Interaction states as a system — hover / focus / press / disabled / glow (2.3 / item 5)
6. The editable-line affordance (2.5 / item 6)
7. The line editor, add block, version history, Edit with Clutch trays, and the modals in the flow

## About the design files
`Clutch Editing Flow.dc.html` is a **design reference built in HTML** — a working prototype showing intended look and behaviour, not production code. Recreate it in the existing Next.js + Tailwind codebase using its patterns: `src/components/ui/*` primitives, `tokens.css` variables (never the hex literals in the prototype — they are the resolved token values), and the existing module logic in `src/components/sheet/modules.ts`. The prototype's data and "Pro" copy are sample content.

Open the file in a browser. Section **P** is interactive; boards **A–F** are static specs.

## Fidelity
**High-fidelity.** Final colours, type, spacing, states and motion. Match pixel-for-pixel using existing tokens.

---

## 1. The `you` marker (board A) — `semantics.css`, sheet components

| | Ours | Yours |
|---|---|---|
| Leading mark | filled conf-dot (existing, 0.55em) | **hollow ring**, same size & slot: `border: 1.3px solid var(--signal-600)`, transparent fill |
| Citation slot | `.src` (unchanged) | `.src-mine` → `you` (unchanged: signal-600, 0.82em, 600, ls .02em) |
| Star | may show | never |

- Add `.sheet .conf-dot.mine { background: transparent; border: 1.3px solid var(--signal-600); box-sizing: border-box; }` — render it for every `mine: true` item instead of a tier dot.
- **Note block:** change `border-left: 2pt solid` → `border-left: 1.5pt dashed var(--signal-500)`. Reason: a solid indigo rule is indistinguishable from a `tk-0` formula block. Solid rules = topic colour; dashed = yours.
- Header legend (screen + print, mono 9px ink-500): `● checked against your files   ○ you wrote it`.
- Edited lines keep `orig` citation as provenance; show "was L11 s8" only on screen (tooltip / editor), never printed.
- Sources: Off hides `.src` only; `.src-mine` must stay visible (already true — keep it).

## 2. Editable-line affordance (boards C, P) — screen only
All under `@media screen`, inside `.sheet` line leaves (`.fit-leaf`, concept rows, notes, traps, questions):
- `cursor: text`
- Hover: `background: var(--signal-50)` (yours: `--signal-100`), `box-shadow: 0 0 0 1px #d6d4f7` (≈ signal-100/300 mix), radius 2px, 120ms.
- Hover tag: absolute `top:-9px; right:2px`, bg signal-600, white, Geist Mono 8px/600, ls .04em, padding 1px 5px, radius 3px. Text `edit` (ours) / `edit yours` (mine). `pointer-events:none`.
- Editing state (while the line editor is open for it): bg signal-100, `box-shadow: 0 0 0 1.5px var(--signal-500), 0 0 12px rgba(91,87,224,.3)`, tag reads `editing`.
- One-time coach line under the sheet, right-aligned, 13px ink-600: hollow ring + "Click any line to rewrite it. It becomes **you**, and the sheet never trims it." + "Got it" (underlined, ink-500). Dismiss persists (localStorage) and on first edit.
- Must not affect measurement: no padding/margin change on hover — use background + box-shadow only.

## 3. Dock (board D, P)
Dark band pill, centred bottom 24px: bg `--band`, radius 14, padding 7, gap 6, shadow `0 20px 44px rgba(17,17,20,.28)`. Dividers: 1×24 `--band-line`, margin 0 4.

Order: **Density** segmented · | · **Topics** · **View ▾** · **Answers** switch · | · **Edit with Clutch** · | · **Saved · {time}** · **Export PDF**

- Dock button: h36, px12, radius 9, 13px/600, white on transparent. Hover `inset 0 0 0 1px #3a3a45`. Press `scale(.97)`. **Open state** (its tray open): bg white, fg `--band` — this is the tether's opener half.
- Density segmented: trough `--band-2`, pad 3, radius 10; items h30 px12 radius 7 13/600; selected white/ink, unselected `#cbcbd4`.
- Topics badge: **absent at rest**. When any module state exists: mono 11 pill, bg signal-500, white, "N changed".
- Answers: switch 28×16, track signal-500 on / `#3a3a45` off, knob 12px white, 160ms ease-out.
- Edit with Clutch: 7px signal-300 dot before label.
- Save state: 6px dot (`--conf-high` dark-lifted `#5cc98d`) + mono 11.5 "Saved · 2m ago". Before the sheet is in the library: amber dot + "Not saved". Opens Version tray.
- Export PDF: white bg, ink fg, download glyph.

Moved into **View** popover: Order (Course/Priority), Sources (Off/Compact/Full), Traps (Show/Hide), Question tags, Diagrams (opens its existing tray).
Removed from dock: 4 mix presets + Reset mix (replaced by per-topic section mix + "Put everything back" in the rail), Format select (belongs on `/generate`).
Phone: Density, Topics, Export stay; the rest behind a "More" bottom sheet.

## 4. `Tray` primitive (board B) — new `src/components/ui/Tray.tsx`
Replace the hand-built shells in `TopicRail`, `AddBlock` (inline, not a tray), `EditLine`, `VersionPanel`, `EditChat`, Diagrams.

```
<Tray title count? onClose footer? width anchor="opener"|"center">
```
- Container: bg `--band-2`, radius 14, `box-shadow: 0 24px 60px rgba(17,17,20,.45), 0 0 0 1px var(--band-line)`, color `--on-band`.
- Position: absolutely inside a `relative` wrapper around its opener: `bottom: calc(100% + 16px); left: 50%; transform: translateX(-50%)`. Clamp to viewport.
- **Notch:** 12×12 square, bg `--band-2`, `rotate(45deg)`, `bottom:-6px; left:50%; margin-left:-6px; box-shadow: 1px 1px 0 var(--band-line)`. Points at the opener.
- Header: padding `14px 12px 4–10px 18px`; title 14/600; count mono 11 `--on-band-muted`; close = 28×28 icon button (12px ✕ svg, stroke 1.6), radius 7, muted → hover `rgba(255,255,255,.08)` + white. Replaces the text "close" links.
- Optional description: 12.5/1.5 muted, padding `0 18px 10px`.
- Body rows: container padding `0 8px 8px`, gap 2, rows radius 10; scrolls inside (max-height as needed).
- Footer "consequence strip": border-top 1px `--band-line`, padding `11px 18px`, Geist Mono 11 muted. States the cost ("free · instant · nothing rebuilds your sheet").
- Entrance: `cl-rise` 220ms `--ease-pop` (translate(-50%, 8px) → (-50%, 0), opacity 0→1). Reduced motion honoured by tokens.css.
- One tray open at a time. Opening another closes the current. Esc, close button, or clicking the opener again dismisses. Non-modal: sheet stays live, no scrim, no focus trap (but focus moves into the tray and returns to the opener on close).
- `role="dialog"` + `aria-label`.
- Line editor has no dock opener → `anchor="center"` (centred over the dock, no notch); the edited line is ringed on the sheet (section 2) to link both ends.
- Phone: full-width bottom sheet with grab handle, no notch, 44pt targets.

**Tray vs Modal:** Tray = free, reversible work; dark band in both themes; anchored. Modal (`Modal.tsx`, unchanged spec) = money, deletion of something unrecoverable, or failure; light surface; centred behind scrim.

## 5. Topic rail (P, F) — `TopicRail.tsx`
Tray width 580. Title "Topics on this sheet", count mono "4 of 5 on". Description: "Point at a topic to find it on the sheet. Remove one and its space goes to the rest."

Row (padding `9px 10px 9px 14px`, radius 10):
- Left hover bar: 3px wide, inset top/bottom 10px, left 3px, radius 2; transparent → topic colour on hover/focus.
- Row hover bg `rgba(255,255,255,.07)`, 140ms. Off rows opacity .55, name line-through.
- **Tick**: custom 18×18 button, radius 5, `aria-pressed`. On: bg + border = topic colour (`tk-N`), white ✓ 12/700. Off: transparent, 1.5px `#4a4a53`. Press scale .92.
- Name 13.5/600, ellipsis.
- If topic has student content: hollow ring (signal-300 dark `#b3b0f4`) + mono 11 "2 you".
- Count mono 11 muted, min-width 62, right-aligned: "12 lines" / "9 of 12" when trimmed / "off".
- Controls cluster (gap 4): `−` (28×28 neutral), `+` (28×28 neutral, disabled when trim=0 → opacity .3), 1×18 divider, **Add yours** (additive).
- **Floor state** (shown ours ≤ `MIN_TOPIC_LINES`): `−` is replaced by outlined **Remove** (destructive ghost) with title "Only 3 lines left — remove the topic instead".
- Section-mix chips under the name (margin-left 28): h22 px7 radius 6, Geist Mono 10.5 uppercase ls .04em. On: bg `rgba(255,255,255,.1)`, fg `#e2e2e8`. Off: transparent, `#6b6b76`, line-through. Label "Definitions 4". Only kinds the topic has.
- Footer: consequence strip + right-aligned "Put everything back" (12/600 underlined, only when module state non-empty).

**Preview (sheet side), screen only:** on row hover/focus (on-topics only):
- Lit topic group: `box-shadow: 0 0 0 1.5px {tk}, 0 0 0 6px {tk}22, 0 6px 18px {tk}26`, radius 3, padding 2px (padding must already exist at rest to avoid reflow — or use `outline` + `outline-offset` if padding would affect the fitter).
- Others: `opacity: .3` (prototype tweak exposes 0.1–0.7; `.3` keeps banners findable).
- Transition 160ms `--ease-out` on opacity & box-shadow. Keep the existing `@media screen` scoping and `data-topic` match.
- Tweak options in prototype: "lift + dim" (recommended), "lift only", "dim only (current)".

**Add yours (inline in the row, `AddBlock.tsx`):** panel margin `10px 0 2px 28px`, padding 12, radius 10, bg `#15151a`, `inset 0 0 0 1px var(--band-line)`.
- Shape chips: note · definition · question · table (same chip style; selected bg `rgba(255,255,255,.14)` white). Right: mono 10.5 "into {topic}".
- Inputs: h34, px10, radius 8, border 1px `--band-line`, bg `#0f0f13`, 13px white. Focus: border signal-300 + `0 0 0 3px rgba(91,87,224,.25)`.
- Placeholders: note "Your note, e.g. “he said this WILL be on the final”"; definition "Term" / "What it means"; question "Question" / "Answer"; table as today.
- Actions: **Add to sheet** (primary white, disabled .35), Cancel (ghost muted), right mono 10.5: hollow ring + "reads **you** · never trimmed".
- Table validation (board F): offending textarea border `--warn` dark (`#e0a24d`) + `0 0 0 3px rgba(224,162,77,.18)`; message 12px warn below, e.g. "Row 2 has 2 cells; the header has 3". Enter submits when valid.
- FR-14 kept: adding to an off topic re-ticks it. Toast confirms: "Added to {topic} · reads “you”".

## 6. Line editor (P) — `EditLine.tsx`
Tray, `anchor="center"`, width 600, opened by clicking any sheet line.
- Header: 9×9 topic swatch (radius 2) · title "Rewrite this line" (ours) / "Edit your line" (mine) · mono topic name · close.
- Fields: mono 10.5 uppercase label + input h36 / textarea rows 2 (styles as Add). Labels: Term / What it means; Question / Answer; notes single "Your note". First field autofocus + select.
- **Trust panel (ours only):** bg `#15151a`, inset band-line ring, radius 10, padding 10/12, grid `110px 1fr 20px 1fr`, 12px:
  - header row mono 10 uppercase `#6b6b76`: When you save · Now · · After
  - Citation: `{src}` mono → hollow ring + **you** (signal-300)
  - Verified: "★ verified" (gold) → "comes off" / "not starred" → "—"
  - Trimming: "by rank" → "pinned, never trimmed"
- Mine: one line "Already yours. Rewritten from L10 s12." with hollow ring.
- Footer (border-top): **Save as mine** / **Save** (primary, disabled until changed & non-empty), Cancel, mono hint "⌘↵ save · esc cancel", right: **Remove my line** (destructive ghost, mine only → modal).
- Save: sets `mine:true`, `star` false, `src:"you"`, `orig` = previous src. Toast: "Saved as yours · verified star removed" (if it had one) else "Saved as yours · pinned".

## 7. Version history (P, F) — `VersionPanel.tsx`
Tray width 380, opener = dock save state. Title "Earlier versions" + count. Description "Every change saves. Restoring is a change too, so you can always come back."
- Row: h≈40, padding 8/10, radius 10, hover `rgba(255,255,255,.05)`. 7px dot (current: filled `#5cc98d`; others hollow `#6b6b76`), label 13 ellipsis, mono 11 time, then `current` (mono 10.5 green) or **Restore** (56×26 neutral).
- Current row bg `rgba(92,201,141,.08)`.
- Footer: "last 20 saves · your lines are kept in every one".
- **Not saved** state (board F): body "This sheet isn't in your library yet, so there's nowhere to keep versions. Save it and every change after that is kept." + "Until then, undo still works for this session." + primary **Save to library**. Footer "dock reads: ● Not saved". Tray is always reachable — fixes "invisible until saved".
- Restore → closes tray, toast "Restored “{label}”" + Undo.

## 8. Edit with Clutch (P) — `EditChat.tsx`
Adopt Tray shell (width 500). Header adds mono "undo last edit" (disabled .4). Behaviour unchanged.
- Bubbles 13/1.5 radius 12 padding 8/12, max 90%. You: white/ink right. Clutch: `rgba(255,255,255,.07)` / `#e2e2e8`.
- Proposal card: inset band-line ring, radius 12. Eyebrow mono 10.5 uppercase "Proposed · 1 reworded". Ops: `−` `#f08a75` struck muted before, `+` `#5cc98d` after; mono 10.5 note "keeps citation L11 s8 · stays ours". Action bar bg `#17171c` border-top: Accept (primary) · Reject (outline `#3a3a45`) · right mono 10.5 **gold** "1 Pro edit on accept" (say it before it spends). Decided: mono 11 "accepted ✓ · undo is at the top" / "rejected · sheet unchanged".
- Chips: h28 pill, border `#3a3a45`, 12/500 `#cbcbd4`, trailing mono 10 tag: `free` (`#6b6b76`) or `Pro` (gold `#dbb45e`, border `rgba(219,180,94,.4)`). Chips wrap (no horizontal scroll).
- Input h38 radius 9 bg `rgba(255,255,255,.07)`, focus ring as other inputs; Send primary.
- Footer: "show · hide · reorder are free · rewrites come back as a preview".

## 9. View popover
Tray width 320. Each row: mono 10.5 uppercase label, segmented (trough `--band-2`, pad 3, radius 9, items h28 radius 6 12.5/600, selected white/ink), helper 11.5 muted:
- Order: "Priority puts the topics most likely to come up first."
- Sources: "Your own lines read “you” in every mode, including Off."
- Traps: "Across every topic. Per-topic mixes live in Topics."
- (+ Question tags, Diagrams)
Footer "display only · free · prints as shown".

## 10. Modals (E) — use existing `Modal.tsx` unchanged
1. **Remove your line?** tone `destructive`, eyebrow "DELETE · YOUR LINE". Body: quoted line in signal-50 box (hollow ring + text + `you`), then "Clutch can rebuild everything else on this sheet from your files. It can't rebuild this." Actions: **Remove line** (bg `--danger`, hover `#a93226`) · **Keep it** (secondary). Footer tint `warn`: "kept in version history · its space refills from your files, free". Confirm → toast "Removed your line · kept in history" + Undo.
2. **Shorter definitions is a Pro edit** — tone `decision`, eyebrow "PRO EDIT · REWRITES LINES". Body "It changes the words on your sheet, so Clutch checks each new line against your files first. You see every change before it lands." OptionTiles: Go Pro / "unlocks rewrites" (primary) · Stay free / "edit lines by hand". Footer `good`: "topics, adding, editing by hand stay free". (Pricing copy is a placeholder — fill from real plan.)
3. **That edit didn't come back** — tone `caveat`, eyebrow "EDIT FAILED · NOTHING CHANGED". Body "The model timed out before it finished. Your sheet is exactly as it was, and no edit was used." Actions Try again (primary) · Close. Footer `plain`: "not charged · your request is kept in the box".

Only these three are modals. Restore, add, trim, remove topic → toast with Undo, no modal.

## 11. Interaction state system (board C)
On band (trays, dock):
| | rest | hover | focus-visible | press | disabled |
|---|---|---|---|---|---|
| Neutral | `rgba(255,255,255,.08)` | `.14` | ring | scale .94 (square) / .97 | opacity .3 |
| Additive ("Add yours") | bg `rgba(91,87,224,.22)`, border `rgba(138,134,232,.4)`, fg `#d4d2fb` | bg `.34` + glow `0 0 14px rgba(91,87,224,.35)` | ring | .97 | .3 |
| Destructive ghost | transparent, border `rgba(240,138,117,.35)`, fg `#f08a75` | bg `rgba(240,138,117,.10)` | ring | .97 | .3 |
| Primary | white / ink | `#f0f0f2` | ring | .97 | .35 |

- **Focus ring (everywhere):** `box-shadow: 0 0 0 2px {surface}, 0 0 0 4px var(--signal-300)` on `:focus-visible`. Replaces the `.tray :is(...)` floor rule. On paper surface use `--surface` as the gap colour.
- Press transitions 120ms; colour transitions 120–160ms.
- **Glow rule:** glow only for things that are the student's own or being previewed — Add yours hover, the line being edited, the previewed topic ring. Never on Clutch's lines at rest, never in print.
- Toast: bg `--band-2`, radius 12, padding 11/12/11/16, 13px, shadow `--sh-toast`, `cl-pop` 200ms, bottom-right above dock, auto-dismiss 6s, `role="status"`, Undo = neutral button.

## State (results page)
Existing: `content`, `modules: ModuleState`, `preview topic`, undo stack, versions. Add/confirm:
- `openTray: 'topics'|'view'|'chat'|'history'|'diagrams'|null` (single source; replaces per-tray booleans)
- `editingLineId | null` (drives editor tray + sheet ring)
- `hoverLineId` (screen-only affordance; can be pure CSS `:hover` instead)
- `addingTopic: string | '' | null`
- `modal: {kind:'remove-line', id} | {kind:'pro'} | {kind:'edit-failed'} | null`
- `toast: {text, undoSnapshot?}`
- `coachDismissed` (localStorage)
- Esc: closes modal first, else tray/editor.
No new network calls; all tier-1 controls stay free and instant (FR-13).

## Constraints (unchanged, must hold)
- Never change type size, column count or page count to fit.
- Sheet stays white in both themes; all hover/preview/affordance styles scoped to `@media screen`.
- 28pt pointer / 44pt touch via `.tap`; `aria-live` on chat and toasts; `prefers-reduced-motion` honoured.
- A student line can never look verified; nothing typed is silently discarded.

## Tokens used (all exist in tokens.css)
band `#111114` · band-2 `#1c1c21` · band-line `#2c2c33` · on-band-muted `#9a9aa6` · signal-600 `#4a46c9` · signal-500 `#5b57e0` · signal-300 `#8a86e8` · signal-100 `#ecebfb` · signal-50 `#f5f4fe` · danger `#c0392b` · conf-high/med/low `#197d4a` `#8f6908` `#b4341f` · salmon `#fdece4` / salmon-text `#8a4a2f` · dark-lifted values used on band: `#b3b0f4` (signal-700 dark), `#5cc98d`, `#dbb45e`, `#f08a75`, `#e0a24d`.
Non-token literals introduced (propose adding as tokens): `#15151a` inset panel, `#0f0f13` input ground, `#3a3a45` hover border, `#26262f` segmented trough (= dark band-2).
Radius: 5 (tick), 6 (chips), 7 (small buttons), 8 (inputs), 9 (dock buttons), 10 (rows/panels), 12 (bubbles/toast), 14 (trays/dock/modals).
Fonts: Geist (UI), Geist Mono (counts, eyebrows, consequence strips), Newsreader (sheet title, modal titles).

## Files
- `Clutch Editing Flow.dc.html` — prototype (P) + boards A–F. Open in a browser; needs `support.js` beside it.
- `support.js` — runtime for the prototype only; do not port.
- Repo files to change: `src/app/results/{TopicRail,AddBlock,EditLine,VersionPanel,EditChat,page}.tsx`, new `src/components/ui/Tray.tsx`, `src/renderer/semantics.css` (`.src-mine` ring, `.note-block` dashed, screen-only line affordance + preview lift), `src/components/ui/Modal.tsx` (use as-is).
