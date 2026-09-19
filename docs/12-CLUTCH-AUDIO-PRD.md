# Clutch Audio — Product Requirements

**Status:** v2, ready to build · **Owner:** Gold Nwobu · **Rewritten:** Sep 11, 2026
**Inputs:** `10-…RESEARCH.md` · `11-…BUILD-PLAN.md` · **`reference/exam-prep/` — the hand-built
precedent, which outranks both** · reference repos read directly (see §11)

> **v2 changes the shape of the feature.** v1 had audio as a companion downstream of a sheet.
> It isn't. It's the front door, and it's a *sibling* of the sheet, not a child. The reason is
> in `reference/exam-prep/BUILD-LOG.md` §B.6 — see §3.

---

## 1. What this is

**Drop in a semester of notes. Get a podcast series, ordered by what's actually on the exam.**

One episode per topic, ~10 minutes, two hosts, with the exam-likely questions asked *at you*
mid-episode. Topics too thin to stand alone get merged. Playback order follows exam weight,
not lecture order.

This is the productised version of what Gold already built by hand for two courses
(CS 6320 NLP, CS 6360 Big Data — 28 topic folders, 14 generated podcasts). The workflow is
proven; this makes it a product.

---

## 2. Why audio is the front door, not an add-on

**The job.** Study time before an exam is not all desk time. Commutes, the gym, walking,
laundry. Hours where a sheet is useless and a podcast isn't. That time is currently unserved
by every study tool including ours.

**Why we win against NotebookLM and its clones.** They convert documents to conversation. We
convert documents to *a prioritised revision series that quizzes you*. The difference comes
from the pool: we know what's likely tested, what's exam-verified, what the traps are, and
what the answers are. Reading three reference implementations (§11) confirmed **none of them
have any retrieval or quizzing at all.** That's the moat, and it's not close.

**Why it's the front door.** "Turn my lecture notes into podcasts" is a thing students already
want and already search for. "Generate a one-page reference sheet" needs explaining. The audio
is the easier sell; the sheet is the thing they keep.

---

## 3. The architecture correction (this is the important part)

`11-PODCAST-BUILD-PLAN.md` had the podcast reading the sheet. **`BUILD-LOG.md` §B.6 says
that's exactly wrong**, from direct experience:

> *"**Don't upload the cheatsheet** — too terse, NotebookLM produces a worse podcast from it
> than from full slides."*

That experiment has already been run by hand. The compressed artifact makes **worse** audio
than the raw source. So:

```
bulk upload
  └─ ingest + topic split          (parse/ingest.ts — exists)
       ├─→ AUDIO   ← full source text per topic
       └─→ SHEET   ← full source text per topic   (engine/rank.ts — exists)
```

Audio and sheet are **siblings off one ingest**, never a chain. Two consequences:

1. **The "we don't persist source text" problem disappears** for this flow. At upload we're
   holding the text. No new retention, no migration, no privacy surface.
2. It only returns for the *later* feature — "make audio for a sheet I saved last week."
   Deferred to v2 of the feature; see §10.

---

## 4. Rules taken from the hand-built precedent

All of these come from `BUILD-LOG.md` §B.6, which is failure-tested rather than theorised.

| Rule | Source | Why |
|---|---|---|
| **One topic = one source.** Don't blend lectures. | §B.6 | *"diluting with multiple sources reduces focus"* |
| **Merge only when too thin.** `<5 min` of material → combine with one supplementary source. | §B.6 failure modes | Padding a thin topic produces exactly the waffle that makes AI podcasts unlistenable |
| **Never generate from the compressed artifact.** | §B.6 | The cheatsheet experiment above |
| **~10 minutes per topic episode.** | §B.6 goal | v1 of this PRD said 5–8; the proven number is 10 |
| **Priority-ordered playback**, T1/T2/T3 prefixes. | §B.6 | Exam weight, not lecture order |
| **Two hosts: A drives, B asks the listener's question.** | `podcast-script.md` | Independently matches podcastfy's `main summarizer` + `questioner/clarifier` |

### The script format — lifted from `11-attention/podcast-script.md`

That file is the target. It is better than both reference implementations for teaching, and
the structure is deliberate:

1. **Cold open** naming the stake, ≤ 60 s — *"the architecture behind basically every modern
   NLP system. We'll keep it concrete."*
2. **B asks the motivating question first** — *"What problem does attention even solve?"*
   Motivation before mechanism.
3. **A concrete worked example**, carried through the whole episode ("The cat sat on the mat").
4. **Analogies that do real work** — attention as a student translating with the textbook
   open; Q/K/V as a search engine.
5. **B voices the listener's actual confusion** — *"Now here's the thing that confused me…"*
6. **The mechanism, with why it matters** — √d_k explained via *gradients die*, not as trivia.
7. **Recap before close.**
8. **Listener homework** pointing back at the written artifact — *"Compute scaled dot-product
   attention by hand on three tokens. The notes file has the example."*

That last beat is the *learn-it-on-the-bus, confirm-it-on-the-sheet* loop, already invented.
**Keep it.** It is the single cheapest thing that makes audio part of the product rather than
a side feature.

### Added to the precedent: mandatory retrieval

The hand-built scripts recap but don't quiz. We add **one retrieval beat per episode**:
question → genuine pause → answer → why. Retrieval practice beats re-exposure for delayed
recall under time control ([Roediger & Karpicke
2006](https://journals.sagepub.com/doi/10.1111/j.1467-9280.2006.01693.x)). We can do this and
the clones can't, because we have answered questions in the pool. **This is the feature that
makes it revision rather than content.**

---

## 5. Scope

### v1 — the front door
1. Upload a bulk of notes (multi-file, a semester's worth).
2. Ingest → split into topics → rank by exam weight.
3. Generate one ~10 min episode per topic, thin topics merged.
4. Priority-ordered playlist with a chaptered player.
5. Free preview → Pro unlock.

### Deliberately not in v1
- Audio for an existing saved sheet *(the §3 source-text problem — v2)*.
- The 15–30 min whole-course crash course *(v2; it's the audio CLUTCH.md, and it needs the
  per-topic episodes to exist first)*.
- Voice cloning or user-chosen voices. Two fixed Clutch voices.
- Languages other than English. More than two speakers.
- Public/shareable links, RSS, transcripts as a surface (script is persisted, not shown).

---

## 6. Functional requirements

### Ingest + topic split
- **FR-1** Accepts a multi-file upload (PDF, PPTX, DOCX, TXT) reusing `parse/ingest.ts`.
- **FR-2** Splits the pack into topics. Default: **one source file = one topic**, matching the
  precedent. Filename is the topic hint.
- **FR-3** Estimates per-topic material depth. A topic below the threshold for ~5 minutes of
  audio is **merged** with its nearest-neighbour thin topic, never padded (§4).
- **FR-4** A merged episode names both topics in its title and is chaptered at the seam.
- **FR-5** Topics are ranked by exam weight using the existing `scoreItem()` / `ScoreCtx`.
- **FR-6** The user sees the detected topic list, with merges shown, **and can edit it before
  generating.** Wrong splits are the most expensive failure — one bad split wastes a whole
  episode's credits.

### Generation
- **FR-7** Generation is asynchronous; the request returns a job id.
- **FR-8** The pipeline is outline → script → TTS → mux → store. **The outline stage is never
  skipped.**
- **FR-9** Script conforms to `PodcastScriptSchema` (Zod), validated with the existing
  validate → quote-offending-value → retry-once pattern.
- **FR-10** **Every episode contains exactly one retrieval triple** (q → pause → a), enforced
  by the schema, not by the prompt.
- **FR-11** Dialogue lines are capped at ~100 characters (≈5–8 s of speech) — the pacing rule
  from `open-notebooklm`, which prevents the monologue-y output long lines produce.
- **FR-12** TTS is **single-pass multi-speaker per chunk**. Per-line generation and
  concatenation is forbidden — it causes audible voice drift.
- **FR-13** Chapter offsets derive from the SDK's word timestamps (`turnIndex`), not from hand-tracked chunk durations.
- **FR-14** Output MP3 (SDK `output: { format: "mp3" }`); duration and chapter offsets persisted.
- **FR-15** Every stage logs tokens and cost to `podcast_costs`.

### Entitlement
- **FR-16** Credits debit **server-side on job acceptance**: 1 credit per episode.
- **FR-17** A failed job refunds exactly once; refund is idempotent.
- **FR-18** Free users get the first episode's **first 90 seconds** as a *separately stored
  clip*. The full object is never delivered to an unentitled client.
- **FR-19** Signed URLs are granted only after a server-side entitlement check, TTL ≤ 1 h.
- **FR-20** Max 2 running jobs per user; the rest queue.

### Data
- **FR-21** Episodes are owner-scoped by RLS, mirroring the `sheets` policy set.
- **FR-22** Deleting a series deletes its episodes and their audio objects.

---

## 7. Data model

**`public.podcast_series`** — `id`, `user_id`, `title`, `course_code`, `ctx` jsonb (the
`ScoreCtx`), `topics` jsonb (detected + user-edited split, with merge record), `created_at`.

**`public.podcasts`** — `id`, `user_id`, `series_id` → cascade, `topic`, `topic_index`,
`priority` (`T1|T2|T3`), `status` (`queued|running|done|failed`), `error`, `duration_s`,
`chapters` jsonb, `audio_path`, `preview_path`, `script` jsonb, `credits_spent`, `refunded`,
timestamps. Unique partial index on `(series_id, topic_index)` where `status <> 'failed'`.

**`public.podcast_costs`** — `podcast_id` → cascade, `stage`, `model`, `tokens_in`,
`tokens_out`, `cost_usd numeric(10,6)`, `ms`. **From day one** — every cost figure in docs 10
and 11 is a third-party estimate, and this is how they stop being estimates.

**Storage** — private bucket `podcasts`, keys `{user_id}/{podcast_id}.mp3` and `…-preview.mp3`.
No bucket exists on the project today; creating it is part of Phase 1.

---

## 8. Architecture

Clutch is **Next.js 15 on Railway + Supabase** — not the FastAPI the research doc assumed.

```
POST /api/audio/analyze   → ingest · split · rank · return editable topic list  (sync, fast)
POST /api/audio/generate  → entitle · debit · enqueue N jobs                    → { seriesId }
GET  /api/audio/:seriesId → per-episode status · signed URLs when done
worker (pg-boss)
   ├─ outline   LLMClient   → beats JSON
   ├─ script    LLMClient   → PodcastScript (Zod)
   ├─ speak     @speech-sdk/core generateConversation → MP3 + word timestamps
   │                                                  (turnIndex → chapter offsets)
   ├─ preview   cut first 90 s as its own object
   └─ store     Supabase Storage
```

Concern split follows the NVIDIA blueprint (API / agent / ingest / TTS as separate units) —
minus the microservices, because we're one app.

**New code:** `src/contract/podcast-script.ts` (Zod), `src/engine/podcast.ts` (outline +
script), `src/engine/tts.ts` (a ~50-line `speak()` wrapper — see below), `src/worker/`.

**TTS is a dependency, not a build.** `@speech-sdk/core`'s `generateConversation()` already
does the hard parts (§11): native multi-speaker transport where the provider offers one,
RMS loudness normalisation, per-turn retries, MP3 output, and word timestamps carrying
`turnIndex`. That last one gives us **chapter offsets for free** — no manual PCM→WAV→ffmpeg
crossfade chain, which was most of the original Phase 1.

We still write one thin `speak()` wrapper over it. The SDK is pre-1.0 (0.29.0, 49 stars); the
wrapper is the single file we'd change if it churns or we drop it.

**New deps:** `pg-boss`, `@speech-sdk/core`. **ffmpeg may no longer be needed** — confirm in
Phase 0 whether the SDK's MP3 output covers us; if it does, the Dockerfile is untouched.

**Reused unchanged:** `parse/ingest.ts`, `LLMClient`, `scoreItem`, the `/api/tweak`
entitlement pattern, the `tk-0..9` topic colours.

---

## 9. Surface

**`/audio`** — new route, the front door.
- Drop zone → "analysing your notes" → **editable topic list** with detected priority, merge
  badges, per-episode credit cost, total.
- Generate → series page with per-episode rows: topic colour, priority chip, duration, status
  (queued / writing the script / recording / ready / failed+retry).
- Player: play/pause, scrub, chapters, 1×/1.25×/1.5× — **defaulting to 1.5×**, the speed the NLP game plan records actually listening at — download (Pro).
- Free: first episode plays 90 s, fades mid-sentence into the unlock card.
- Cross-sell: *"These notes can also make a reference sheet →"*, seeding the existing flow.

**Accessibility:** controls meet both HIG floors via `.tap` — 28 pt under a pointer, 44 pt under touch; `aria-live` for state; keyboard-navigable
chapters; contrast passing in both themes with `--on-band-*` on the dark player.

---

## 10. Costs, and what v1 deliberately defers

> **Rewritten 2026-09-15 from Phase 0 measurements.** The previous figures ($6/M TTS,
> 25 tokens/sec, ~$0.12/episode) were all third-party estimates and **all three were wrong.**

**Measured / official inputs**
| Input | Value | Source |
|---|---|---|
| `gemini-3.1-flash-tts-preview` output | **$20 / 1M** | ai.google.dev pricing, checked 2026-09-14 |
| `gemini-2.5-flash-preview-tts` output | **$10 / 1M** | same |
| `gemini-2.5-pro` (script) | $1.25 in / $10 out per 1M · **no free tier** | same |
| `gemini-2.5-flash` (script) | $0.30 in / $2.50 out per 1M | same |
| Billed audio tokens | **32.0 / second** | measured twice in Phase 0 (32.02, 32.05) — doc 10 assumed 25 |
| Speaking pace | **140 words / minute**, pauses included | measured, run 1 |
| Script tokens, one episode | ~10.2k in / ~4.6k out | measured, run 2 (outline + script) |

**Per episode — now measured on both TTS models, same script, same voices (2026-09-19).**
The earlier table assumed 2.5 billed at the same token rate as 3.1. It does not: 24.74 tokens per
second of speech against 31.72, so it lands cheaper than half.

| Configuration | measured, ~20 min | ~10 min (TTS scales with duration) |
|---|---|---|
| **2.5 Flash TTS + 2.5 Pro script** *(CHOSEN)* | **$0.59** ($0.296 TTS + $0.293 script) | ~$0.44 |
| 3.1 Flash TTS + 2.5 Pro script *(Phase 0's default until now)* | $1.15 ($0.858 + $0.293) | ~$0.72 |

**Decision (D-TTS): `gemini-2.5-flash-preview-tts`.** Gold compared the two takes by ear and chose
2.5. It is 65% cheaper on the dominant line item, needed 4 block re-takes against 10, and says the
same words. Its pace is quicker (205 wpm against 179) — if that ever reads as rushed, slow it in
the script with shorter turns and more pauses rather than paying 3× for the slower model.

**One caveat on every figure above: re-takes are not in them.** `ttsCostUSD` is computed from the
final audio's billed tokens, so discarded takes never appear. Round 4 rendered 33 blocks to keep
23. Real spend runs above the table by roughly the re-take rate — another reason 2.5's steadiness
is worth more than the sticker difference.

A 13-episode series at 10 min: **~$5.70**. **Credit pricing must clear ~$0.25–$0.45 per episode**,
not the $0.15 previously written here — settle it in the Stripe session.

**Deferred to v2 of the feature:**
1. **Audio from a saved sheet.** Needs the §3 source-text decision; only matters once people
   have sheets they want to re-listen to.
2. **The crash course.** The 15–30 min whole-course walkthrough — the audio `CLUTCH.md`.
   It composes from per-topic episodes, so it needs them to exist and be good first.

---

## 11. The reference landscape (searched Sep 11, not inherited from doc 10)

Doc 10's list was an Aug 8 snapshot and **missed the biggest repos in the space**. Re-searched
and read directly. The field splits into three groups, and the distinction matters:

### Group 1 — wrappers that drive Google's NotebookLM (a trap for production)
| Repo | Stars | Pushed |
|---|---|---|
| `teng-lin/notebooklm-py` | **19.3k** | Sep 8 2026 |
| `PleasePrompto/notebooklm-skill` | 7.8k | Sep 10 2026 |
| `PleasePrompto/notebooklm-mcp` | 3.4k | Sep 10 2026 |

These are unofficial API / browser automation against Google's product — none of them
generate audio themselves. **Not viable as a product dependency**: unofficial access, no SLA,
ToS exposure at scale, and our differentiator (retrieval from our own pool) is impossible
when Google writes the script.

**But `notebooklm-py` is an excellent Phase 0 accelerator.** It's exactly the flow Gold ran by
hand (`BUILD-LOG.md` §B.6, via Claude in Chrome). Use it to mass-generate reference episodes
from the `reference/exam-prep/` PDFs, as the benchmark our pipeline must match. Prototype
dependency only; never ships.

### Group 2 — actual pipelines
| Repo | Stars | Pushed | Verdict |
|---|---|---|---|
| **`CaviraOSS/PageLM`** | 2.0k | Aug 29 2026 | **Closest competitor — same category, and TypeScript.** Study materials → quizzes, flashcards, notes, podcasts. Read its `services/podcast` + `utils/tts`. |
| `souzatharsis/podcastfy` | 6.5k | May 2026 (stale) | Roles `main summarizer` + `questioner/clarifier` — independently the same as Gold's A/B split. |
| `gabrielchua/open-notebooklm` | 2.6k | **Dec 2024 — 21 months stale** | The ≤100-char-per-line rule and `<scratchpad>` brainstorm-first. Host-interviews-guest framing is wrong for peer teaching. |
| `NVIDIA-AI-Blueprints/pdf-to-podcast` | 875 | Jun 2026 | Concern separation only. Microservices are overkill for one Next.js app. |

**What PageLM does that we should not copy:** one-shot script generation with no outline stage
(the documented #1 cause of flat output), JSON extracted by brace-matching rather than a
schema, no exam awareness, no retrieval. We beat it on all four.

### Group 3 — the genuinely useful dependency

**`@speech-sdk/core`** (Apache-2.0, v0.29.0, 57 versions since Apr 2026, last publish Aug 24)
— from **Jellypod**, a real AI-podcast company. This is the `TTSProvider` abstraction I was
about to hand-write, already built and maintained:

- `generateConversation({ turns })` — **picks a native multi-speaker transport where the
  provider has one**, falling back to stitching. That is precisely the voice-drift problem
  doc 10 warns about, solved upstream.
- RMS loudness normalisation across turns.
- Word timestamps carrying `turnIndex` → **chapter offsets for free**.
- `output: { format: "mp3" }` → no manual PCM→WAV→ffmpeg chain.
- Per-turn retries, concurrency, inter-turn gap control.
- 14 providers, so swapping Gemini → ElevenLabs → self-hosted is a string change.

It also **settles doc 10's "verify the model IDs" action**: current Gemini TTS ids are
`gemini-3.1-flash-tts-preview` (latest, audio tags), `gemini-2.5-flash-preview-tts` (default),
`gemini-2.5-pro-preview-tts`. Voices include `Kore`, `Puck`, `Charon`, `Fenrir`, `Aoede`.

**Risk:** pre-1.0 (0.29.0) and only 49 stars, so the API may churn. Mitigated by keeping our
own thin `speak()` wrapper around it — one file to change if we drop it. That wrapper is the
only TTS abstraction we write.

## 12. Build plan

### Phase 0 — prove the format · ½ day · ~$0 · **gate**
The only phase that can kill the feature. Do it first, alone.

1. Verify the **single-sourced $6/M price** on ai.google.dev. (Model IDs are already settled
   by §11 — the SDK carries current ones.)
2. Generate a benchmark episode for `11-attention` **using `notebooklm-py`** against the same
   source PDFs — the mechanised version of what Gold did by hand. This is the bar.
3. Generate the same topic through our prompt (`generateConversation`, two voices) and compare
   three ways: against the NotebookLM benchmark, against the hand-written
   `11-attention/podcast-script.md`, and on whether the retrieval beat and homework close land.
4. Confirm the SDK's MP3 output is good enough to skip ffmpeg.

`11-attention` is the right test case precisely because it has source PDFs *and* a
human-written target script already sitting in the repo.

**Gate:** it teaches, not recites. If not, stop — no pipeline fixes a broken format.

### Phase 1 — pipeline · **1.5–2 days** (was 2–3; the SDK removes the audio-muxing work)
Tables, RLS, bucket, pg-boss, `podcast.ts`, the `speak()` wrapper, **CLI harness first**
(`gen-podcast --pack=… --topic=N`). Drivable with no UI.
**Done when:** CLI yields a playable chaptered episode from a real pack; `podcast_costs` has a
row per stage; a broken TTS key fails the job and refunds once.

### Phase 2 — topic split + the front door · 2 days
`/api/audio/analyze`, the editable topic list with merges, `/audio` route, generate flow.
**Done when:** a 14-file pack yields a correct editable topic list with sane merges, and the
user can fix a bad split before spending a credit.

### Phase 3 — player + gate · 2 days
Series page, chaptered player, 90 s preview, polling, credits.
**Done when:** free hears exactly 90 s and the full object is unreachable by direct URL; Pro
generates, plays, downloads; 44 pt + contrast pass in both themes.

### Phase 4 — hardening · 1–2 days
Real costs vs estimates, retries, regeneration, concurrency.
**Done when:** 20 consecutive generations, ≥95% success, no credit drift, COGS ≤ $0.15/episode.

**Total ≈ 7–9 working days**, with Phase 0 as a hard gate.

---

## 13. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Audio recites instead of teaching | **Highest** | Phase 0 gate, benchmarked against a hand-written script that already works |
| Topic split is wrong | **High** | FR-6: user edits before spending credits. A bad split wastes a whole episode. |
| Gemini TTS IDs / pricing churned | High | Phase 0 verifies; $6/M is single-sourced in doc 10 |
| A 14-episode series is a big first bill | Medium | Per-episode credits + generate-selected-topics-only |
| Supabase free tier pauses | Medium | Already bit us Sep 11; needs keep-warm or paid tier regardless |
| Worker starves the web process | Medium | Separate Railway service if observed |
| `@speech-sdk/core` is pre-1.0 and small (49★) | Medium | One thin `speak()` wrapper is the only contact surface; swapping it out is a single file. Apache-2.0, so vendoring is permitted if it's abandoned. |

---

## 14. Open decisions

| # | Decision | By | Default |
|---|---|---|---|
| D1 | ~~Script input~~ | — | **Resolved.** Full source, per `BUILD-LOG.md` §B.6 |
| D2 | Topic split: one file = one topic, or LLM-detected within files? | Phase 2 | One file = one topic (the precedent), LLM only for multi-topic files |
| D3 | Credit price per episode | Stripe session | 1 credit; needs > ~$0.15 to hold margin |
| **D5** | **Episode length: ~10 min or ~23 min?** | **Phase 0** | **Your own notes disagree.** `BUILD-LOG.md` §B.6 targets ~10 min, but `00-meta/game-plan.md` records "~5 hours of podcast audio across 13 m4a files" — ≈23 min each. Cost scales linearly, so this roughly doubles COGS. Settle by ear in Phase 0. |
| D4 | Worker in-container or own service | Phase 1 | In-container until proven otherwise |
