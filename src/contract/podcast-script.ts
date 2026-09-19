/**
 * podcast-script.ts — what a Clutch Audio episode IS (#3).
 *
 * Same discipline as `sheet-content.ts`: `.strict()`, refinements, and messages written to tell
 * the model how to fix itself rather than just that it failed.
 *
 * The line between this file and `podcast-checks.ts` is the important decision here, and it is
 * not the one issue #3 assumed. Issue #3 asked for the structure to be "schema-enforced, not
 * prompt-hoped", listing rhythm and pacing rules among them. Phase 0 measured why that would be
 * wrong: a first draft fails the soft rules almost every time — too long, turns too even, a
 * section over its airtime — and the PATCH loop fixes them in one or two passes (FINDINGS §9:
 * full rewrites fixed one thing and broke another; patches converged). Rejecting a draft for
 * being 12% short would throw away work the loop was about to repair.
 *
 * So:
 *   THIS FILE  — structure a valid episode always has. A script that breaks one of these is not
 *                a Clutch episode at all: wrong shape, no sign-off, a retrieval beat with no
 *                answer, two hosts talking over each other. Hard failure.
 *   CHECKS     — everything quality: length, rhythm, balance, airtime, the running example,
 *                curiosity, must-say cues. Soft failure that drives the patch loop.
 *
 * Shape note: issue #3 proposed `beats: [{speaker, text, kind}]`. Phase 0's proven shape carries
 * a `beat` index per line (which outline beat it serves) — that index is what the airtime and
 * section-opener checks read. Calling the array `beats` while each element has a `beat` would be
 * confusing, so the array stays `lines`.
 */
import { z } from "zod";

/** Wrapper lines: the episode's furniture. Every one of these must appear somewhere. */
export const WRAPPER_KINDS = ["open", "midpoint-recap", "relevance", "recap", "homework", "outro"] as const;
/** Teaching lines: the episode's substance. */
export const TEACHING_KINDS = ["motivation", "example", "analogy", "confusion", "mechanism"] as const;
/**
 * The retrieval beat, in the order it must appear: B is asked, A turns it over in a short line,
 * B attempts it out loud, A answers. Phase 0 round 3 tried question → answer and it played as a
 * rhetorical question; the pickup and the attempt are what make it a real pause for the listener.
 */
export const RETRIEVAL_KINDS = ["retrieval-question", "retrieval-pickup", "retrieval-attempt", "retrieval-answer"] as const;
export const LINE_KINDS = [...WRAPPER_KINDS, ...TEACHING_KINDS, ...RETRIEVAL_KINDS] as const;
export type LineKind = (typeof LINE_KINDS)[number];

/**
 * A hard ceiling, not the pacing rule. The rhythm check wants a median around 16 words and flags
 * anything over 45; both are soft and patchable. This is the length at which a line has stopped
 * being conversation and become a paragraph read aloud — no amount of patching saves it.
 */
const MAX_LINE_CHARS = 400;

export const PodcastLineSchema = z
  .object({
    speaker: z.enum(["A", "B"]),
    /** Index into the outline's beats: which beat this line serves. Airtime is measured by it. */
    beat: z.number().int().min(0),
    kind: z.enum(LINE_KINDS),
    text: z
      .string()
      .min(1)
      .max(MAX_LINE_CHARS, {
        message:
          `a spoken line must be under ${MAX_LINE_CHARS} characters — this one is a paragraph. ` +
          `Split it: give the other host a real reaction or question in the middle.`,
      }),
  })
  .strict();

export type PodcastLine = z.infer<typeof PodcastLineSchema>;

const isWrapper = (k: LineKind) => (WRAPPER_KINDS as readonly string[]).includes(k);

export const PodcastScriptSchema = z
  .object({
    title: z.string().min(1).max(200),
    /** One or two sentences for the episode card. Not spoken. */
    summary: z.string().min(1).max(600),
    lines: z.array(PodcastLineSchema).min(20),
  })
  .strict()
  // ── The hosts alternate, with the two exceptions Phase 0 measured ─────────────────────────
  // Ported verbatim from `scriptIssues`, because the episode Gold approved needs both:
  //   1. a host who has just finished explaining may pose the retrieval question themselves;
  //   2. that question is then followed by the same host's short pickup ("have a go").
  // Anything else is two turns in a row, which is what makes generated dialogue sound like a
  // monologue with interruptions.
  .refine(
    (s) => {
      for (let i = 1; i < s.lines.length; i++) {
        const prev = s.lines[i - 1], cur = s.lines[i];
        if (prev.speaker !== cur.speaker) continue;
        if (prev.kind === "retrieval-question" && cur.kind === "retrieval-pickup") continue;
        if (cur.kind === "retrieval-question" && prev.kind !== "retrieval-question") continue;
        return false;
      }
      return true;
    },
    {
      message:
        "two lines in a row are spoken by the same host. The hosts strictly alternate — put the " +
        "other host's real reaction between them, not a bare 'right'.",
      path: ["lines"],
    },
  )
  // ── The episode signs off ─────────────────────────────────────────────────────────────────
  .refine((s) => s.lines[s.lines.length - 1]?.kind === "outro", {
    message: "the last line must be part of the outro — an episode that stops mid-thought sounds broken.",
    path: ["lines"],
  })
  // ── Every piece of furniture is present ───────────────────────────────────────────────────
  .refine(
    (s) => {
      const kinds = new Set(s.lines.map((l) => l.kind));
      return WRAPPER_KINDS.every((k) => kinds.has(k));
    },
    {
      message:
        `an episode needs a line of every wrapper kind: ${WRAPPER_KINDS.join(", ")}. The homework ` +
        `close is the one that points the listener back at their sheet; it is not optional.`,
      path: ["lines"],
    },
  )
  // ── The homework close comes at the end, with the outro ───────────────────────────────────
  .refine(
    (s) => {
      const hw = s.lines.findIndex((l) => l.kind === "homework");
      const firstOutro = s.lines.findIndex((l) => l.kind === "outro");
      return hw >= 0 && firstOutro >= 0 && hw < firstOutro;
    },
    {
      message: "the homework line must come near the end, just before the outro — it is the close, not an aside.",
      path: ["lines"],
    },
  )
  // ── Retrieval beats are complete and in order ─────────────────────────────────────────────
  .refine(
    (s) => {
      const qs = s.lines.filter((l) => l.kind === "retrieval-question");
      if (qs.length === 0) return false;
      // Each question must be followed, before the next question, by a pickup, an attempt and an
      // answer, in that order.
      const idx = s.lines
        .map((l, i) => ({ l, i }))
        .filter(({ l }) => (RETRIEVAL_KINDS as readonly string[]).includes(l.kind));
      // question → pickup → attempt → answer, and then the answer may RUN ON: the real episode
      // lets the hosts trade two or three turns settling it before moving off. Once an answer has
      // landed, further answer lines are the same beat continuing, not a new one.
      let expect: readonly string[] = [];
      let answered = false;
      for (const { l } of idx) {
        if (l.kind === "retrieval-question") {
          if (expect.length) return false; // the previous beat never reached its answer
          expect = ["retrieval-pickup", "retrieval-attempt", "retrieval-answer"];
          answered = false;
          continue;
        }
        if (expect.length === 0) {
          if (l.kind === "retrieval-answer" && answered) continue; // the answer continuing
          return false;
        }
        if (l.kind !== expect[0]) return false;
        expect = expect.slice(1);
        if (expect.length === 0) answered = true;
      }
      return expect.length === 0;
    },
    {
      message:
        "every retrieval beat must run question → A's short pickup → B's attempt → A's answer, in " +
        "that order, and at least one is required. A question answered immediately is rhetorical; " +
        "the pause is the point.",
      path: ["lines"],
    },
  )
  // ── The hosts have no names on air ────────────────────────────────────────────────────────
  // Round 4 shipped "Okay, B, what do you think?" to audio. A and B are script labels.
  .refine((s) => !s.lines.some((l) => /(^|[\s,])[AB][,.?!]/.test(l.text)), {
    message:
      'no line may address a host as "A" or "B" — those are labels in this file, not names. ' +
      "The hosts never say each other's names.",
    path: ["lines"],
  })
  // ── There is actual teaching in it ────────────────────────────────────────────────────────
  .refine((s) => s.lines.some((l) => !isWrapper(l.kind) && !(RETRIEVAL_KINDS as readonly string[]).includes(l.kind)), {
    message: "the script is all furniture and no teaching: it needs lines that explain the material.",
    path: ["lines"],
  });

export type PodcastScript = z.infer<typeof PodcastScriptSchema>;

export function safeParsePodcastScript(value: unknown) {
  return PodcastScriptSchema.safeParse(value);
}

/** Words as a listener hears them, used by every length and airtime measure. */
export const wordsOf = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;
export const countWords = (lines: PodcastLine[]): number => lines.reduce((n, l) => n + wordsOf(l.text), 0);
