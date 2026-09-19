# Listen: which voice should Clutch Audio ship?

Three takes on the **same lecture** (`21-attn.pdf`, Ouyang, NLP — Attention Networks).
Files 1 and 2 are **the same script, word for word**, voiced by two different providers, so any
difference you hear is the voice and nothing else. File 3 is the bar we set out to beat.

| # | File | What it is | Length |
|---|---|---|---|
| 1 | `1-gemini-flash-tts.mp3` | Our script · **Gemini 3.1 Flash TTS** | 22:49 |
| 2 | `2-fish-s2.1-pro.mp3` | Our script · **Fish Audio S2.1 Pro** | 20:54 |
| 3 | `3-notebooklm-benchmark.m4a` | **NotebookLM**, same PDF, its own script | 24:00 |

Transcripts of what is actually *heard* (machine-transcribed from the audio, not the script) are
beside each file, with timestamps — handy for jumping to a spot.

**Suggested listen: the first 90 seconds of each, back to back.** That is where the difference in
naturalness shows fastest. Then 2 minutes from the middle of one (try `08:30`, the multi-head
attention stretch) to hear how each handles a long explanation.

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

1. **You listen** to 1 and 2 and say which one sounds like Clutch. If Gemini sounds clearly better
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
