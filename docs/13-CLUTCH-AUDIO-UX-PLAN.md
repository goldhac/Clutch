# Clutch Audio — UX plan

> Written 2026-09-29, for a design pass. Everything here is grounded in what is **built and
> measured**, not in what the pipeline was assumed to do. Where a number appears, it came from a
> real production run — those are the constraints the design has to live inside.
>
> Companion docs: `12-CLUTCH-AUDIO-PRD.md` §9 (committed surface), `11-PODCAST-BUILD-PLAN.md`
> (costs, corrected 2026-09-29).

---

## 1. The measured reality the design must absorb

These are not estimates. They are what production did.

| Fact | Number | What it costs the design |
|---|---|---|
| Episode generation | **12.9 min** (6-min episode) · **35.4 min** (19.5-min) | Nobody watches a spinner for this. See §3. |
| Worker claims a queued episode | **~10 s** | "Queued" is almost never the state a student sees. Don't over-design it. |
| Concurrency per student | **2 at once** | A 6-topic selection means waiting in a visible line. |
| Stages | ingest → outline → **script** → **claims** → voicing → assembling | Real progress is possible. See §3.2. |
| Stage durations (6-min episode) | outline 61 s · script 499 s · claims 499 s · voicing 210 s | The middle is 60% of the wait and has the least to show. |
| Cost per episode | **$0.3369** (target was $0.15) | Credits are scarce. Every spend must be deliberate and reversible-feeling. |
| Failure → credit | returned automatically, conditionally, once | Say so *every* time. It is the difference between a bug and a betrayal. |

**The single hardest UX problem here is not the player. It is the wait.** A student clicks "Make 3
episodes" and the product goes quiet for 40 minutes. Everything in §3 exists because of that.

---

## 2. What is already built (don't redesign, do review)

`/audio` exists and works, in two steps.

**Step 1 — build the pack.** Drop zone, per-file tag selector, a right-hand panel that counts files
and says how many become episodes. Reading the pack is free and says so.

**Step 2 — choose episodes.** The proposed split as an *editable list*: tick/untick, rename in
place, "Join up" to merge a topic into the one above, merge badges explaining why we joined
anything, a priority chip (Listen first / Then these / If there's time), per-topic minutes and
files, and a sticky panel showing selected count, total listening time and credits.

Three decisions already made, worth keeping unless design disagrees:

- **Defaults to the T1 topics, never to everything.** A 14-lecture course must not cost 14 credits
  because "all" was the easy default.
- **Priority and length are shown but not editable.** Priority is read off the student's own review
  sheets and past exams — it is information about their course, not a preference. Length follows
  the material; a 6-minute topic stretched to 20 is the padding the split exists to prevent.
- **Unreadable topics are never offered.** A chapter with no text layer is dropped from the list
  with a note, not shown and then refused.

**Open question for the design pass:** step 2 is currently a vertical list of cards. At 8+ topics it
is a long scroll with a sticky sidebar. Is that the right shape, or does this want a denser table
with the explanation on hover?

---

## 3. The waiting experience — the real work

Undesigned. This is where the design effort should go.

### 3.1 The principle: notify and leave, don't watch

At 13–35 minutes per episode, "stay on this page" is not a plan. The design should make **leaving
the obvious behaviour** and returning pleasant:

- The generate action's success state should say what happens next and that they can go:
  *"Two recording now, one waiting. You can close this — we'll keep going."* (Already the copy on
  `/audio`; the rest of the flow has to honour it.)
- Returning to `/audio` or the library must show live state without the student having asked.
- A finished episode should be findable without remembering where it was started.

**Design decision owed:** what is the return path? Options: (a) the series lives on `/audio` and the
page remembers, (b) episodes appear in `/library` beside sheets, (c) a dedicated `/listen`. The PRD
assumed a series page. My view: **(b) plus a series page** — students already know the library is
where their work lives, and audio should not be a separate universe.

### 3.2 Honest progress, built from real durations

The stage column already exists and is written live. The measured split for a 6-minute episode:

```
outline      61s    8%   "Planning the episode"
script      499s   64%   "Writing the conversation"
claims       ""     —    (runs inside script; same wall clock)
voicing     210s   27%   "Recording the voices"
assembling   ~5s    1%   "Putting it together"
```

Two things follow:

1. **A linear progress bar will lie.** Weight it by these real proportions, or don't use a bar.
2. **"Writing the conversation" is 64% of the wait and has nothing to show.** This is the stretch
   where students will assume it has hung. It needs either a substate (the claims check is a real,
   nameable step — *"checking every claim against your notes"* is both true and reassuring about
   quality) or something else to look at.

**Design decision owed:** does the waiting state earn a real screen — outline beats appearing as
they're written, the topic list with per-episode progress — or is it a quiet row that updates?

### 3.3 The queue is visible

Two record at once; the rest wait. A student selecting 6 topics sees 2 active and 4 queued. Position
in line should be stated plainly, not implied. *"3rd in line — starts in about 25 minutes"* is
computable from the measured durations and is far kinder than a spinner.

---

## 4. Episode states — the full set

The schema allows five. Each needs a designed row:

| State | Reality | What the row must do |
|---|---|---|
| `queued` | usually <10 s, but real when 2 are running | Show position and an estimate |
| `running` | 13–35 min, with a named stage | Stage name + honest progress + **cancel** |
| `done` | playable | Play, duration, chapters, download (Pro) |
| `failed` | credit already returned | Say why in the student's terms, say the credit came back, offer retry |
| `cancelled` | schema supports it; **nothing honours it yet** (#22) | Needs the control that makes it reachable |

**Failure copy is already written and should be reused verbatim** — it was built against real
failures:

- Thin source: *"Chapter 4 has only 0 characters of readable text… This usually means the file is a
  scan with no text layer, or the wrong file. Try the original slides or notes."*
- Provider out of credit: *"Clutch can't record episodes right now — the problem is on our side,
  not with your files. Your credit has been returned, and we're on it."* (Deliberately does **not**
  say "try again shortly" — retrying a wall the night before an exam is the worst advice we can
  give.)

### 4.1 Cancel is a design problem, not just a missing endpoint

Issue #22. There is currently no way to stop an episode. Given a 35-minute run and a scarce credit,
this is the control students will reach for most. Design needs to answer:

- Where does it live — the row, or a confirm?
- What does it promise? **A cancel before the first paid call is a full refund; after that it is
  not.** The honest design states that, rather than implying a clean undo.
- What does a cancelled row look like afterwards — gone, or present and re-runnable?

---

## 5. The player (Phase 3, PRD §9)

Committed already: play/pause, scrub, chapters, 1× / 1.25× / **1.5× default**, download for Pro.
Free tier hears exactly 90 s and fades mid-sentence into the unlock card.

Design attention needed on:

- **The 90-second fade.** It has to feel like a deliberate edit, not a bug or a network drop. The
  fade is applied in the audio itself; the UI has to agree with it.
- **Chapters as the actual navigation.** These map to outline beats — real sections of their
  lecture. This is the thing a study tool has that a podcast app doesn't; it deserves to be
  primary, not a menu.
- **Where playback lives.** A student listening while revising will switch pages. Persistent mini-
  player, or page-bound?

---

## 6. Cross-sell, both directions

Already on `/audio`: *"Revising by eye instead? Make a one-page sheet from the same files."*

Missing: the reverse. A student on `/results` with a finished sheet has already paid the ingest cost
— the cache makes preparing the same pack for audio nearly free and nearly instant. That is the
cheapest, most natural entry point to the feature and there is currently nothing there.

---

## 7. Mobile

The nav landed recently (`f6baa96`), so `/audio` is reachable on a phone. Two things the design pass
should decide:

- **Step 2 on a phone.** The topic card is checkbox + title + chip + "Join up" + metadata + merge
  note. It fits at 375 px but is dense. Does the merge explanation collapse?
- **Audio is a phone feature.** Listening happens walking, on a bus, at the gym. The player should
  probably be designed mobile-first and adapted up, which is the opposite of how the rest of Clutch
  was built.

---

## 8. What I'd prioritise

1. **The waiting experience** (§3) — the largest gap between what is built and what is usable.
2. **Cancel** (§4.1) — scarce credits plus a 35-minute run.
3. **The series/return path** (§3.1) — decide where audio lives before building the player into it.
4. **Player** (§5) — already specified; design once the above are settled.
5. **Reverse cross-sell** (§6) — small, cheap, high leverage.

---

## 9. Constraints the design cannot negotiate

- Reading a pack is **free**; only new episodes spend. Anything that spends must say so first.
- Every failure returns the credit, and **every failure message must say so**.
- Priority comes from the student's own exam material — never present it as our opinion.
- Episode length follows the material. There is no "make it longer" control, by design.
- Both themes, both HIG floors (28 pt pointer / 44 pt touch) via `.tap`, `aria-live` on state.
