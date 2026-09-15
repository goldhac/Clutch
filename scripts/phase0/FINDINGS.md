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
  the pointer-generator probability, coverage — the most testable lines in a CS lecture.
  ~~The sheet engine has been missing these too.~~ **Wrong — see §7:** Pro rebuilt all of them
  from the garbled text layer on the sparse sheet.
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
2. ~~**Sheets + figures mode**~~ — shipped 2026-09-15, see §7.
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

## 7. Round 3 follow-ups (2026-09-15): intro + figures mode for sheets

### The intro
Gold: *"did not hear a good intro."* Round 3 opened mid-thought ("So the biggest headache…")
because both prompts said **"no greetings, open mid-thought."** Fixed as a structured, validated
intro: HOOK (from this lecture) → WELCOME → MAP (every section, as a story) → PROMISE (specific)
→ HANDOFF. `--intro-only --reuse <run>` rewrites just the intro and splices it onto the run's
existing audio: ~$0.08 per try instead of $1.10.

| | v1 | v2 |
|---|---|---|
| Hook | "many airports were forced to close" (lecture's coverage example) | same |
| B's lines | 1 of 7 | **4 of 10** (asks, guesses the next fix) |
| Promise | "explain how this all works" | **Q/K/V, and why Transformers train in parallel** |
| Length | 61 s | 71 s |
| Validator catches | 202 words (>200) | 212 words (>200) |

Checks added after v1: B speaks ≥3 intro lines; vague promises rejected. **v2 grounding slip:**
"[copying] causes repetition" — the lecture says encoder-decoders in general repeat. Cause: the
through-line framing "each idea fixes the previous one's problem" invites invented causality.
Rule added to both prompts. Phase 1 needs a claims check, not just shape checks.

### Figures mode for sheets — A/B on 21-attn.pdf, same settings (max · mixed · balanced)

| | Sparse (old) | Figures (new) |
|---|---|---|
| Vision chars added | 0 | ~9,900 |
| Formulas | 15 | 15 (+ attention-with-coverage) |
| Concepts / traps / questions / tables | 18 / 12 / 18 / 5 | **25 / 16 / 30 / 6** |
| Topics | 4 | 5 |
| Input tokens | 13.1k | 20.0k (+~$0.01) |
| Ingest latency | 0.1 s | ~30 s one lecture · **19 s for a 3-lecture pack** (parallel) |

- **Correction:** the sparse sheet already had every key equation — Pro rebuilds them from the
  broken text layer. Figures mode didn't rescue formulas here; it made the sheet **broader**
  (+12 questions, +7 concepts, +4 traps). Its real value is diagram-only content on other packs.
- N=1 per arm; item counts vary run to run.
- **Sturdiness work shipped with it:**
  - vision batches run 4 at a time, each retried once; a failed batch loses only its pages (with
    a warning) instead of every diagram in the file;
  - `/api/generate` ingests files in parallel and validates all uploads before any model call;
  - warning when a PDF exceeds the 60-page vision cap;
  - **engine drops unknown keys** before validating. The first figures sheet *failed* after
    the model twice added `a_long` beside `a`; strict schemas turned harmless noise into a dead
    sheet. Real rules (citations, trust, table shape) still reject — tested with a fake client.
- Both sheets still needed one engine retry for other slips — worth its own look.

## 8. Transcript comparison vs NotebookLM (2026-09-15)

Gold: intro "calm, maybe could be a bit shorter" → v3 is **47 s / 112 words** (limit now 70–120
words, B ≥2 lines). The "copy causes repetition" slip survived the prompt rule — needs a claims check.

Both episodes transcribed from audio (`transcribe.ts`, Gemini 2.5 Flash, ~$0.05 each). Report:
https://claude.ai/artifact/U1JTFBqziFxGd62gNP168u

| | NotebookLM | Clutch r3 |
|---|---|---|
| Duration / words | 24:00 / 4,301 | 21:07 / 3,171 |
| Turns per minute | **10.5** | 5.8 |
| Median turn · longest | **16 w** · 65 w | 23 w · 91 w |
| Turns ≤5 words | **26%** | 7% |
| Pace | **179 wpm** | 150 wpm |
| Retrieval questions | 0 | **3** |
| Lecture points (26): yes / partly / no | 16 / 7 / 3 | **18** / 1 / 7 |
| Wrong-voice lines | — | **37 of 145 (26%)** |

- **Voice swaps (critical, new):** a voice-labelled transcript puts 37 lines in the wrong host's
  voice, in runs (16:18–18:40 worst). The SDK maps voices correctly; runs begin after back-to-back
  same-speaker lines or role-breaking lines. Not explained by which host opens a block.
- **NotebookLM wins on sound:** rhythm, 9 recurring analogies with callbacks, curiosity/pushback
  transitions, show wrapper (recap before the Transformer, "why it matters", next-lecture teaser,
  sign-off), and breadth (trade-offs, matrix packing, ELMo/BERT).
- **Clutch wins on study value:** spoken formulas, mechanism depth (sum over repeats, pointer =
  attention, coverage in energy *and* loss), 3 quizzes, fewer wrong claims. NotebookLM teaches a
  p-gen misconception ("the dial turns to copy when a word is unseen") and embellishes examples.
- **Clutch misses:** softmax(QKᵀ/√dₖ)·V (vision read it; script never used it), Transformer
  trade-offs, 17% airtime for a 28% section, invented "50,000 words", no ending.
- Round 4 plan (each with a check): voice check per block, rhythm limits, analogy spine,
  curiosity transitions, show wrapper beats, must-say list, airtime vs weight, claims check.

## 6. Spend

~$0.28 (round 1) + ~$0.40 (round 2) + $1.10 (round 3) + ~$0.02 (vision tests) + $0.16 (two intro
previews) + ~$0.45 (sheet A/B, three engine runs) + ~$0.03 (ingest timing) + $0.07 (intro v3) + $0.16 (three transcriptions) ≈ **$2.70** on the Gemini key. NotebookLM generation
draws on Gold's Pro plan allowance, not API spend.
