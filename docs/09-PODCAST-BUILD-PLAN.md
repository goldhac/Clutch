# Podcast Feature — Build Plan (decided)

**Decided:** Sep 10, 2026 · Owner: Gold Nwobu · Research input: `08-PODCAST-FEATURE-RESEARCH.md`
**Sequencing:** builds AFTER the full redesign (Step 2). Nothing here ships before that.
**Status:** decisions locked; §9 of the research doc is resolved below.

---

## 1. What the feature is — **Clutch Audio**, two formats

The sheet stays the at-the-desk artifact; Clutch Audio is the away-from-desk companion
("learn it on the bus, confirm it on the sheet"). Two episode formats, one pipeline:

### Format A — the Crash Course (FLAGSHIP)

**One 15–30 minute episode per sheet: the audio walkthrough that makes sure you can actually
understand everything ON your sheet.** This is the audio descendant of the original CLUTCH
walkthrough doc ("Walking the Review Line by Line") that the product is named after — the
"if you consume one thing, consume this" artifact, now listenable.

- Walks the sheet in priority order, topic by topic, explaining each from the **full ingested
  notes** (not just the sheet's terse bullets) so the dense sheet items become understandable.
- Length scales with the sheet: ~2–4 min per topic ⇒ 6-topic sheet ≈ 15–20 min, heavy packs
  up to ~30. **Hard cap 30 min** — completion craters past that (median completion is 74% for
  20–40 min episodes but drops to 58% past 45 min;
  [PodRewind analysis](https://podrewind.com/blog/podcast-completion-rate-analysis)).
- **Chaptered internally at topic boundaries** — each topic gets an audible segment handoff
  ("chapter" beat) and a chapter marker in the player (topic-colored, tk-0..9). This is how a
  long episode satisfies Mayer's segmenting principle (learner-paced segments beat one
  continuous unit — [Cambridge chapter](https://www.cambridge.org/core/books/abs/multimedia-learning/segmenting-principle/37240877DDA0362355ADB39936027982),
  [2023 empirical study](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10759450/)): the listener
  can pause/resume/skip at topic seams. Chunking at topic boundaries is ALSO where the TTS
  chunk seams go, so prosody resets land where they're least noticeable — the pedagogy and the
  engineering want the same cut points.
- Note on the video-length research: Guo's 6-minute engagement cliff
  ([6.9M edX sessions](https://www.researchgate.net/publication/262393281_How_video_production_affects_student_engagement_An_empirical_study_of_MOOC_videos))
  is about *active screen-watching*; podcast listening is passive/commute context, where the
  20–40 min band completes at 74%. The crash course lives on the podcast data; the chapter
  structure imports the segmenting benefit anyway.

### Format B — Topic Episodes (drill-down)

**5–8 minutes, one topic each**, priority-ordered playlist (the proven T1/T2/T3 pattern from
the manual Big Data pipeline, BUILD-LOG.md §B.6). For the topic you *still* don't get after
the crash course, or targeted re-listening the night before. Sits under the crash course in
the playlist UI, one row per topic in its topic color.

### Rules shared by both formats

- **Cold open ≤ 60 seconds** — intros over 90 seconds nearly double drop-off
  ([PodRewind](https://podrewind.com/blog/podcast-completion-rate-analysis)). Open with the
  exam stake ("this topic is worth ~20% of your exam"), not pleasantries.
- **Retrieval segments are mandatory.** The naive host is ASKED a likely exam question, a
  genuine pause beat, then the answer + why. Retrieval practice beats re-exposure for
  delayed-test performance, time-controlled
  ([Roediger & Karpicke 2006](https://journals.sagepub.com/doi/10.1111/j.1467-9280.2006.01693.x),
  [overview](https://www.sciencedirect.com/topics/psychology/testing-effect)). Crash course:
  one retrieval moment per topic chapter. Topic episode: retrieval block near the end. This is
  why Clutch Audio is not "audio notes" — it's notes + quiz, which no NotebookLM clone does.
- **Traps woven in** as "here's where people lose points" moments (orange-flag pool items).
- Two hosts (Gemini's multi-speaker cap; also the proven NotebookLM dynamic). One host plays
  slightly naive. Named, consistent Clutch voices (Gemini prebuilt pair, e.g. Kore + Puck).
- English only at launch.

### Script inputs (why this beats NotebookLM clones)

Episode input = **full ingested source text filtered per topic** (we keep it from `ingest.ts`)
**+ the ranked pool items** (formulas, traps, Q&As with answers, scores). The pool tells the
script what to emphasize, quiz on, and warn about — the clones only ever have raw text. The
crash course additionally gets the sheet's own item text, because its job is to make *those
exact lines* understandable. Condense stage is basically pre-done.

---

## 2. Packaging (decided)

- **Pro feature, metered by episode credits.** `profiles.credits` (server-owned, Supabase)
  is the ledger; decrement server-side on generation, 401/403 gate exactly like `/api/tweak`.
- **Free tier:** player is visible with the crash course's first ~90 seconds (the strongest
  ad for itself); fades out mid-sentence into the "Unlock with Pro" card — same surface
  pattern as the blurred back page.
- Credit pricing: **crash course = 3 credits, topic episode = 1 credit** (roughly tracks COGS).
- Whale control: a full sheet's episode set (crash course + 4–8 topics) costs credits per item;
  regenerations cost credits too.
- Stripe (when it lands) is the only writer of tier/credits, unchanged.

### Unit economics at the decided formats

Audio billing: 25 tok/s × $6/M (3.5 Flash TTS — re-verify on ai.google.dev, single-source
number flagged in 08 §4).

| Format | Audio | TTS | Script LLM | **All-in** | Credits |
|---|---|---|---|---|---|
| Crash course 20 min | 30k tok | $0.18 | ~$0.05–0.08 | **~$0.25** | 3 |
| Crash course 30 min (cap) | 45k tok | $0.27 | ~$0.08 | **~$0.35** | 3 |
| Topic episode 6 min | 9k tok | $0.054 | ~$0.02–0.03 | **~$0.08–0.10** | 1 |

Full bundle (crash course + 6 topic episodes) ≈ **$0.75–0.95 per sheet** ≈ 9 credits.
Pro $4.99 with ~15 credits/mo ≈ **$1.30–1.60 max COGS ⇒ ~70% gross margin** at full
utilization; typical users generate one bundle ⇒ ~80%+.

---

## 3. Architecture (v1, scalable)

Stack correction vs the research doc: Clutch is **Next.js 15 on Railway + Supabase Postgres**,
not FastAPI. Ingestion + condensing already exist (sheet engine). Build ≈ 1 week, not 2.

1. **Job queue:** `pg-boss` on Supabase Postgres (episodes can't fit a request cycle).
   Worker runs in the Railway service (separate process in the container, or second service
   if it fights the web process for CPU). Client polls job status.
2. **`src/engine/podcast.ts`:**
   - Outline call: topic source text + pool items → beats JSON (hook, 3–5 beats, trap moment,
     retrieval question, closer). Separate call, never skipped — one-shot scripts sound flat
     (08 §1).
   - Script call: beats → `[{speaker, text}]` as a **Zod contract** (`PodcastScriptSchema`)
     with the same validate → quote-offending-value → retry-once pattern as `SheetContent`.
     Baseline prompts: podcastfy + Together AI's open-notebooklm; ours adds the retrieval-segment
     and trap requirements.
   - LLM: Haiku 4.5 or Gemini Flash via existing `LLMClient`.
3. **TTS:** behind a `TTSProvider` interface (like `LLMClient`) — `GeminiTTSProvider` v1,
   `VibeVoiceProvider` later. Single-pass multi-speaker per beat-chunk (NEVER per-line concat —
   voice drift, 08 §1), PCM → WAV → crossfade at beat boundaries (prosody-reset points) →
   MP3 via ffmpeg (add to Dockerfile, poppler pattern).
4. **Storage/delivery:** Supabase Storage bucket `podcasts/`, owner RLS, signed URLs.
   Revisit R2 only if egress bills appear.
5. **Tables:** `podcasts` (owner RLS ×4 like `sheets`; sheet_id FK, topic, status, duration,
   storage path) + `podcast_costs` telemetry (per-stage tokens + $ per episode, from day 1 —
   validates every 08 §7 number with real data).
6. **Surface:** "Listen" playlist card on /results + /library — topic-colored rows reusing
   the tk-0..9 topic color system, priority-ordered, per-episode play + download (Pro).

### Self-host trigger (unchanged from research)

Revisit VibeVoice-1.5B when sustained volume passes ~1–2k episodes/month. The `TTSProvider`
interface is the only prep we do now.

---

## 4. Build phases (all post-redesign)

- **Phase 0 — verify + prototype (½ day, $0):** confirm live Gemini TTS model IDs + $6/M price
  on ai.google.dev; AI Studio free tier; generate a short crash course (2–3 topic chapters)
  from the MIS sample pool plus one standalone topic episode, and iterate the script prompt
  until the chapter handoffs and retrieval segments land naturally.
- **Phase 1 — pipeline (2–3 days):** pg-boss + `podcast.ts` + TTS provider + ffmpeg + storage
  + tables. CLI harness first (`gen-podcast --topic=N`, like gen-cli).
- **Phase 2 — surface (2 days):** playlist card, player, 90s free preview gate, credit
  decrement, job-status polling UI.
- **Phase 3 — hardening:** cost telemetry review vs assumptions, retry/timeout behavior,
  regen flow.

### Open at build time (not blockers)

- Exact credit prices per tier (needs Stripe pricing session anyway).
- Whether the worker shares the Railway container or gets its own service (decide from CPU
  behavior during Phase 1).
- Whether both formats ship in v1 or crash course first, topic episodes fast-follow — decide
  from how much extra prompt work the topic format needs after the crash-course prompt is
  dialed (they share the pipeline; it's prompt + UI work only).
