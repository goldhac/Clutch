/**
 * podcast.ts — an episode, from a lecture to a validated script (#3).
 *
 * Ported from `scripts/phase0/episode.ts`, which took four rounds to get right. The shape of the
 * thing is the lesson, so it is worth stating plainly:
 *
 *   outline  →  script  →  checks  →  patch (or rewrite)  →  claims  →  script
 *
 * Four decisions in there are load-bearing, and each one replaced something that failed:
 *
 *  1. **The outline is its own call.** One-shot "write me an episode" produces recitation. The
 *     outline decides coverage, order and airtime before a word of dialogue exists.
 *  2. **Patches, not rewrites.** Round 3 re-rolled the whole script on every failure and each
 *     rewrite fixed one check while breaking another. Line-level edits converge. Full rewrites
 *     are kept for the few failures that are genuinely about the whole episode (LENGTH, INTRO,
 *     SPINE, AIRTIME, WRAPPER, BALANCE) and capped at two.
 *  3. **The checks are strings the model reads.** They name the rule, quote the offending lines
 *     and say what to do. That is why they live in `podcast-checks.ts` as prose, not booleans.
 *  4. **The claims check runs last, on the finished script.** Support has to be QUOTED from the
 *     lecture and found there by code (#17). The old "is this supported?" ask passed 54 of 54
 *     claims while four of them inverted cause and effect.
 */
import type { z } from "zod";
import { safeParsePodcastOutline, type PodcastOutline } from "@/contract/podcast-outline";
import {
  PodcastDraftSchema,
  PodcastScriptSchema,
  countWords,
  structuralIssues,
  type PodcastLine,
  type PodcastScript,
} from "@/contract/podcast-script";
import { checkClaims } from "./claims-check";
import { defaultGeminiClient, GEMINI_PRO } from "./gemini-client";
import type { LLMClient } from "./llm-client";
import { scriptIssues } from "./podcast-checks";
import { OUTLINE_SYSTEM, PATCH_SYSTEM, PatchSchema, SCRIPT_SYSTEM, selectClaimLines } from "./podcast-prompts";

/** Measured in Phase 0, pauses included. Used to turn minutes into a word budget. */
export const WORDS_PER_MINUTE = 160;
/** Failures about the whole episode rather than a few lines. Only these justify a full rewrite. */
const GLOBAL_ISSUE = /^(LENGTH|INTRO|SPINE|AIRTIME|WRAPPER|BALANCE)\b/;
const MAX_REVISIONS = 8;
const MAX_FULL_REWRITES = 2;
const MAX_CLAIMS_ROUNDS = 2;

export interface Usage { inputTokens?: number; outputTokens?: number }
export interface PodcastEngineOptions {
  client?: LLMClient;
  model?: string;
  minutes?: number;
  /** Called after every model call, so the caller can bill `podcast_costs` per stage. */
  onUsage?: (stage: string, usage: Usage) => void;
  /** Progress for the worker's `stage` column and the CLI. */
  onProgress?: (stage: string, detail: string) => void;
}

const parseJson = <T,>(raw: string, schema: z.ZodType<T>, label: string): T => {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const result = schema.safeParse(JSON.parse(cleaned));
  if (!result.success) {
    const first = result.error.issues[0];
    // The offending path is quoted back so a retry can fix precisely that.
    throw new Error(`${label} failed contract at ${first.path.join(".") || "root"}: ${first.message}`);
  }
  return result.data;
};

/** Retries what is worth retrying: rate limits, provider hiccups, and a malformed draft. */
async function withRetry<T>(label: string, fn: () => Promise<T>, tries = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const retryable = /429|rate|quota|503|500|UNAVAILABLE|overloaded|timeout|fetch failed|Unexpected token|JSON|contract/i.test(msg);
      if (!retryable || i >= tries) throw e;
      await new Promise((r) => setTimeout(r, 8000 * i));
    }
  }
}

/* ── 1. The plan ───────────────────────────────────────────────────────────────────────────── */

export async function outlineEpisode(
  source: string,
  opts: PodcastEngineOptions = {},
): Promise<PodcastOutline> {
  const client = opts.client ?? defaultGeminiClient();
  const model = opts.model ?? GEMINI_PRO;
  const minutes = opts.minutes ?? 24;
  opts.onProgress?.("outline", "planning the episode");
  const user = `LECTURE SOURCE:\n\n${source}`;
  return withRetry("outline", async () => {
    const res = await client.generate({
      system: OUTLINE_SYSTEM(minutes),
      user,
      model,
      temperature: 0.5,
      maxOutputTokens: 32768,
    });
    opts.onUsage?.("outline", res.usage);
    const cleaned = res.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    const parsed = safeParsePodcastOutline(JSON.parse(cleaned));
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new Error(`outline failed contract at ${first.path.join(".") || "root"}: ${first.message}`);
    }
    return parsed.data;
  });
}

/* ── 2. The dialogue, revised until it passes ──────────────────────────────────────────────── */

export interface ScriptResult {
  script: PodcastScript;
  /** What each draft looked like: words and which rules still failed. */
  drafts: { words: number; issues: string[] }[];
  /** Rules still failing when we ran out of revisions. Empty is the goal. */
  remaining: string[];
  claims: { checked: number; unsupported: string[] }[];
}

export async function writeScript(
  outline: PodcastOutline,
  source: string,
  opts: PodcastEngineOptions = {},
): Promise<ScriptResult> {
  const client = opts.client ?? defaultGeminiClient();
  const model = opts.model ?? GEMINI_PRO;
  const minutes = opts.minutes ?? 24;
  const words = minutes * WORDS_PER_MINUTE;

  // Per-beat word budgets, so the model spends its length where the lecture does.
  const plannedS = outline.beats.reduce((n, b) => n + b.est_seconds, 0) || minutes * 60;
  const budgets = outline.beats
    .map((b, i) => `  beat ${i} (${b.kind}, ${b.section}): ~${Math.round((b.est_seconds / plannedS) * words)} words`)
    .join("\n");
  const baseUser = `OUTLINE:\n${JSON.stringify(outline, null, 2)}\n\nPER-BEAT WORD BUDGETS (total ~${words}):\n${budgets}\n\nLECTURE SOURCE:\n${source}`;

  opts.onProgress?.("script", `writing ~${words} words`);
  let lines: PodcastLine[] = await withRetry("script", async () => {
    const res = await client.generate({
      system: SCRIPT_SYSTEM(words),
      user: baseUser,
      model,
      temperature: 0.8,
      maxOutputTokens: 65536,
    });
    opts.onUsage?.("script", res.usage);
    return parseJson(res.text, PodcastDraftSchema, "script").lines;
  });

  const drafts: { words: number; issues: string[] }[] = [];
  // Soft checks AND the structural rules: a patch can break either, so the loop must see both.
  const allIssues = () => [...structuralIssues(lines), ...scriptIssues(lines, words, outline)];
  let issues = allIssues();
  drafts.push({ words: countWords(lines), issues: issues.map((i) => i.split(":")[0]) });
  opts.onProgress?.("script", `draft 1: ${countWords(lines)} words · ${issues.length ? issues.map((i) => i.split(":")[0]).join(" · ") : "passes"}`);

  /** A full re-roll. Kept for failures that are about the whole episode; capped, and it regresses. */
  const rewrite = async (why: string, temperature: number) => {
    const prev = lines;
    lines = await withRetry("script rewrite", async () => {
      const res = await client.generate({
        system: SCRIPT_SYSTEM(words),
        user:
          `${baseUser}\n\nYOUR PREVIOUS DRAFT failed these checks:\n\n${why}\n\n` +
          `Rewrite the FULL script fixing every issue. Change ONLY what the issues require; keep every ` +
          `other line word for word.\n\nPREVIOUS DRAFT:\n${JSON.stringify({ lines: prev })}`,
        model,
        temperature,
        maxOutputTokens: 65536,
      });
      opts.onUsage?.("script", res.usage);
      return parseJson(res.text, PodcastDraftSchema, "script").lines;
    });
  };

  /** Line-level surgery: replace one line with one to three, everything else untouched. */
  const patch = async (why: string) => {
    const numbered = lines.map((l, i) => `${i}\t${l.speaker} [${l.kind}]: ${l.text}`).join("\n");
    const edits = await withRetry("script patch", async () => {
      const res = await client.generate({
        system: PATCH_SYSTEM(words),
        user:
          `OUTLINE (spine, must_say, sections):\n${JSON.stringify({ spine: outline.spine, must_say: outline.must_say, sections: outline.sections.map((x) => x.name) })}\n\n` +
          `FAILED CHECKS:\n\n${why}\n\nSCRIPT:\n${numbered}\n\nLECTURE SOURCE (for facts):\n${source}`,
        model,
        temperature: 0.4,
        maxOutputTokens: 32768,
      });
      opts.onUsage?.("script", res.usage);
      return parseJson(res.text, PatchSchema, "patch").edits;
    });
    // Applied from the bottom up, so earlier indexes stay valid while we splice.
    const next = [...lines];
    for (const e of [...edits].sort((a, b) => b.at - a.at)) {
      if (e.at < 0 || e.at >= lines.length) continue;
      const beat = lines[e.at].beat;
      next.splice(e.at, 1, ...e.lines.map((l) => ({ ...l, beat })));
    }
    lines = next;
    return edits.length;
  };

  let fullRewrites = 0;
  for (let attempt = 2; attempt <= MAX_REVISIONS && issues.length; attempt++) {
    const needsRewrite = issues.some((i) => GLOBAL_ISSUE.test(i)) && fullRewrites < MAX_FULL_REWRITES;
    if (needsRewrite) {
      fullRewrites++;
      await rewrite(issues.join("\n\n"), 0.6);
    } else {
      await patch(issues.join("\n\n"));
    }
    issues = allIssues();
    drafts.push({ words: countWords(lines), issues: issues.map((i) => i.split(":")[0]) });
    opts.onProgress?.("script", `draft ${attempt}: ${countWords(lines)} words · ${issues.length ? issues.map((i) => i.split(":")[0]).join(" · ") : "passes"}`);
  }

  /* ── 3. Claims: nothing goes to air that the lecture does not say ─────────────────────────── */
  const claims: { checked: number; unsupported: string[] }[] = [];
  for (let round = 0; round < MAX_CLAIMS_ROUNDS; round++) {
    opts.onProgress?.("claims", `checking round ${round + 1}`);
    const selected = selectClaimLines(lines);
    if (!selected.length) break;
    const verdicts = await checkClaims(
      selected.map((c, i) => ({ id: String(i), text: c.text })),
      source,
      { client, prose: true, onUsage: (u) => opts.onUsage?.("claims", u) },
    );
    const bad = verdicts
      .filter((v) => !v.supported)
      .map((v) => ({ ...v, line: selected[Number(v.id)].index, kind: selected[Number(v.id)].kind, text: selected[Number(v.id)].text }))
      .filter((v) => v.line >= 0 && v.line < lines.length);
    claims.push({
      checked: selected.length,
      unsupported: bad.map((v) => `[${v.kind}] line ${v.line}: "${v.text.slice(0, 90)}" — ${v.stage}: ${v.note.slice(0, 90)}`),
    });
    opts.onProgress?.("claims", `${selected.length} of ${lines.length} lines carry a claim · ${bad.length} unsupported`);
    if (!bad.length) break;
    await patch(
      `CLAIMS: these lines say things the lecture does not support. Fix each — drop the number, state it the ` +
        `way the source states it, or remove the causal link — without changing anything else:\n` +
        bad.map((v) => `  - line ${v.line} (${v.kind}): "${v.text.slice(0, 120)}" — ${v.note.slice(0, 120)}`).join("\n"),
    );
    issues = allIssues();
  }

  // A claims patch breaks structure as readily as any other patch. Repair before the final parse,
  // or a whole good episode fails at the last step with nowhere to go.
  for (let attempt = 0; attempt < 3; attempt++) {
    const structural = structuralIssues(lines);
    if (!structural.length) break;
    opts.onProgress?.("script", `repairing structure: ${structural.length} rule(s)`);
    await patch(structural.join("\n\n"));
  }
  issues = allIssues();

  const script: PodcastScript = { title: outline.title, summary: outline.through_line.slice(0, 600), lines };
  // The whole thing must satisfy the contract before anyone tries to voice it.
  const parsed = PodcastScriptSchema.safeParse(script);
  if (!parsed.success) {
    throw new Error(
      `the finished script broke the contract: ` +
        parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "root"}: ${i.message}`).join(" | "),
    );
  }
  return { script: parsed.data, drafts, remaining: issues, claims };
}
