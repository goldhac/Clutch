# Clutch Audio — shelved 2026-09-29, parked behind a flag 2026-09-30

**Decision: stop work on audio and ship the sheet.** Not because it doesn't work — it does, end to
end, in production — but because it costs **$0.3369 per episode against a $0.15 target**, the fix
for that is an open question, and the sheet is cheap and nearly shippable. Audio is a front door
that can wait until there is a product behind it.

This file exists so picking it back up costs an hour, not a week.

---

## 1. What is built and working

All of it is deployed and was verified in production, not just locally.

| Piece | State |
|---|---|
| Topic split (`src/engine/topic-split.ts`) | Done. 11 checks. One file = one topic, consecutive same-subject merged, thin topics merged. |
| Per-topic source slicing (`src/engine/pack-slice.ts`) | Done. 11 checks. Each episode gets only its topic's files. |
| `POST /api/audio/analyze` | Done. Free, shares the ingest cache with sheets, 10 packs/day cap. |
| `/audio` page | Done. Two steps: build the pack, then edit the split and buy only what's ticked. |
| `POST /api/audio/generate` | Done. Pro-gated, saves the edited split before queueing, max 12/request. |
| Queue (`podcasts` table + `claim_next_episode`) | Done. `FOR UPDATE SKIP LOCKED`, 2 concurrent per student, stale recovery. |
| Worker (Railway service `worker`) | Done. **Ran 4+ days, 71,934 polls, zero errors.** |
| Health endpoint | Done. `/healthz` on the worker's PORT — distinguishes "alive" from "working". |
| Grounding gate (#21) | Done. An empty pack is refused before the first paid call; credit returned. |
| Full pipeline | **Verified end to end:** 6m05s episode, $0.3369, 12.9 min. |

Audio kept for reference in `listen/`:
- `live-test-2026-09-29-6min.mp3` — correct density, after the length fix
- `live-test-BEFORE-24min-default.mp3` — same source padded to 19m31s, before the fix

---

## 2. Why it was shelved — the cost

Measured on a real production episode, billed from `podcast_costs`:

```
outline   $0.0363
script    $0.1730    ← 51% of the episode
claims    $0.0009
voicing   $0.1266
TOTAL     $0.3369    (target: $0.15)
```

The estimates in `11-PODCAST-BUILD-PLAN.md` were ~8× low on the script stage and had assumed audio
was the dominant cost. It isn't — Gemini Pro bills output at $10/1M and a script is mostly output.
That table is now corrected and carries the measured figures.

**What this does to pricing:** Pro at $4.99 with 15 credits is ~$5.05 of COGS at full utilisation.
Negative margin. This has to be resolved before Stripe, not after.

---

## 3. The open question, and how to answer it

**Can the script stage run on Flash instead of Pro?** Unresolved. One usable sample:

| | cost | words | drafts | rules failing | unsupported |
|---|---|---|---|---|---|
| Pro run 1 | $0.2277 | 1159 | 7 | 0 | 0/2 |
| Pro run 2 | $0.2902 | 1381 | 8 | **2** | 0/2 |
| Flash run 1 | $0.0919 | 1076 | 8 | **1** | 0/2 |
| Flash run 2 | — | | | | network error, not quality |

Flash is **65% cheaper** — the episode would land at **~$0.17**, inside target. But its one completed
run failed a structural rule, so it did not pass. A four-run follow-up died at the first call when
the spend cap was hit.

**To resume, with the spend cap raised:**

```bash
npx tsx scripts/test-script-model.ts --spend 4 flash    # ~$0.37, ~45 min
```

**Two things that matter more than the model choice:**

1. **Pro fails too** — 1 of 2 runs ended with rules still outstanding. The gate may be too strict,
   or neither model converges. Comparing models assumes the incumbent is clean; it isn't.
2. **7.5–8 revision drafts per script** is the real cost driver, and Flash showed no convergence
   advantage. Capping or tightening the revision loop may save more than swapping models, and would
   help both. **This is the experiment I'd run first.**

---

## 4. Known gaps, with issues

| Issue | What |
|---|---|
| [#22](https://github.com/goldhac/Clutch/issues/22) | **No way to cancel an episode.** Schema allows `cancelled`; nothing honours it. Scarce credit vs a 35-minute run — the control students will want most. |
| [#7](https://github.com/goldhac/Clutch/issues/7) | Phase 3 — series player, chapters, 90 s preview gate. Not started. |
| [#8](https://github.com/goldhac/Clutch/issues/8) | Phase 4 — hardening, 20 consecutive generations, COGS validation. Not started. |
| [#9](https://github.com/goldhac/Clutch/issues/9) | Tracking issue — carries this shelf state. |

Design work is ready and waiting in **`13-CLUTCH-AUDIO-UX-PLAN.md`** — it identifies the waiting
experience (12.9–35.4 min per episode) as the real design problem, and leaves six decisions open.

---

## 5. What is off, and how to turn it back on

**Parked properly on 2026-09-30.** Before that the shelf was a decision rather than a state: the
worker was down, but `/audio` and both API routes were still deployed, still live, and the nav
carried a **Listen** tab to them on every signed-in page. A Pro student could have queued an
episode that nothing was going to record. Only one account is Pro, so nothing was lost — but the
exposure was real and would have grown the moment anyone else was upgraded.

One flag now closes every door:

| | off (today) | on |
|---|---|---|
| Nav **Listen** tab | absent | present |
| `/audio` | "Listening comes later" + a link to `/generate` | the builder |
| `POST /api/audio/analyze` | **503**, nothing read | works |
| `POST /api/audio/generate` | **503**, nothing queued, nothing charged | works |
| Railway `worker` service | no deployment | polling |

The guard lives in `src/lib/audio-flag.ts` and is read in four places. It is deliberately checked in
the **routes** as well as the UI: a hidden tab in front of a live endpoint is not a shelved feature,
it is an undocumented one — and `/api/audio/generate` is where credits are spent.

Nothing was deleted. The engine, the queue, the worker, the topic split, the pack slicing and the
`/audio` builder are all still in the tree and still pass their checks.

### To turn it back on

```bash
# 1. the app
railway variables --service cramsheet --set NEXT_PUBLIC_CLUTCH_AUDIO=on
cd ~/Code/Clutch && railway up --detach --service cramsheet     # NEXT_PUBLIC_ is baked at build

# 2. the worker
railway up --detach --service worker
railway logs --service worker                                          # expect "polling for episodes"
railway ssh --service worker "wget -qO- http://127.0.0.1:8080/healthz" # polls climb, lastError null
```

Locally, `NEXT_PUBLIC_CLUTCH_AUDIO=on` in `.env.local`.

**Do not turn it on before the cost question in §3 is answered.** At $0.3369 an episode against
Pro's $4.99/15 credits, every episode sold loses money. The first experiment to run is the revision
loop, not the model swap.

## 6. Non-obvious things learned, worth not relearning

- **`railway.json` `startCommand` overrides the Dockerfile `CMD`.** Both services share one config;
  `CLUTCH_ROLE` picks web vs worker in `scripts/railway-start.mjs`.
- **`SUPABASE_SERVICE_ROLE_KEY` is set on the `worker` service only.** Rotating it (#19) without
  updating Railway stops episodes being claimed *silently* — the site stays up, the queue never
  drains.
- **`railway logs --build` returns the last SUCCESSFUL build**, never the failing one.
- **A spend cap arrives wrapped in the same `Error fetching from …` text as a real network drop**,
  and contains `429`. Walls must be matched before transport errors or every wall burns four
  retries and 90 s of backoff.
- **The engine defaults to 24-minute episodes.** `outlineEpisode`/`writeScript` take `opts.minutes`
  and default it to 24; for months nothing passed it, so every episode was written to 24 minutes
  regardless of topic. Fixed — but if a new call site is added, it must pass `minutes`.
- **The test fixture said `"lecture text"` — 12 characters** — and every check happily recorded an
  episode from it. A fixture that can't happen in production tests nothing about production.
