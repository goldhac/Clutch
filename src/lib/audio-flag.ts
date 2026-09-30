/**
 * audio-flag — the one switch that says whether Clutch is selling audio yet.
 *
 * Audio is built, deployed and verified end to end (docs/14-AUDIO-SHELVED.md), and shelved for one
 * reason: an episode costs $0.3369 against a $0.15 target, which is negative margin at Pro's price.
 * The code is not the problem, so it is not deleted — it is switched off in one place and comes
 * back with one environment variable.
 *
 * Off means off at every door, not just the visible one: the nav tab, the page, AND both API
 * routes. A hidden tab in front of a live endpoint is not a shelved feature, it is an undocumented
 * one — and /api/audio/generate is where credits are spent.
 *
 * NEXT_PUBLIC_ because the nav and the page are client components. It is a feature flag, not a
 * secret; nothing about knowing it is off helps anyone.
 */
export const AUDIO_ON = process.env.NEXT_PUBLIC_CLUTCH_AUDIO === "on";

/** What the routes say when it is off. 503, because this is "not yet", not "never". */
export const AUDIO_OFF_RESPONSE = {
  error: "Audio is not available yet.",
  detail:
    "Clutch Audio is built but not switched on. Nothing was queued and nothing was charged.",
} as const;
