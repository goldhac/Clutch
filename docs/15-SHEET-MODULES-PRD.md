# Sheet Modules — Product Requirements

> Issue [#20](https://github.com/goldhac/Clutch/issues/20). Decisions locked with Gold 2026-09-29.
> Companion: `09-RELEVANCE-AND-FIT.md` (the fitter and the bench), `02-OUTPUT-SPEC.md` (the contract).

---

## 1. What this is

The sheet still **arrives** full, front and back. Nothing about generation changes.

What changes is what a student can do to it afterwards. Today the dock holds global switches —
traps on, sources compact, answers off — that apply to the whole sheet, and the chat can change one
line but only by asking in words and waiting. There is nothing in between. A student who knows they
are weak on Chapter 3 and solid on Chapter 1 cannot tell the sheet.

After this: **every topic is a module they can tick, thin out, re-mix, or add to — and they can put
their own writing on the sheet.**

### The one rule

**A student must always be able to tell which lines Clutch stands behind and which they wrote.**

Everything on the sheet is one of two kinds:

| | **Ours** | **Yours** |
|---|---|---|
| Where it came from | the student's files | the student |
| Citation | file + page | reads `you` |
| Grounding + claims checks | must pass | do not apply |
| Can earn the ⚠ verified star | yes | **never** |
| The fitter may trim it | yes, by rank | **no — pinned** |
| Counts toward the 160-line fill target | yes | **no** |

That last pair matters more than it looks. The fitter drops the lowest-ranked lines when space runs
out; a line the student typed because *the professor said it would be on the exam* must never be
ranked away. And the fill pass must not count three student notes as progress toward a full sheet.

---

## 2. Decisions locked

| # | Decision |
|---|---|
| 1 | Students can add **both** structured items (term + definition, Q + A, formula) **and** free-text note blocks |
| 2 | Deleting refills **instantly from the bench** — free, no model call, sheet stays full by default |
| 3 | Controls live in a **topic rail in the dock**, not on the sheet |
| 4 | **Auto-save with version history**; a student's own blocks survive a regenerate |
| 5 | **Tier 1 ships first.** "More on this topic" (the one paid control) comes later |
| 6 | **Free for everyone.** Tier 1 makes no model calls, so gating it earns nothing |
| 7 | **No manual reordering.** Priority vs course order stay the only two orders |
| 8 | **Desktop first.** Phones keep the current view-and-print experience |

### Why no drag-and-drop

Recorded so it is not relitigated. Reordering was never the ask — *select, reduce, add, edit* was.
Order is already a meaningful derived setting (`ctx.order`: priority or course order), and
hand-ordering discards the ranking that is the product's whole claim. The layout is computed:
`FittedSheet` measures, trims and reflows across 7 columns and two pages, so there is no stable slot
to drop into. And WCAG 2.2 SC 2.5.7 requires a single-pointer alternative to any drag anyway, so the
buttons get built regardless and the drag is decoration.

Where drag *would* earn its place later: figure placement (#15). That is genuinely spatial.

---

## 3. Scope

### v1 — tier 1, free and instant

- **Tick / untick a topic** — takes it off the sheet, space goes to the rest
- **Less** — trims that topic's lowest-ranked lines, floor of 3; below that, untick instead
- **Section mix inside a topic** — definitions · formulas · tables · traps · questions
- **Add your own** — a structured item, or a free-text note block
- **Edit in place** — click a line, change the words
- **Undo / version history**

None of these call a model. All are instant, reversible and free.

### Explicitly not in v1

- **"More on this topic"** — the one control that spends. Deferred: the sheet already arrives full,
  so it solves a smaller problem than it did when #20 was filed.
- Manual reordering (decision 7)
- Phone editing (decision 8)
- Editing the title, topic names, or the exam-format summary

---

## 4. The topic rail

One row per topic, in the dock beside the sheet. The sheet itself stays clean and print-true —
putting controls on it would clutter a layout whose entire point is density, and create hover
targets inside a 7-column grid.

```
☑ Attention & Transformers      42 lines   −   ▾ mix   + add
☑ Contextual Embeddings         31 lines   −   ▾ mix   + add
☐ Machine Translation           28 lines   −   ▾ mix   + add
──────────────────────────────────────────────────────────────
  Your notes                     3 lines             + add
```

- Hovering a row highlights that topic on the sheet.
- A topic with student content shows a quiet marker.
- **"Your notes"** is a pseudo-topic that appears only once a student adds a block that belongs to
  no chapter. A note added *to* a chapter lives in that chapter and flows with it.

---

## 5. Student blocks

### Adding
- **Structured item** — the student picks a type and fills its fields. It speaks the sheet's
  existing grammar, so it flows inside its topic and prints identically to any other line.
- **Free-text note** — one short block of their own words. Renders as a distinct block, not as a
  fake definition.

### Rules
1. A student block is **pinned**: the fitter never trims it. It leaves the sheet only when removed.
2. Its citation slot reads **`you`** — same position, same weight, no extra ink. Provenance, not a
   citation, so it survives the `off` / `compact` / `full` source modes.
3. It can **never** carry the ⚠ verified star.
4. Adding to an unticked topic **re-ticks that topic**. Silently accepting a line that does not
   appear is how an app loses trust.
5. Student blocks **survive a regenerate and a refill** — they are the one part of the sheet that
   cannot be reproduced.
6. An **edited** line becomes a student block: it keeps its original citation for reference but is
   marked as theirs and loses any star, because we no longer vouch for what it says.

---

## 6. Data model

`SheetContent` today has `topics`, `formulas`, `concepts`, `tables`, `traps`, `questions`, `figures`.

- Structured student items live in the **same arrays**, flagged `mine: true`. They flow and render
  through the existing path; only provenance and pinning differ.
- Free-text notes need a new array: **`notes`** — `{ id, topic?, text, createdAt }`.
- The item schema is `.strict()`, so `mine` and `notes` must be added to the contract deliberately
  (`src/contract/`), not tolerated as unknown keys.
- `ViewOptions` gains per-topic state: which topics are ticked, each topic's section mix, and each
  topic's trim depth. This is **view state, not content** — that is what keeps it free and instant.

### Persistence

- `sheets.content` is already updated in place on edit. Student blocks ride along inside it.
- **Version history** needs a new table:
  `sheet_versions (id, sheet_id, user_id, content, label, created_at)`, owner-scoped RLS mirroring
  `sheets`, capped at the **last 20 per sheet**, written debounced on meaningful change.
- The in-memory undo stack (last 10) stays for instant session-level undo. Version history is the
  durable layer underneath it.

---

## 7. Functional requirements

| # | Requirement |
|---|---|
| FR-1 | Unticking a topic removes it from the sheet and the fitter refills from the bench, with no model call |
| FR-2 | Re-ticking restores the topic exactly as it was |
| FR-3 | "Less" trims that topic's lowest-ranked lines only, never another topic's |
| FR-4 | "Less" stops at 3 lines; below that the control becomes "untick" |
| FR-5 | Per-topic section mix shows and hides sections within that topic only |
| FR-6 | A student can add a structured item that validates against the same contract as a generated one |
| FR-7 | A student can add a free-text note, to a topic or to "Your notes" |
| FR-8 | Every student block renders with `you` in the citation slot, in every source mode |
| FR-9 | A student block is never trimmed by the fitter and never carries the verified star |
| FR-10 | Editing a line marks it as the student's and removes its star |
| FR-11 | Student blocks survive regenerate, refill and reload |
| FR-12 | Every change auto-saves; the last 20 versions are restorable |
| FR-13 | No tier-1 control makes a model call or requires Pro |
| FR-14 | Adding to an unticked topic re-ticks it |
| FR-15 | The 160-line fill target counts our lines only, never the student's |

---

## 8. What it must never do

- Change the type size, the column count, or the page count to make content fit. **Add or remove
  content, never resize the sheet.** (The mainstream pattern — Rezi's auto-fit "adjusts font sizes
  and spacing" — is exactly what Clutch rejects.)
- Let a student line be mistaken for a verified one.
- Silently discard something a student typed.
- Charge for anything that costs nothing to run.

---

## 9. Build plan

| Step | Work | Done when |
|---|---|---|
| 1 | Contract: `mine` on items, `notes` array | schema tests pass; a sheet with student blocks validates |
| 2 | Per-topic view state + fitter respects pinning | untick / less / mix are instant with no model call; a pinned line is never trimmed |
| 3 | Topic rail in the dock | every control reachable by keyboard; hover highlights the topic |
| 4 | Add + edit blocks, `you` provenance | renders in all three source modes; never earns a star |
| 5 | `sheet_versions` + auto-save | 20 versions restorable; student blocks survive a regenerate |
| 6 | Verify in the browser | both themes, no horizontal scroll, print output correct |

**Not blocking anything.** The sheet already arrives full front and back — this is about control.
