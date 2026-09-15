# Phase 0 findings — Clutch Audio quality gate (#1)

Source for every run: `reference/exam-prep/21-attn.pdf` alone (37 pages), mirroring
`BUILD-LOG.md` §B.6's one-source NotebookLM recipe so outputs are directly comparable.

**Gate question:** does a generated two-host episode *teach*, at the level of the NotebookLM
Audio Overviews Gold already liked?

---

## 1. Numbers the PRD had wrong (now fixed in `docs/12` §10)

| Assumption in docs 10/11 | Reality | How we know |
|---|---|---|
| TTS output **$6 / 1M** | **$20 / 1M** (3.1 Flash TTS) · $10 / 1M (2.5 Flash TTS) — **$6 does not exist** | ai.google.dev pricing page, 2026-09-14 |
| Audio bills **25 tokens / sec** | **32.0 tokens / sec** | Measured twice via direct API probe: 32.02, 32.05 |
| **~$0.12** per 10-min episode | **$0.21–$0.44** | Measured tokens × official prices |
| Prototyping on free tier ≈ **$0** | Gold's key is on a **billing** project (2.5 Pro has no free tier and succeeded) → paid rates | Inference from the run succeeding |
| Speaking pace ~150 wpm | **140 wpm**, pauses included | 782 words → 5.58 min |

Google's own TTS docs also warn *"speech quality and consistency may begin to drift with
generated outputs that are longer than a few minutes"* — so beat-aligned chunking is required,
not optional. `@speech-sdk/core` splits Gemini dialogue at 2,500 characters (~2–3 min).

## 2. What the SDK actually does (read at source, not README)

- **Uses Gemini's native two-speaker mode** (`multi_speaker_voice_config`, labelled
  `Speaker1:/Speaker2:` transcript) — NotebookLM-style turn-taking, not line-by-line stitching.
- Splits at 2,500 chars **by character count, not at beat seams** → we pre-group turns at beats.
- Accepts delivery `instructions` ahead of the transcript — where tone direction goes.
- **Surfaces no token usage** → cost must be measured with a separate direct API call.
- Logs a harmless *"Mediabunny was loaded twice"* warning; output was unaffected. Watch in Phase 1.

## 3. Round 1 → Round 2

| | Round 1 | Round 2 |
|---|---|---|
| Words / duration | 782 / 5.6 min | **1,222 / 8.9 min** |
| "Definitely on the exam" overclaims | 3 (doubled down in dialogue) | **0** |
| Host B share | ~⅓ of lines, many bare "Okay." | **38% of words**, substantive |
| Lines > 140 chars | 1 | 0 |
| Retrieval pause | inserted mid-question (bug) | after the full question |

Fixes: per-beat word budgets from the outline + validate-and-retry on length; trust rule in
both prompts ("a lecture alone is not exam evidence"); B must carry ≥40% with substance; pause
only after the last retrieval-question line; `open` beat no longer asks "why it matters on the exam".

**Standout:** the retrieval beat. Round 1: B guesses the heads are *averaged* (wrong — they're
concatenated), A corrects. Round 2: B guesses, then self-corrects out loud. Surfacing the real
misconception and resolving it is exactly what the clones cannot do.

**Grounding check passed:** "Q, K and V are sent through simple feed forward layers" matches
line 567 of the lecture verbatim.

## 4. Open problems

1. **Written for the eye, not the ear.** Round 2 lines contain `W_i`, `` `head_i` ``,
   `attention(W_i q, U_i k, V_i v)`, `*exact*`. A voice may read symbols literally.
   *Needs Gold's ear at ~2:00–4:00.* Fix if confirmed: "speak formulas in words; no markdown,
   code or symbols."

2. **Coverage — our outline narrowed the lecture to one idea.** NotebookLM's summary of the
   same PDF covers attention for NMT, the **pointer-generator network** (copying), **coverage
   vectors**, generalized Q/K/V attention, multi-head attention, the **Transformer**, and
   positional embeddings. Both our rounds taught **multi-head attention only**. B.6's goal is a
   walkthrough of the *topic*, i.e. the whole lecture. Fix: the outline must map the lecture's
   sections first and allocate time across them, rather than picking its favourite subtopic.

3. **Diagrams are not read.** Ingest vision only fires on scanned PDFs or pages with under
   ~25% of the document's average text, capped at 10 images. Every page of this lecture has a
   title and labels, so **0 characters came from diagrams** — including the Q/K/V and
   Transformer figures. Round 2's homework even points the student at the Encoder/Decoder
   slides it never saw. Affects **sheets too**. Fix once in the shared ingest: read pages that
   *contain figures*, not pages that *lack text*.

4. **Episode length (D5).** B.6 targets ~10 min; `00-meta/game-plan.md` records ~5 h across
   13 files ≈ 23 min each. NotebookLM's Default length on this PDF will be the tie-breaker.

## 5. NotebookLM benchmark

Generated 2026-09-15 in Gold's account, notebook *"Natural Language Processing Attention
Networks"*, one source (`21-attn.pdf`), **defaults Gold used in B.6: Deep Dive · Default
length · English · no focus prompt.**

NotebookLM's own customisation surface, worth borrowing later:
formats **Deep Dive / Brief / Critique / Debate**, lengths **Short / Default / Long**, and a
free-text *"What should the AI hosts focus on?"* box.

*Duration and Gold's verdict: pending.*

## 6. Spend

~$0.28 (round 1) + ~$0.40 (round 2) ≈ **$0.70** on the Gemini key. NotebookLM generation
draws on Gold's Pro plan allowance, not API spend.
