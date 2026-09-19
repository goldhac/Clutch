# Podcast Generation Feature — Research Handoff

**Owner:** Gold Nwobu · **Research date:** Aug 8, 2026 (repo/model stats pulled live via GitHub + HuggingFace APIs; pricing verified against Aug 2026 sources)
**Purpose:** Replicate NotebookLM's Audio Overview (documents → two-host AI podcast) as a feature of one of Gold's products. Target product is an **open decision** (CramSheet is the suggested fit — study materials → revision podcast — but unconfirmed).
**Status:** Research complete. No build decisions made yet. This doc is the decision input for Claude Code.

---

## 1. Reference architecture — how NotebookLM's Audio Overview works

The pipeline is simple; the quality lives almost entirely in (a) the script prompt and (b) the TTS model. Everything else is plumbing.

1. **Ingest → normalize.** PDF / URL / YouTube → plain text. Nothing clever. (pypdf, trafilatura, youtube-transcript-api.)
2. **Condense.** NotebookLM itself is RAG-grounded against uploaded sources, but a podcast doesn't need retrieval — it needs *compression*. Map-reduce the sources into one dense brief if they exceed what fits comfortably in the script prompt.
3. **Outline (do not skip).** A separate LLM call producing show structure: hook, 3–5 beats, a "wait, why does that matter" turn, closer. Good output feels *directed* — one host sets up an idea, the other asks the obvious question, first answers, second reframes. One-shot script generation from raw text is the #1 reason clones sound flat.
4. **Script.** Outline → dialogue JSON: `[{"speaker": "A", "text": "..."}, ...]`. Prompt hard for disfluencies, interruptions, "yeah — no, exactly", and one host playing slightly naive (asks the questions the listener would).
5. **TTS.** The whole ballgame. See §4–§6.

**Critical quality insight:** do **not** TTS each line separately and concatenate. Per-line generation + stitching is what makes every clone sound like two robots taking turns — separate generations produce audible voice drift and dead turn-taking prosody. Use **single-pass multi-speaker** TTS so the model handles turn-taking itself. Test a multi-line sequence early; drift is immediately audible.

---

## 2. Prior art — GitHub (star counts pulled via GitHub API, Aug 8 2026)

### Podcast-generation-specific repos

| Repo | Stars | Last push | Notes |
|---|---|---|---|
| [souzatharsis/podcastfy](https://github.com/souzatharsis/podcastfy) | 6.5k | 2026-05-04 (~3 mo stale) | Traction leader. Multimodal sources, shorts or 30+ min longform, 100+ LLMs, OpenAI/Google/ElevenLabs/Edge TTS backends. Best-documented prompts/architecture. Does NOT have Gemini 3.1 multi-speaker TTS wired up. |
| [NVIDIA-AI-Blueprints/pdf-to-podcast](https://github.com/NVIDIA-AI-Blueprints/pdf-to-podcast) | 868 | 2026-06-26 (active) | Architecturally the most serious: proper microservice split — ingestion / script agent / TTS. Read this for production pipeline shape. |
| knowsuchagency/pdf-to-podcast | 843 | dead since 2025-03 | Skip. |
| [gabrielchua/open-notebooklm](https://github.com/gabrielchua/open-notebooklm) | — | — | The minimal, readable reference implementation. Together AI published a walkthrough including the actual system prompt. |

### Full NotebookLM clones (podcast bundled as one feature)

| Repo | Stars | Last push | Notes |
|---|---|---|---|
| [MODSetter/SurfSense](https://github.com/MODSetter/SurfSense) | 15.8k | Aug 8 2026 (pushed same day as research) | Overall traction winner. Full research platform with live web research; podcast is a small slice you'd have to dig out. |
| [run-llama/notebookllama](https://github.com/run-llama/notebookllama) | 2.0k | active | LlamaIndex-official open-source NotebookLM alternative, LlamaCloud-backed. |
| CaviraOSS/PageLM | 1.7k | active | Smaller but maintained. |

**Recommended theft strategy:** clone podcastfy for the script prompts (baseline), read the NVIDIA blueprint for pipeline shape, write our own TTS layer against current Gemini multi-speaker API — none of these repos have the current multi-speaker API wired up, which is exactly where the quality gap vs NotebookLM sits. Add the outline stage (most repos skip it). That combination ≈ 90% of NotebookLM quality.

---

## 3. Self-host TTS options — HuggingFace (likes/downloads pulled via HF API, Aug 8 2026)

Top of the TTS leaderboard at pull time (likes / downloads):

```
 6,654★  11.66M dl  hexgrad/Kokoro-82M            (Apache-2.0)
 3,716★   8.68M dl  coqui/XTTS-v2
 2,904★   20.7k dl  nari-labs/Dia-1.6B            (Apache-2.0)
 2,452★   78.6k dl  microsoft/VibeVoice-1.5B      (MIT)
 2,422★  195.6k dl  sesame/csm-1b
 1,866★   2.15M dl  Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice
 1,727★   2.32M dl  ResembleAI/chatterbox
 1,266★  618.6k dl  microsoft/VibeVoice-Realtime-0.5B (MIT)
 1,242★  791.7k dl  k2-fsa/OmniVoice
 1,206★  392.7k dl  fishaudio/s2-pro
 1,190★  752.4k dl  SWivid/F5-TTS
   702★  337.6k dl  bosonai/higgs-tts-3-4b        (license: other — check before commercial use)
```

### The pick: `microsoft/VibeVoice-1.5B` (MIT)

Only open model literally built for this use case:

- Long-form multi-speaker conversational audio (podcasts): up to **90 minutes** in a single pass with up to **4 distinct speakers**, consistent voice identity throughout — no per-sentence handoff.
- Architecture: continuous speech tokenizers (acoustic + semantic) at ultra-low 7.5 Hz frame rate; next-token diffusion framework (LLM for dialogue flow + diffusion head for acoustics).
- **1.5B runs on ~7–8GB VRAM** (modern consumer GPU), ships with a Gradio interface. 7B variant ≈ 18GB VRAM, higher quality, ~45-min cap per one report. 0.5B Realtime variant exists for streaming.
- Script format: `Speaker 1: text`, line-separated.
- Output: 24 kHz mono Float32 PCM.

**Honest caveats:**
- **English + Chinese only.** Other languages: tokenizer accepts them but output is unintelligible.
- Real-world reports: voices lack dynamics; **spontaneous background music, chimes, and odd noises** can appear in output. Quality is below Gemini TTS. Free, and we own the weights.

### Runners-up

- **nari-labs/Dia-1.6B** (Apache-2.0) — dialogue-native, `[S1]`/`[S2]` tags, nonverbals (laughter etc.). Better at short punchy exchanges, worse long-form consistency. Only ~21k downloads → thin community support.
- **hexgrad/Kokoro-82M** (Apache-2.0) — most-used TTS on HF by far, tiny, **runs on CPU**. But single-speaker → back to line-by-line concat with flat turn-taking. Only if we need zero-cost CPU inference.
- **ResembleAI/chatterbox** (2.3M dl) and **bosonai/higgs-tts-3-4b** — strong general TTS; Higgs is `license: other`, verify terms before anything commercial.

---

## 4. Managed TTS — Google Gemini (recommended for v1)

Gemini TTS is purpose-built for exact-text recitation with fine-grained style control (podcast/audiobook use case) and supports **native single-pass multi-speaker dialogue**.

### Current lineup + pricing (Aug 2026 — verify before build, this moved twice during 2026)

| Model tier | Input (text) | Output (audio) | ≈ cost per audio-minute |
|---|---|---|---|
| Gemini **3.1 Flash TTS Preview** (used in Phase 0) | $1 / 1M text | **$20 / 1M audio** (verified 2026-09-18) | measured: 22.5-min episode = 42,880 tok = **$0.86** |
| Gemini **3.1 Flash TTS** | $1 / 1M | **$20 / 1M tokens** | ~$0.03 (60-sec clip ≈ $0.03) |
| Legacy Flash TTS (2.5 gen) | $0.50 / 1M | $10 / 1M | ~$0.015 |
| Pro TTS | $1 / 1M | $20 / 1M | ~$0.03 |

- **Billing unit: audio output = 25 tokens per second of generated audio** (1M tokens ≈ 11.1 hours). Input text is a rounding error; output is where all the money lives (20x skew).
- 3.1 Flash TTS: 70+ languages, 200+ inline audio tags for vocal style/pace/delivery.
- **Constraint: `multi_speaker_voice_config` caps at 2 distinct speakers.** Fine for a NotebookLM clone (2 hosts); blocking for 3+ hosts (VibeVoice does 4).
- Output is raw PCM → wrap in WAV header. Long scripts blow the token limit → **chunk at outline-beat boundaries** (where a prosody reset is least noticeable) and crossfade with pydub.
- **AI Studio free tier covers TTS for dev/testing → prototyping cost ≈ $0.**

### Working code sample (from research session — model ID needs verification)

```python
from google import genai
from google.genai import types

client = genai.Client()
resp = client.models.generate_content(
    model="gemini-2.5-flash-preview-tts",  # LEGACY ID — verify current (3.1/3.5 flash tts) before build
    contents=f"TTS the following podcast conversation, casual and warm:\n{script}",
    config=types.GenerateContentConfig(
        response_modalities=["AUDIO"],
        speech_config=types.SpeechConfig(
            multi_speaker_voice_config=types.MultiSpeakerVoiceConfig(
                speaker_voice_configs=[
                    types.SpeakerVoiceConfig(speaker="Alex",
                        voice_config=types.VoiceConfig(
                            prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Kore"))),
                    types.SpeakerVoiceConfig(speaker="Sam",
                        voice_config=types.VoiceConfig(
                            prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Puck"))),
                ]))))
```

### Caveats flagged during research

1. ~~3.5 Flash TTS at $6/M came from **one** pricing tracker~~ — **VERIFIED 2026-09-18 on ai.google.dev/gemini-api/docs/pricing. The $6/M figure is wrong and is retired.** Live prices, per 1M tokens: **Gemini 3.1 Flash TTS Preview $1 text in / $20 audio out** (the model Phase 0 actually used) · Gemini 2.5 Flash Preview TTS $0.50 / $10 · Gemini 2.5 Pro Preview TTS $1 / $20. `episode.ts` was already billing at $20/M, so the measured Phase 0 costs stand; only doc 10's table was stale.
2. These are preview-tier models — IDs, quotas, availability churn. Re-verify model strings at build time.

---

## 5. Premium managed TTS — ElevenLabs (comparison lane)

- TTS billed per character: **Multilingual v2/v3 = $0.10 / 1k chars**, **Flash/Turbo = $0.05 / 1k chars**. Same per-unit rate on all plans (plans bundle usage, don't discount rate). ≈ $0.27/min Multilingual via API per one source.
- **May 7, 2026: self-serve API TTS prices cut up to 55% + new pay-as-you-go credits (no subscription).**
- Plans: Free (10k credits ≈ 10 min, no commercial license) · Starter $5–6 · Creator $22 (≈121k credits ≈ ~17 two-host episodes/mo per Jellypod's median-script math) · Pro $99 (≈600k) · Scale $299 · Business $990.
- A 15-min episode ≈ 13.5k chars → **$0.68 (Flash) / $1.35 (Multilingual)**. Still ~3–8x Gemini per minute.
- When it's worth it: voice cloning / custom branded hosts / max realism.

---

## 6. Script-generation LLM options (verified Aug 2026)

| Model | Input / Output per 1M tok | Per-episode script chain (~25k in / 5k out) |
|---|---|---|
| Gemini 2.5 Flash | $0.30 / $2.50 | ~$0.02 |
| Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) | $1 / $5 | ~$0.05 |
| Claude Sonnet 5 (promo thru Aug 31, 2026) | $2 / $10 | ~$0.10 |
| Claude Sonnet 4.6 | $3 / $15 | ~$0.15 |
| Claude Opus 5 / 4.8 | $5 / $25 | ~$0.25 |
| Claude Fable 5 | $10 / $50 | ~$0.50 — **don't use in pipeline** |

Anthropic: Batch API = −50% on everything; cache hits ≈ 10% of input price. (Cross-check docs.claude.com pricing page at build time.)
**Recommendation: Haiku 4.5 or Gemini Flash for the outline + script calls.** Sonnet only for a "quality" tier if A/B shows script quality is the bottleneck (research finding: it usually isn't — the TTS pass and the outline *stage existing at all* matter more).

---

## 7. Cost model

### Assumptions (per episode)

- 15-min, two-host episode
- Audio out: 900 s × 25 tok/s = **22,500 audio tokens**
- Script: ~2,250 words ≈ **13.5k chars** ≈ ~3k output tokens
- LLM chain (condense + outline + script): ≈ 25k in / 5k out total
- Storage/delivery: 15-min MP3 @128kbps ≈ 14 MB; Cloudflare R2 $0.015/GB-mo + zero egress → **fractions of a cent, ignore**
- Ingestion/parsing: self-hosted libs, free

### Per-episode cost by path

| Path | Script LLM | TTS | **All-in / episode** |
|---|---|---|---|
| **Budget managed** (launch this) | Gemini Flash or Haiku 4.5 (~$0.02–0.05) | Gemini 3.5 Flash TTS ($0.135) | **~$0.20** |
| Quality managed | Sonnet (~$0.15) | Gemini 3.1 Flash TTS ($0.45) | **~$0.60** |
| Self-host | Haiku (~$0.05) | VibeVoice-1.5B on serverless L4 (~$0.06–0.12) | **~$0.12–0.17** |
| Premium | Sonnet | ElevenLabs ($0.68–1.35) | **~$0.85–1.50** |

TTS sub-math (superseded — see the verified price above): at $20/M a REAL 22.5-minute episode measured 42,880 tokens = **$0.86**, not the 22,500 tokens assumed here.

### Self-host GPU rates (RunPod, verified Jul 2026 pages)

- Dedicated **L4 24GB pod: $0.39/hr** → ≈ **$285/mo** running 24/7
- Serverless L4-class: **$0.69/hr-equivalent**, billed per active second, scales to zero (cold starts apply)
- Storage: $0.05–0.07/GB/mo · Community/spot tiers roughly half on-demand rates
- Assumed VibeVoice generation ≈ 5–10 GPU-min per 15-min episode (near-realtime class on mid GPU — **benchmark this, it's an assumption**)

### Monthly scale scenarios

| Volume | Budget managed | Self-host | Call |
|---|---|---|---|
| 100 eps/mo | ~$25 | ~$13 (serverless) | Managed. Ops time isn't worth $12. |
| 1,000 eps/mo | ~$200–250 | ~$150 serverless, or $285 flat L4 + ~$50 LLM | Crossover zone. Serverless self-host wins on paper but adds cold starts + babysitting. |
| 10,000 eps/mo | ~$2–2.5k | ~$800–1.2k (2× dedicated L4 ≈ $570 + LLM $200–500) | Self-host clearly wins. |

**Plan-around number: ~$0.20–0.25 COGS per episode** on budget-managed. Revisit self-hosting only past **~1–2k episodes/month**.

### Pricing/margin implication

At $0.25/ep: a $5/mo tier including 10 episodes = $2.50 COGS = **50% gross margin**. Use credits/metering to cap whales. Episode length drives COGS linearly — a 5-min "quick brief" format is ~$0.07/ep.

### Build cost (one-time)

- Dev = Gold's time: **~1–2 week Claude Code build** on the existing FastAPI + Postgres stack (worker queue + 3 LLM calls + 1 TTS call + WAV mux + upload + player).
- Prototyping API spend ≈ **$0** (Gemini AI Studio free tier).
- Misc infra: ~$5–20/mo (queue/storage already covered by existing stack + R2).

---

## 8. Recommended v1 stack

1. **Queue/worker:** pg-boss or Celery on existing Postgres; async job with webhook/poll for completion.
2. **Ingest:** pypdf / trafilatura / youtube-transcript-api → normalized text.
3. **Condense:** map-reduce per source → single dense brief (Haiku 4.5 or Gemini Flash).
4. **Outline:** separate call → beats JSON (hook, 3–5 beats, reframe turn, closer). *Non-negotiable stage.*
5. **Script:** outline → `[{speaker, text}]`; prompt for disfluencies, interruptions, naive-host dynamic. Baseline prompt: lift from podcastfy, compare against Together AI's published open-notebooklm system prompt.
6. **TTS:** Gemini Flash TTS multi-speaker, chunked per beat → PCM → WAV → concat/crossfade (pydub) → MP3 (ffmpeg).
7. **Deliver:** upload to R2/S3, signed URL, in-app player.
8. **Telemetry from day 1:** per-stage token + cost logging per episode (validates every number in §7).

Prototype sequence: nail the script prompt on Gemini free tier → ship managed path → swap TTS layer for VibeVoice only when volume justifies (§7).

---

## 9. Open decisions (make with this doc)

1. **Which product gets the feature.** CramSheet suggested (study docs → revision podcast); unconfirmed.
2. **Episode length target** — drives COGS linearly (15 min ≈ $0.20–0.25; 5 min ≈ $0.07).
3. **Two hosts enough?** Gemini caps multi-speaker at 2; VibeVoice does 4.
4. **Voice identity needs** — prebuilt voices (Gemini) vs cloning/branded hosts (ElevenLabs or VibeVoice).
5. **Language support** — VibeVoice is EN/ZH only; Gemini 3.1 Flash TTS claims 70+ languages.
6. **Managed → self-host trigger** — proposed: revisit at 1–2k eps/mo sustained.
7. **Packaging** — credits per tier, episode caps, which tier gates the feature.
8. **Verify before build:** current Gemini TTS model IDs; 3.5 Flash TTS $6/M price (single-source) on ai.google.dev; Anthropic prices on docs.claude.com; VibeVoice real gen-speed benchmark on L4.

---

## 10. Sources

- GitHub API repo search (stars/pushed_at), pulled Aug 8 2026 · HuggingFace API model list (likes/downloads/licenses), pulled Aug 8 2026
- Gemini TTS pricing + 25 tok/s rate: the-rogue-marketing.github.io (Jun 2026) · developer.puter.com/tutorials/gemini-api-pricing (Jul 2026) · metacto.com Gemini guide (Jun 2026) · nemovideo.com/blog/gemini-3-1-flash-tts-pricing · felloai.com/gemini-pricing
- VibeVoice specs: huggingface.co/microsoft/VibeVoice-1.5B · microsoft.github.io/VibeVoice · soniqo.audio/guides/vibevoice · digitalspaceport.com setup review (quality quirks)
- Anthropic pricing: benchlm.ai/anthropic/api-pricing (Aug 6 2026) · finout.io · metacto.com · pecollective.com — cross-check docs.claude.com
- ElevenLabs: developer.puter.com/tutorials/elevenlabs-api-pricing · jellypod.com/blog/elevenlabs-pricing (May 2026 price cut) · diyai.io · unifically.com
- RunPod GPU rates: usagepricing.com RunPod calculator (verified 2026-07-22) · layer3labs.io · runpod.io/pricing
- NotebookLM RAG grounding + open-notebooklm walkthrough: Together AI blog · gabrielchua/open-notebooklm