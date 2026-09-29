# Clutch — UX audit and design brief

**Date:** 2026-09-29 · **Companion to:** `design_handoff_clutch_premium/README.md` (the v2 redesign handoff, 2026-09-10)

---

## How to use this with the v2 handoff

The v2 handoff is still the source of truth for **type, colour, spacing, radii, shadows and the trust layer**. Nothing here overrides it. Read it first.

This document covers what v2 could not: **three surfaces shipped after it was written, and none of them have been designed.** They were built plain, deliberately, so the visual pass could be done properly rather than guessed at.

| Surface | Status in v2 | Status now |
|---|---|---|
| Home, Generate, Results, Library, Sheet, Sign In, Pricing, FAQ, Modals, Edge States | designed | shipped, largely faithful |
| **Topic rail + module controls** | did not exist | shipped, **undesigned** (incl. a working hover preview, see 2.4) |
| **Add / edit / version trays** | did not exist | shipped, **undesigned** |
| **`/audio`** | did not exist | shipped, feature shelved — design later |

---

## 1. What the new feature is

The sheet is now **modular**. Every topic can be removed, thinned, re-mixed, or added to, and a student can put their own writing on the sheet.

One rule governs all of it, and the design must protect it:

> **A student must always be able to tell which lines Clutch stands behind and which they wrote.**

There are exactly two kinds of line:

| | **Ours** | **Yours** |
|---|---|---|
| citation slot | file + page | reads `you` |
| ⚠ verified star | can earn it | **never** |
| fitter may trim it | yes, by rank | **no — pinned** |

`you` is currently `--signal-600`, 0.82em, weight 600, in the citation slot. It carries a **different class** from `.src` on purpose: turning sources off must never hide which lines are the student's. It measures 6.98:1 against the sheet. **This marker is the visual anchor of the whole trust model and deserves the most design attention in this brief.**

Full product spec: `15-SHEET-MODULES-PRD.md` in the repo.

---

## 2. Findings

Ordered by how much they cost a student.

### 2.1 The dock is carrying 21 controls

Counted on `/results` today:

```
MAX · Balanced · Essentials                          3
More formulas · More concepts · Problem-heavy ·
  Concept-heavy · Reset mix                          5
FORMAT (select)                                      1
ORDER: Course · Priority                             2
SHOW: Traps · Question tags · Answers                3
SOURCES: Off · Compact · Full                        3
Diagrams · Topics · History · Edit with Clutch       4
                                                    ──
                                                    21
```

It grew one control at a time and nobody ever redesigned it. On a phone the whole thing folds behind an "Options" button, which is a symptom rather than a solution.

**The design question is not how to fit 21 controls.** It is which of these a student actually reaches for during revision, and what the other fifteen are doing on screen. My read: density, topics, and answers are used constantly; the mix presets and format select are used once and never again.

### 2.2 Four trays, one modal primitive, no shared shape

`Modal.tsx` exists and is used in exactly one place. The four new panels — topic rail, add block, line editor, version history — are hand-built, sharing only a `--band-2` background and a rise animation.

They are consistent with each other and with the existing Diagrams tray, so this is not visibly broken. But there is no `Tray` primitive, so each one re-implements its own header, close affordance and padding. **Design should decide whether a tray is a first-class component in the system, and what distinguishes it from a modal.**

### 2.3 Interaction states are the thinnest part of the system

This is where the requested polish belongs.

- **Hover** is mostly `hover:bg-white/10` or `hover:opacity-90`. Functional, uniform, unmemorable.
- **Focus** was *missing entirely* on all 16 tray controls until today — they were hand-rolled rather than using the `Button` primitive, which does carry a ring. Fixed with one rule (`.tray :is(button,input,select,textarea):focus-visible`), but that is a floor, not a design.
- **Active/press** exists only on `Button` (`scale(0.98)`), so the trays do not respond to a press at all.
- **No glow anywhere.** The product has an obvious candidate for it: the signal indigo already marks what is the student's own. A restrained glow on `you`-marked lines, or on a topic row as you hover it, would connect the trust layer to the interaction layer instead of leaving them unrelated.

**`prefers-reduced-motion` is already honoured in `tokens.css`** — anything added must respect it.

### 2.4 The rail preview exists, and needs a visual treatment

**Built and shipped 2026-09-29 — do not design this from scratch, restyle it.**

Pointing at a topic row in the rail dims every *other* topic on the sheet to `opacity: .25`, with a 140ms transition. It fires on hover **and on keyboard focus**, and clears on leave. Verified live on a 135-item sheet: 10 topic groups, 8 dimmed, and the one lit topic stays lit across *both* pages, because the match is on `data-topic` rather than position.

What is there is the crudest possible version of the idea: a uniform opacity knock-back on everything else. It works, and it is not designed.

Questions for the design pass:

- Is dimming the rest the right move, or should the topic itself be **lifted** — a glow, a border, a colour lift on the topic banner? The sheet already colour-codes topics (`tk-0..9`), which is an obvious hook.
- `.25` was chosen by eye. Does the rest of the sheet need to stay *readable* while previewing, or is unreadable correct because the point is to isolate?
- Should unticking then animate the removal, or is the preview enough?
- The preview currently does nothing on the **rail** side — the hovered row itself gets no treatment beyond its normal hover. A two-ended connection (row and topic) would read better than a one-ended one.

Constraints: the rule is scoped to `@media screen` so a print taken mid-hover cannot dim the sheet, and `prefers-reduced-motion` already applies to the transition. Both must survive.

### 2.5 Editing is discoverable only by accident

Clicking a line on the sheet opens the editor. **Nothing indicates a line is clickable** — no cursor change, no hover state, no affordance. A student will find this by misclicking or never.

The sheet is a print artifact and should not be cluttered, so this needs a designed answer rather than an obvious one.

### 2.6 The marketing nav does not know you are signed in

Reported as *"clicking the Clutch logo logs me out."* It does not — the session is intact — but `/` renders `MarketingNav`, which always shows "Sign in" and "Get started".

Patched today by pointing the in-app logo at `/generate`. **The real fix is an auth-aware marketing nav**, so a signed-in student who does land on `/` is greeted properly. Small, and it removes a moment where a student thinks they have been logged out.

### 2.7 Smaller things

- **The Topics badge reads `5/5`** even when untouched. A count that is always at its maximum until you change something carries no information at rest.
- **Version history is invisible until a sheet is saved**, with no explanation of why. Correct behaviour, unexplained.
- **`add` and `−` sit next to each other** in the rail with no visual weight difference, though one is additive and free, and the other removes content.
- **The dock's own trays have no visible relationship to the button that opened them** — no arrow, no tether, no shared edge.

---

## 3. What to design

In the order I would do it:

1. **The `you` marker and the student-owned line.** The trust anchor. Include the note block (currently a 2pt indigo left rule) and the student-owned table.
2. **The topic rail.** Row rhythm, the tick, the `add` / `less` / section-mix cluster, the floor state where "less" becomes "remove", and a proper treatment for the hover→sheet preview that already works (2.4).
3. **Dock information architecture.** Which of the 21 controls stay in the dock, which move, which disappear.
4. **A `Tray` primitive.** Header, close, padding, entrance, the tether to its opener, phone behaviour.
5. **Interaction states as a system.** Hover / focus / press / disabled, including where glow belongs and where it does not.
6. **The editable-line affordance** (2.5) without cluttering a print artifact.
7. `/audio` — only when the feature comes off the shelf. See `13-CLUTCH-AUDIO-UX-PLAN.md`.

---

## 4. Constraints the design cannot negotiate

Carried from the PRD and from what the engine actually does:

- **Never change type size, column count or page count to make content fit.** Add or remove content instead. (The mainstream pattern — Rezi's auto-fit "adjusts font sizes and spacing" — is exactly what Clutch rejects.)
- Reading a pack is free. **Anything that spends must say so before it spends.** Every tier-1 control makes zero network calls — verified live.
- A student line can never be mistaken for a verified one.
- Nothing a student typed is ever silently discarded.
- Both themes. The **sheet itself stays white in both** — it is a print artifact and does not invert. The chrome around it does.
- 28pt pointer / 44pt touch minimums via `.tap`; `aria-live` on state; `prefers-reduced-motion` honoured.

---

## 5. Where things are

| | |
|---|---|
| Live | https://cramsheet-production.up.railway.app |
| Repo | `~/Code/Clutch` · `goldhac/Clutch` |
| Tokens | `src/renderer/tokens.css` (v2 handoff is the spec) |
| Primitives | `src/components/ui/` |
| New, undesigned | `src/app/results/TopicRail.tsx`, `AddBlock.tsx`, `EditLine.tsx`, `VersionPanel.tsx` |
| Sheet rendering | `src/components/sheet/` — `TwoPageSheet` is the default view |
| Module logic | `src/components/sheet/modules.ts` |
| Product spec | `docs/15-SHEET-MODULES-PRD.md` |

**To see it:** sign in, `/generate` with a few lecture PDFs, then on `/results` open **Topics** in the dock. Add a note to a topic, and click any line on the sheet to edit it — both produce a line marked `you`.
