# Listen: which voice should Clutch Audio ship?

Three takes on the **same lecture** (`21-attn.pdf`, Ouyang, NLP — Attention Networks).
Files 1 and 2 are **the same script, word for word**, voiced by two different providers, so any
difference you hear is the voice and nothing else. File 3 is the bar we set out to beat.

| # | File | What it is | Length |
|---|---|---|---|
| 1 | `1-gemini-flash-tts.mp3` | Our script · **Gemini 3.1 Flash TTS** | 22:49 |
| 2 | `2-fish-s2.1-pro.mp3` | Our script · **Fish Audio S2.1 Pro** | 20:54 |
| 3 | `3-notebooklm-benchmark.m4a` | **NotebookLM**, same PDF, its own script | 24:00 |
| 4 | `4-fish-with-cues.mp3` | **Fish again — now with delivery direction** (see below) | 21:08 |
| 5 | `5-gemini-2.5-half-price.mp3` | **Gemini 2.5 Flash TTS — CHOSEN** · same voices, a third of the price | 19:57 |

Transcripts of what is actually *heard* (machine-transcribed from the audio, not the script) are
beside each file, with timestamps — handy for jumping to a spot.

**Suggested listen: the first 90 seconds of each, back to back.** That is where the difference in
naturalness shows fastest. Then 2 minutes from the middle of one (try `08:30`, the multi-head
attention stretch) to hear how each handles a long explanation.

---

## File 5: the same episode for a third of the price

Provider decided (Gemini). The remaining question was whether we are on the right *model*.
`gemini-2.5-flash-preview-tts` is half the list price of `gemini-3.1-flash-tts-preview`, and it
turns out to be cheaper still in practice because it bills fewer tokens per second of speech.
Same script, same two voices (Kore + Puck), one flag changed.

| | 3.1 Flash TTS (file 1) | 2.5 Flash TTS (file 5) |
|---|---|---|
| **Cost, this episode** | \$0.858 | **\$0.296 — 65% less** |
| Length | 22:49 | 19:57 |
| Pace | 179 wpm | **205 wpm** |
| Blocks needing a re-take | 10 | **4** |
| Wrong-voice lines after the pass | 3 | **1** |
| Words heard | 4,089 | 4,084 |

Cheaper, steadier, and it says the same words. **The catch is the pace**: 205 wpm is quicker than
NotebookLM's 179 and quicker than the 3.1 take. On the page that is a saving; in the ear it may
feel rushed for a student meeting this material two days before an exam. It also says the
lecturer's name differently ("Oyang" rather than "Ouyang").

**Chosen 2026-09-19 — Gold listened and picked 5.** It is now the default in `episode.ts`.

The question had been: is 5 too fast? If it is fine, take
it — it is a two-thirds cut of the single biggest cost in the feature, and fewer re-takes on top.
If it is too fast, we can slow it in the script (shorter turns, more pauses) before paying 3× for
the slower model.

---

## Read this before you judge Fish: the first A/B was not a fair fight

Gemini's request carried a full acting direction with every block —

> *"Two friends studying together. Warm, quick and genuinely curious, at a brisk conversational
> pace with natural reactions and gentle overlaps in energy — like overhearing a good
> conversation, never a presenter."*

— and **Fish was sent raw text with speaker tags and nothing else.** That was deliberate (compare
the bare voices) but it means file 2 is Fish with no direction at all, against Gemini with a
director in the room. Gold heard exactly that: more emotion and better reactions from Gemini.

**File 4 is the rerun with that fixed.** Fish S2 takes free-form delivery tags in square brackets,
so every line now carries direction from what the line already IS — `[puzzled, thinking out loud]`
on a confusion line, `[tentative, working it out]` on a quiz attempt, `[reassuring, confirming]`
on the answer, `[playful]` on an analogy. Same script, word for word. One variable changed.

**What changed, measured:**

| | Fish, bare (file 2) | Fish, directed (file 4) |
|---|---|---|
| Length | 20:54 | 21:08 — a touch slower |
| Blocks needing a re-take | 9 | **4** |
| Wrong-voice lines after the pass | 3 | **1** |
| Billed text | 23,716 bytes | 28,888 bytes (the tags cost bytes) |
| Cost | \$0 free tier (\$0.36 list) | \$0 free tier (\$0.43 list) |

The tags are **not spoken** — I transcribed the whole thing and checked. The transcript is the same
words as before, so the only difference is in delivery, and **a transcript cannot show that.**
Whether it now has the warmth you wanted is the one thing only your ear can settle.

**Listen to 2 and 4 back to back, first 90 seconds.** If 4 closes the gap on Gemini, Fish wins
outright — it is cheaper, faster, and does not have Gemini's voice-swap bug. If it does not, take
Gemini and stop paying attention to the price difference.

---

## The numbers (measured, not estimated)

| | Gemini 3.1 Flash TTS | Fish Audio S2.1 Pro |
|---|---|---|
| **Cost, this episode** | **$0.86** (42,880 audio tokens × $20/M) | **$0.36** list (23,716 bytes × $15/M) — **$0** today on the free tier |
| Cost per 100 episodes | ~$86 | ~$36 (or $0 while the free tier lasts) |
| Render time (23 blocks, 3 at a time) | ~6 min | **~3–4 min** |
| Pace | 158 wpm | **172 wpm** (NotebookLM: 179) |
| Voice-swap smoke test (blocks opening with B) | **swapped 3 of 3** | **clean 3 of 3** |
| Wrong-voice lines after the full pipeline | 0 (needed 10 re-takes + 5 re-voicings + 2 rewrites) | 0 (1 slip on the first pass, clean on the second) |

Price check: Gemini TTS is **$20/1M audio tokens**, re-verified on ai.google.dev 2026-09-18. The
`$6/M` that earlier docs used was wrong and is retired.

---

## Pros and cons

### Gemini 3.1 Flash TTS
**For**
- One vendor for the whole pipeline — same key, same billing, same SLA as the script model.
- Voices are clean, unambiguous, and licensed for commercial use with no extra homework.
- Multi-speaker is a first-class feature: one call takes a two-host block.

**Against**
- **2.4× the cost**, and it is the single biggest line item in an episode.
- **The voice-swap bug is structural.** Any block that *opens* with speaker B comes back with the
  voices reversed — 3 out of 3, every time. We work around it by making every block open with A
  and re-taking failures; that workaround is why it needs 10 re-takes an episode.
- Slowest of the three to render.

### Fish Audio S2.1 Pro
**For**
- **Cheaper (and currently free)** and roughly twice as fast to render.
- **Passed the swap test 3 of 3** where Gemini failed 3 of 3.
- Pace is closer to NotebookLM's, which reads as more natural to most listeners.

**Against**
- **Voice rights are the real problem.** Fish's library is mostly clones of named people and
  characters. This A/B used two generic library voices; shipping needs licensed or purpose-made
  house voices, and someone has to read the commercial terms.
- **No SLA.** The free tier is fair-use and runs out 2026-11-30. A second vendor is a second thing
  that can break at 2am.
- Emits exact digital silence between turns, so we can't splice the assembled audio by finding
  seams — Phase 1 would have to keep per-block files. (Worth doing anyway.)
- Undocumented limits (max text per request, sample rates) — unknown until we hit them.

### NotebookLM (the benchmark — never ships)
Unofficial API, no SLA, and it can't do our retrieval beat. It is here as the quality bar only.
Listen for what it does better: it is more conversational, and it holds a listener for 24 minutes without our re-takes. Listen for what it does
worse: it invented "50,000 words" and described p-gen as a dial that turns when a word is unseen —
neither is in the lecture. **That is the thing we are trying to beat: ours has to teach the actual
lecture, not a plausible-sounding version of it.**

---

## My recommendation

**Fish for the voice, if — and only if — the voice rights clear.** It wins on cost, speed, pace,
and it does not have Gemini's structural swap bug. Everything else is equal because the script is
identical.

But the licensing is not a detail: shipping a study product voiced by someone's cloned voice is a
real risk, and "generic library voice" is not the same as "voice we are allowed to use". The
order I would go in:

1. **You listen** to 1, 2 and 4 and say which one sounds like Clutch. If Gemini sounds clearly better
   to you, that ends it — pay the $0.50 an episode and keep one vendor.
2. If Fish sounds as good or better, **then** the question is licensing, and that is a real piece
   of work: read the commercial terms, pick or commission two house voices, confirm they are
   cleared for a paid product.
3. Keep the per-block voice check whichever way it goes. Both providers slipped at least once.

**What is actually blocking Phase 0 is not this choice — it is whether the episode teaches.** That
is the gate in issue #1, and it needs your ear on the content, not the timbre. If the answer to
"did I learn the lecture from this?" is no, the voice does not matter yet.

---

*Everything above is measured in `scripts/phase0/FINDINGS.md` §9–§10 and the per-run
`report-*.json` files. Audio was generated 2026-09-15 (Gemini) and 2026-09-17 (Fish).*
