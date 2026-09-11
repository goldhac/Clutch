# Clutch Audio — Product Requirements

**Status:** draft for sign-off · **Owner:** Gold Nwobu · **Written:** Sep 11, 2026
**Inputs:** `10-PODCAST-FEATURE-RESEARCH.md` (research) · `11-PODCAST-BUILD-PLAN.md` (decisions)
**Sequencing:** builds after the v2 redesign, which shipped Sep 11.

This PRD is the buildable layer under those two. 10 answers *what's possible*, 11 answers
*what we chose*. This answers **what exactly gets built, how we know it works, and what
happens when it doesn't.**

> **One decision needs your sign-off before Phase 1: §4, the script input problem.**
> Everything else here is specified.

---

## 1. Summary

**One sentence:** Clutch Audio turns a finished sheet into a listenable walkthrough — a
15–30 minute crash course that makes every line on your sheet *understandable*, plus 5–8
minute topic episodes for the parts that still don't land.

The sheet is the at-the-desk artifact. Audio is the away-from-desk companion: **learn it on
the bus, confirm it on the sheet.**

---

## 2. Why this, why now

**The gap in the product today.** The sheet is deliberately terse — "if it takes ink, it
earns it." That density is the feature at the exam desk and a bug the week before it. A
student who doesn't already understand `Var(X) = E[X²] − (E[X])²` gets no help from seeing
it compressed onto one line. The sheet tells you *what* will be tested and *how confident*
we are. It does not teach.

**Why audio specifically.** Study time before an exam is not all desk time. Commutes, walks,
laundry, the gym — hours where a sheet is useless and a podcast isn't. This is the only
format that reaches that time.

**Why we can do it better than a NotebookLM clone.** Every clone converts raw documents to
chat. We have something none of them do: **a ranked, scored, exam-aware pool.** We know which
items are likely to be tested, which are exam-verified, which are traps, and what the answers
are. That turns a generic summary podcast into a *prioritised revision session with built-in
quizzing*. The moat is the pool, not the pipeline.

---

## 3. Users, jobs, and scope

### Primary user
The student who already generated a sheet and has 48 hours to go. Has the sheet. Doesn't
fully understand all of it.

### Jobs to be done
| # | Job | Format |
|---|---|---|
| J1 | "Make me understand what's on my sheet, hands-free." | Crash Course |
| J2 | "I still don't get *this one topic*." | Topic Episode |
| J3 | "Test me on the likely questions without me reading them." | Retrieval segments (both) |
| J4 | "Remind me where people lose points." | Trap moments (both) |

### Non-goals for v1 — explicitly out of scope
- Voice cloning or user-selected voices. Two fixed Clutch voices.
- Languages other than English.
- More than two speakers (Gemini multi-speaker caps at 2).
- Editing the script by hand before generation.
- Public/shareable episode links or an RSS feed.
- Offline download outside the browser's own audio caching.
- Transcripts as a first-class surface (we *generate* one; displaying it is a fast-follow).
- Audio for anything other than a sheet the user owns.

---

## 4. ⚠ The script input problem — DECISION REQUIRED

**`11-PODCAST-BUILD-PLAN.md` §1 states the episode input is "full ingested source text
filtered per topic (we keep it from `ingest.ts`)". We do not keep it.**

Verified in the code:
- `src/app/api/generate/route.ts` ingests the pack, passes text to `generateSheet()`, and
  returns only `{ content, meta, warnings, pack }` — where `pack` carries *filename, tag and
  char count only*, never the text.
- `public.sheets` stores `title`, `content` (the pool), `ctx`. No source text column.
- Ingested text exists only in server memory for the life of one request.

So the crash course's stated job — *explain the sheet's dense lines from the fuller notes* —
has no fuller notes to work from unless we change something.

### Options

| | Approach | Cost | Script quality ceiling |
|---|---|---|---|
| **A** | **Pool-only.** Script from the pool alone. | Zero schema change. Ships now. | Bounded. The pool is richer than it looks — `topic.why`, `concept.def` + `ex`, `formula.vars`/`when`/`trap`/`ex`, `question.q` + `a` — but it's all *already compressed*. Risk: audio that restates the sheet rather than explaining it. |
| **B** | **Persist raw source text** per sheet. | New storage; a privacy surface (we'd be holding students' course materials indefinitely); packs run to hundreds of KB. | Highest. Full context to teach from. |
| **C** | **Persist a per-topic teaching brief**, written at generate time while the text is still in memory. | One extra cheap LLM call during generation (~$0.01), one new column. No raw-material retention. | Near-B. Purpose-built for exactly this job. |

### Recommendation: **C**

At `generateSheet()` time we already hold the full text and have already paid to understand
it. Emitting a compact per-topic brief (target ~150–250 words per topic: what this topic
actually *is*, the intuition, the worked mechanics) costs one small call and gives the audio
pipeline what it needs without us becoming a warehouse of other people's lecture slides.

It also degrades gracefully: sheets generated *before* this ships have no brief, so they fall
back to **A** (pool-only) rather than failing. Which means A is implemented either way, as
the fallback path.

**If you pick A**, the crash course's promise narrows honestly to "walks your sheet in
priority order and quizzes you" rather than "makes it understandable", and §5 copy changes
to match. **Tell me which and I'll finalise §5–§8 around it.** The rest of this PRD is
written to be correct under either.

---

## 5. The formats

### Format A — Crash Course (flagship)

One episode per sheet. Walks the sheet in priority order, topic by topic.

| Property | Spec |
|---|---|
| Length | Scales with sheet: ~2–4 min/topic. 6 topics ≈ 15–20 min. **Hard cap 30 min.** |
| Structure | Cold open ≤ 60 s → per-topic chapters → closer |
| Chapters | One per topic, at topic boundaries, topic-coloured in the player |
| Retrieval | **Exactly one** per topic chapter — question, genuine pause beat, answer, why |
| Traps | Woven in where the topic has trap items |
| Hosts | Two, fixed. One plays slightly naive and asks what the listener would ask. |

**Why 30 minutes is the cap:** completion is 74% for 20–40 min episodes and drops to 58%
past 45 ([PodRewind](https://podrewind.com/blog/podcast-completion-rate-analysis)). Chapters
exist because learner-paced segments beat one continuous unit — Mayer's segmenting principle
([Cambridge](https://www.cambridge.org/core/books/abs/multimedia-learning/segmenting-principle/37240877DDA0362355ADB39936027982),
[2023 study](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10759450/)). Conveniently the
pedagogy and the engineering want the same cut points: topic seams are also where TTS
chunking puts its prosody resets, so the seams are least audible exactly where we need them.

**Why retrieval is mandatory, not decorative:** retrieval practice beats re-exposure for
delayed-test performance under time control ([Roediger & Karpicke
2006](https://journals.sagepub.com/doi/10.1111/j.1467-9280.2006.01693.x)). This is the line
between Clutch Audio and "audio notes" — and no NotebookLM clone does it, because none of
them have answered questions to quiz from.

### Format B — Topic Episodes (drill-down)

5–8 minutes, one per topic, priority-ordered. Same rules; retrieval block near the end
rather than mid-chapter. For the topic that still didn't land.

### Shared rules
- Cold open ≤ 60 s, opening on the exam stake ("this topic is roughly 20% of your exam"),
  never on pleasantries. Intros over 90 s nearly double drop-off.
- Two named, consistent Clutch voices (Gemini prebuilt pair, e.g. Kore + Puck).
- English only.
- **Never invent.** Same rule as the sheet engine: if the pool doesn't support a claim, the
  script doesn't make it. No confident audio about something we can't cite.

---

## 6. Functional requirements

Numbered for traceability to issues and tests.

### Generation
- **FR-1** A signed-in Pro user can generate a crash course from any sheet they own.
- **FR-2** A signed-in Pro user can generate a topic episode for any topic on a sheet they own.
- **FR-3** Generation is asynchronous. The request returns a job id immediately; it never
  blocks a request cycle.
- **FR-4** Client polls job status and renders queued / running / done / failed.
- **FR-5** Credits are decremented **server-side**, on job acceptance, before work starts:
  crash course **3**, topic episode **1**.
- **FR-6** A failed job **refunds** its credits exactly once. Refund is idempotent.
- **FR-7** Regeneration is allowed and costs full price. No silent free retries.
- **FR-8** A user may have at most **2 running jobs** concurrently; further requests queue.
- **FR-9** Generating an episode that already exists replaces it only after the new one
  succeeds. A failed regeneration leaves the previous episode intact.

### Pipeline
- **FR-10** The pipeline is: outline → script → TTS → mux → store. The **outline stage is
  never skipped** — one-shot scripts are the documented reason clones sound flat.
- **FR-11** The script conforms to a Zod contract (`PodcastScript`), validated with the same
  validate → quote-offending-value → retry-once pattern as `SheetContent`.
- **FR-12** TTS uses **single-pass multi-speaker** per chunk. Per-line generation and
  concatenation is forbidden — it produces audible voice drift.
- **FR-13** Chunk boundaries fall on topic/beat seams only.
- **FR-14** Chunks are crossfaded, not butt-joined.
- **FR-15** Output is MP3, 128 kbps mono, with duration and chapter markers persisted.
- **FR-16** Every stage logs tokens and cost to `podcast_costs`, from day one.

### Entitlement
- **FR-17** Free users see the player with the crash course's **first 90 seconds**, which
  fades mid-sentence into an unlock card — the same pattern as the blurred back page.
- **FR-18** The 90-second preview is a **separately stored clip**, not a range request
  against the full file. The full audio must never be delivered to an unentitled client.
- **FR-19** Entitlement is enforced server-side on the signed-URL grant, never in the client.
- **FR-20** Signed URLs expire in ≤ 1 hour.

### Data
- **FR-21** Episodes are owner-scoped by RLS, matching the `sheets` policy set.
- **FR-22** Deleting a sheet deletes its episodes and their audio objects.
- **FR-23** Audio objects are private; access only via signed URL.

---

## 7. Data model

### `public.podcasts`
| column | type | notes |
|---|---|---|
| `id` | uuid pk | `gen_random_uuid()` |
| `user_id` | uuid → `auth.users` | RLS subject |
| `sheet_id` | uuid → `public.sheets` | `on delete cascade` (FR-22) |
| `kind` | text | check `('crash','topic')` |
| `topic` | text null | required when `kind='topic'`; exact copy of a `topics[].name` |
| `status` | text | check `('queued','running','done','failed')` |
| `error` | text null | user-safe failure reason |
| `duration_s` | int null | |
| `chapters` | jsonb null | `[{title, startS, topicIndex}]` |
| `audio_path` | text null | storage key, full episode |
| `preview_path` | text null | storage key, 90 s clip (FR-18) |
| `script` | jsonb null | retained for transcript fast-follow + debugging |
| `credits_spent` | int | for idempotent refund (FR-6) |
| `refunded` | bool default false | |
| `created_at` / `updated_at` | timestamptz | |

Unique partial index on `(sheet_id, kind, topic)` where `status <> 'failed'` — one live
episode per slot (FR-9).

### `public.podcast_costs`
`id`, `podcast_id` → cascade, `stage` (`outline'|'script'|'tts'`), `model`, `tokens_in`,
`tokens_out`, `cost_usd` numeric(10,6), `ms`, `created_at`.

Exists from day one specifically to check §7 of the research doc against reality. Every cost
number in 10 and 11 is an estimate from third-party pricing trackers; this table is how they
stop being estimates.

### Storage
Bucket `podcasts`, **private**, owner-prefixed keys `{user_id}/{podcast_id}.mp3` and
`…-preview.mp3`. No bucket exists today — creating it is part of Phase 1.

### Migration to `sheets` (only if §4 → C)
`ALTER TABLE public.sheets ADD COLUMN topic_briefs jsonb` — `[{topic, brief}]`, nullable, so
existing sheets keep working on the pool-only fallback.

---

## 8. Architecture

Corrects the research doc's stack assumption: Clutch is **Next.js 15 on Railway + Supabase**,
not FastAPI. Ingestion and condensing already exist in the sheet engine.

```
POST /api/podcast          → validate · entitle · debit · enqueue        → { jobId }
GET  /api/podcast/:id      → status · chapters · signed URL when done
worker (pg-boss)
   ├─ outline   LLMClient  → beats JSON            → podcast_costs
   ├─ script    LLMClient  → PodcastScript (Zod)   → podcast_costs
   ├─ tts       TTSProvider→ PCM per chunk         → podcast_costs
   ├─ mux       ffmpeg     → crossfade · MP3 · 90s preview
   └─ store     Supabase Storage → rows updated → status=done
```

**New code**
- `src/contract/podcast-script.ts` — `PodcastScriptSchema`, mirroring `sheet-content.ts`.
- `src/engine/podcast.ts` — outline + script calls via the existing `LLMClient`.
- `src/engine/tts/` — `TTSProvider` interface + `GeminiTTSProvider`. The interface is the
  only preparation we do for self-hosting; `VibeVoiceProvider` is not built now.
- `src/lib/audio.ts` — ffmpeg wrapper (crossfade, MP3 encode, preview cut).
- `src/worker/` — pg-boss registration and the job handler.

**New dependencies:** `pg-boss`, `@google/genai` (if not already present), and **ffmpeg in
the Dockerfile** — currently absent; add it the same way poppler was added for the PDF path.

**Worker placement:** starts as a second process in the Railway container. If it contends
with the web process for CPU during Phase 1, it moves to its own Railway service. Decide from
observed behaviour, not up front.

**Reuses, unchanged:** `LLMClient`, `scoreItem`/`ScoreCtx` for priority ordering, the
`tk-0..9` topic colour system (10 slots, mapped to `--topic-indigo` … `--topic-gold`), the
`/api/tweak` entitlement pattern, and the `safeParse` → retry contract discipline.

---

## 9. Surface

**`/results` and `/library`:** a "Listen" card below the sheet.

- Row 1: **Crash Course** — duration, status, play. Visually dominant.
- Rows 2…n: one per topic in priority order, each carrying its topic colour, duration, play.
- States per row: `not generated` (with credit cost) · `queued` · `running` (with stage:
  "writing the script" / "recording") · `ready` · `failed` (with retry).
- Player: play/pause, scrub, **chapter list**, 1×/1.25×/1.5× speed, download (Pro).
- Free tier: crash-course row plays 90 s then fades into the unlock card.

**Empty state:** a sheet with no episodes shows the crash-course row with its cost and a
one-line description of what it is — the row *is* the pitch.

**Accessibility:** all controls meet the 44 pt touch floor via the `.tap` utility added in
the HIG pass. Player state changes announce via `aria-live`. Chapter list is keyboard
navigable.

---

## 10. Failure modes

| Failure | Behaviour |
|---|---|
| LLM returns invalid script JSON | Retry once with the offending value quoted (existing pattern). Second failure → job failed, credits refunded. |
| TTS partial failure (chunk 4 of 7) | Retry that chunk twice. Then fail the job — never ship a gapped episode. |
| Script exceeds 30-minute cap | Trim at a chapter boundary during outline, not after TTS. Cheaper and cleaner. |
| Sheet deleted mid-job | Job detects missing sheet, aborts, refunds. |
| Supabase paused / unreachable | Job fails with a user-safe message. **This happens** — the project paused on Sep 11 and took auth down with it. |
| ffmpeg missing in container | Caught by a Phase 1 smoke test, not by a user. |
| User spends last credits, job fails | Refund restores them. Verified by test, not by inspection. |
| Two tabs request the same episode | Unique partial index rejects the second. |

---

## 11. Success metrics

Instrumented from launch, judged at 4 weeks:

| Metric | Target | Why |
|---|---|---|
| Generation success rate | ≥ 95% | Below this the credit model feels like theft. |
| Median generation time, crash course | ≤ 4 min | Longer and users abandon the tab. |
| p50 completion rate | ≥ 60% | Below the 74% podcast benchmark is expected for a study product; below 60% means the format is wrong. |
| Preview → unlock conversion | ≥ 8% | The 90 s preview is the whole funnel. |
| Actual COGS per crash course | ≤ $0.35 | Every cost figure in 10/11 is a third-party estimate. `podcast_costs` is the check. |
| Episodes per generating user | ≥ 2 | One-and-done means it didn't help. |

---

## 12. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Audio restates the sheet instead of teaching it** | **Highest** | This is the §4 decision. Phase 0 must produce a listenable crash course *before* any pipeline is built. |
| Gemini TTS model IDs / pricing have churned | High | Phase 0 verifies live against ai.google.dev. The $6/M figure in doc 10 is **single-sourced** and explicitly flagged there. |
| Two-speaker cap is limiting | Low | Two hosts is the proven NotebookLM dynamic; not a real constraint for v1. |
| Generation cost exceeds estimates | Medium | `podcast_costs` from day one; credit prices are adjustable before Stripe lands. |
| Worker starves the web process | Medium | Separate Railway service if observed. |
| Supabase free tier pauses | Medium | Already bit us. Needs a keep-warm or paid tier regardless of this feature. |
| Students expect a transcript | Low | Script is persisted; surfacing it is a small fast-follow. |

---

## 13. Phases and acceptance

### Phase 0 — prove the format (½ day, ~$0)
Not a build phase. A quality gate.
- Verify live Gemini TTS model IDs and pricing.
- By hand, from the MIS sample pool, generate a 3-chapter crash course and one topic episode.
- Iterate the script prompt until chapter handoffs and retrieval beats land naturally.

**Gate:** Gold listens end to end and agrees it teaches rather than recites. **If it doesn't,
stop** — no amount of pipeline fixes a format that doesn't work. This gate is the single most
valuable half-day in the plan.

### Phase 1 — pipeline (2–3 days)
Tables, RLS, bucket, pg-boss, `podcast.ts`, `TTSProvider`, ffmpeg, CLI harness first
(`gen-podcast --sheet=… --kind=crash`), mirroring `gen-cli`.

**Acceptance:** CLI produces a playable chaptered MP3 from a real sheet; `podcast_costs` has
one row per stage; a deliberately broken TTS key fails the job and refunds credits.

### Phase 2 — surface (2 days)
API routes, playlist card, player, chapters, preview gate, polling UI, credit display.

**Acceptance:** Free user hears exactly 90 s then the unlock card, and the full object is not
reachable without entitlement (verified by direct URL attempt, not by UI inspection). Pro
user generates, polls, plays, downloads. All controls pass the 44 pt floor.

### Phase 3 — hardening
Real costs vs estimates, retry/timeout behaviour, regeneration, concurrency cap.

**Acceptance:** 20 consecutive generations with ≥ 95% success and no credit drift.

---

## 14. Open decisions

| # | Decision | Needed by | Default if unanswered |
|---|---|---|---|
| **D1** | **§4 script input: A, B or C** | **Before Phase 1** | C, falling back to A for old sheets |
| D2 | Both formats in v1, or crash course first? | End of Phase 0 | Crash course first; topic episodes fast-follow (shared pipeline, prompt + UI only) |
| D3 | Exact credit prices | Stripe session | 3 / 1 as specified |
| D4 | Worker in-container or own service | During Phase 1 | In-container until proven otherwise |
| D5 | Transcript surfaced in v1? | Phase 2 | No — persisted, not shown |
