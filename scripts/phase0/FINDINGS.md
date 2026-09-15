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

## 4. Round 3 — all three fixes (2026-09-15)

Target matched to the benchmark: **24 min**, so length stops being a confound.

| | Round 2 | Round 3 | Benchmark |
|---|---|---|---|
| Duration | 8.9 min | **21.1 min** | 24:00 |
| Sections of the lecture taught | 1 of 6 | **6 of 6** | whole lecture |
| Diagram/equation content read | 0 chars | **+8,107 chars** (37 pages) | reads figures |
| Eye-only lines (`W_i`, `*x*`) | 5 | **0** | — |
| Exam overclaims | 0 | 0 | — |
| Retrieval questions | 1 | **3**, one per section block | **none** |
| Host B share | 38% | **31% ⚠** | — |
| Cost | ~$0.40 | **$1.10** ($0.29 LLM+vision, $0.81 TTS) | Pro plan |

Chapters: 0:00 unknown words · 2:12 copy network · 7:47 coverage · 12:28 generalized attention ·
14:43 multi-head · 16:19 Transformer.

**Fix 1 — coverage.** The outline now maps sections first (with weights) and every section ≥8%
must get a beat, validated with a replan. It covered all six on the first try — the same shape as
NotebookLM's own summary of the PDF. Transitions carry a through-line: each section is framed as
the fix for the previous one's problem ("we've been adding fixes — now let's step back and
generalize").

**Fix 2 — diagrams (shared ingest, `src/parse/`).** New `visionMode: "figures"` renders every
page and asks only for *visual* content, with its own prompt so slide text isn't duplicated
(0 of 105 lines duplicated). Sheets keep the old `"sparse"` default — unchanged until decided.
- Finds 16 of 37 pages with visual content. Raster-image detection would have found 7: **11 were
  vector diagrams** only rendering catches.
- It recovered **equations the text layer never had cleanly** — scaled dot-product attention,
  the pointer-generator probability, coverage — the most testable lines in a CS lecture. The
  **sheet engine has been missing these too.**
- Reads real diagrams accurately (p. 35: the full Transformer block — embeddings + positional
  encoding, multi-head attention → Add & Norm → feed-forward → Add & Norm, skip connections).
- ~27–36 s and **~$0.01** per 37-page lecture on Gemini Flash.
- **Bug found and fixed:** `rasterizePdf` silently capped at 12 pages; first test only saw 1–12.

**Fix 3 — ear.** Prompt rules (frame → say → why; "W sub i") plus a validator rejecting
backticks, asterisks, underscores, `=`, `^` and math symbols, with rewrite-and-retry. It caught
all 5 bad lines in round 2's script and no false positives on dashes/ellipses. Round 3 needed
**two** revisions (9 → 2 → 0 eye-only lines). Result: *"p-gen times p-vocab of w, plus one minus
p-gen, times the sum of attention scores…"* then B: *"p-gen is like a dial between generating and
copying."*

**Regression — host balance.** B fell from 38% to 31%. Balance is requested in the prompt but
not *validated*, and two rewrites optimised for what was validated. Lesson for the real contract
(#3): every quality rule that matters must be a check, not a request.

### Still open
1. **Gold's listen** — does it teach, and how does it compare to the 24-min NotebookLM episode?
2. **Sheets + figures mode** — worth turning on (equations!), but it adds ~30 s to a synchronous
   request. Needs a sheet A/B before flipping production.
3. **Balance** — add B-share to the validator.
4. **Cost lever** — three Pro drafts cost $0.29; the same tokens on 2.5 Flash would be ~$0.07.

## 5. NotebookLM benchmark

Generated 2026-09-15 in Gold's account, notebook *"Natural Language Processing Attention
Networks"*, one source (`21-attn.pdf`), **defaults Gold used in B.6: Deep Dive · Default
length · English · no focus prompt.**

NotebookLM's own customisation surface, worth borrowing later:
formats **Deep Dive / Brief / Critique / Debate**, lengths **Short / Default / Long**, and a
free-text *"What should the AI hosts focus on?"* box.

**Result: "How Attention Networks Taught Machines to Read" — 24:00.** That settles D5 by
evidence: NotebookLM's *Default* Deep Dive on one lecture is ~24 min, matching `game-plan.md`'s
~23 min/episode. B.6's "~10 min" was aspirational. Rounds 1–2 (5.6 / 8.9 min) were under half.

*Gold's verdict: pending.*

## 6. Spend

~$0.28 (round 1) + ~$0.40 (round 2) + $1.10 (round 3) + ~$0.02 (vision tests) ≈ **$1.80** on the
Gemini key. NotebookLM generation
draws on Gold's Pro plan allowance, not API spend.
