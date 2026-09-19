/**
 * podcast-outline.ts — the plan an episode is written from (#3).
 *
 * The outline is a SEPARATE call from the script, always. Merging them is the documented #1 cause
 * of flat output (PageLM's one-shot approach, doc 10), and Phase 0 kept them apart through four
 * rounds. The outline decides what gets taught, in what order, and for how long; the script only
 * decides how it is said.
 *
 * Four fields here are load-bearing and are not obvious:
 *
 *   `spine`      — ONE example that runs through the whole episode and returns at the end. Phase 0
 *                  found this is most of the difference between a lecture read aloud and something
 *                  that teaches. The keyword is how the checks find it.
 *   `must_say`   — the things that MUST be said out loud, each with a `spoken_cue`: the words any
 *                  spoken version of it contains. "√d_k" is unsayable; "square root of d k" is the
 *                  cue that proves it was said.
 *   `weight`     — each section's share of the lecture, which becomes its share of the airtime.
 *                  Without it the episode spends 17% of its time on a 28% section (round 2).
 *   `analogies`  — one concrete image per section, so every section has something to think with.
 */
import { z } from "zod";
import { TEACHING_KINDS, WRAPPER_KINDS } from "./podcast-script";

/** Beats plan the episode; a "retrieval" beat becomes the question → pickup → attempt → answer run. */
export const BEAT_KINDS = [...WRAPPER_KINDS, ...TEACHING_KINDS, "retrieval"] as const;
export type BeatKind = (typeof BEAT_KINDS)[number];

export const PodcastOutlineSchema = z
  .object({
    title: z.string().min(1).max(200),
    /** Why this matters to someone with an exam in two days. */
    stake: z.string().min(1),
    /** The one sentence the whole episode is an argument for. */
    through_line: z.string().min(1),
    sections: z
      .array(
        z.object({
          name: z.string().min(1),
          pages: z.string(),
          /** Share of the lecture, 0–1. Becomes the share of the airtime. */
          weight: z.number().min(0).max(1),
          summary: z.string().min(1),
        }),
      )
      .min(2),
    analogies: z.array(z.object({ section: z.string().min(1), image: z.string().min(1) })).min(2),
    spine: z.object({
      example: z.string().min(1),
      /** A word the checks can look for. Under three letters matches everything. */
      keyword: z.string().min(3),
    }),
    must_say: z
      .array(
        z.object({
          kind: z.enum(["formula", "limitation", "result", "other"]),
          item: z.string().min(1),
          spoken_cue: z.string().min(3),
        }),
      )
      .min(3),
    beats: z
      .array(
        z.object({
          kind: z.enum(BEAT_KINDS),
          section: z.string().min(1),
          goal: z.string().min(1),
          source_points: z.array(z.string()),
          est_seconds: z.number().min(0),
        }),
      )
      .min(10),
    retrievals: z
      .array(
        z.object({
          section: z.string().min(1),
          question: z.string().min(1),
          answer: z.string().min(1),
          why: z.string().min(1),
        }),
      )
      .min(1),
    homework: z.string().min(1),
    /** From the lecture's own "next time" slide, or "" when it has none. */
    next_time: z.string(),
  })
  .strict();

export type PodcastOutline = z.infer<typeof PodcastOutlineSchema>;

export function safeParsePodcastOutline(value: unknown) {
  return PodcastOutlineSchema.safeParse(value);
}
