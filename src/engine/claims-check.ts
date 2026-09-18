/**
 * claims-check.ts — may this machine-written line go in front of a student? (issue #17)
 *
 * The first checker (audio round 4) read 54 claims, passed all 54, and four of them had cause
 * and effect backwards. A model asked "is this supported?" says yes. So a verdict here has to
 * be EARNED, in two stages, and the whole thing is measured against a hand-labelled set
 * (scripts/evals/claims, `npx tsx scripts/eval-claims.ts`) before anything trusts it:
 *
 *  1. QUOTE. For every line the model must produce the passages of the source that say it,
 *     verbatim (up to three — a line often draws on a definition here and a number there). Code —
 *     not the model — then looks for each quote in the source. No quote, or a quote that is not
 *     there, is "unsupported". This removes support that was imagined.
 *  2. SAME RELATION (opt-in, `relation: true`). A real quote can still be bent: "penalizes"
 *     quoted in support of "rewards". A second, narrow call answers one question: does the quote
 *     state the same thing? Measured and OFF by default — it caught nothing stage 1 had not
 *     already stopped, and doubled both the false alarms and the time. See ClaimsOptions.
 *
 * Bias: when in doubt, unsupported. A dropped true line costs a little space; a confident wrong
 * line costs a student marks.
 */
import { z } from "zod";
import { defaultGeminiClient, GEMINI_FLASH } from "./gemini-client";
import type { LLMClient } from "./llm-client";

export interface ClaimLine { id: string; text: string }
export interface ClaimVerdict {
  id: string;
  supported: boolean;
  /** Which stage decided, for the logs and the eval. "unchecked" = the checker itself failed. */
  stage: "quote-missing" | "quote-not-in-source" | "relation" | "passed" | "unchecked";
  evidence?: string;
  note: string;
}

const norm = (t: string): string[] =>
  t.toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 1);

/**
 * Is `quote` in the source? PDF text breaks lines mid-sentence and scatters punctuation, so the
 * test is on words: every word of the quote, in order, inside a window not much longer than the
 * quote itself. Returns the matched stretch of the source (for stage 2's context) or null.
 */
export function findQuote(quote: string, sourceWords: string[]): { start: number; end: number } | null {
  const q = norm(quote);
  if (q.length < 4) return null; // two words "support" anything
  // PDF extraction glues words ("queryqis", "keyskand") and the model un-glues them when it
  // quotes, so a quote word also matches a source word it begins (or that begins it).
  const same = (qw: string, sw: string) =>
    qw === sw || (qw.length >= 4 && sw.startsWith(qw)) || (sw.length >= 4 && qw.startsWith(sw));
  const slack = Math.ceil(q.length * 0.5) + 3;
  const mayMiss = Math.floor(q.length * 0.15); // a tidied symbol, a dropped bullet — never a sentence
  for (let i = 0; i < sourceWords.length; i++) {
    if (!same(q[0], sourceWords[i])) continue;
    let k = 1, j = i + 1, missed = 0;
    const limit = Math.min(sourceWords.length, i + q.length + slack);
    while (k < q.length && j < limit) {
      if (same(q[k], sourceWords[j])) { k++; j++; }
      else if (k + 1 < q.length && missed < mayMiss && same(q[k + 1], sourceWords[j])) { missed++; k += 2; j++; }
      else j++;
    }
    if (k >= q.length - (mayMiss - missed > 0 ? 1 : 0) && k >= q.length - 1 && (k === q.length || missed < mayMiss)) return { start: i, end: j };
  }
  return null;
}

const QUOTE_SYSTEM = `You check lines written for a student's exam sheet against the SOURCE (the student's own
course material). For EVERY line, find the passage of the SOURCE that states what the line states.

- "quotes": copy the passages from the SOURCE word for word (each 6–30 words, each one continuous
  stretch, at most 3). A line often draws on two or three places — a definition here, the number
  there; give one passage for each part. Do not paraphrase, do not stitch two places into one
  quote, do not fix the source's wording.
- If the SOURCE does not state it — the number is not there, the cause is not given, the fact is
  true in the world but absent from the SOURCE, or the SOURCE says the opposite — return "quotes": [].
- Give passages for the WHOLE line. If one part of it is in the SOURCE and another part is not,
  that line is not supported: return "quotes": [].
- The ORDER in which a source presents topics is not evidence that one causes the next. "X solved
  A, but created B" needs a passage saying X causes B.
- General knowledge does not count. Only the SOURCE.

Return JSON exactly: {"lines":[{"id":"","quotes":["",""]}]} with one entry per line, same ids.`;

const RELATION_SYSTEM = `You are given CLAIMS, each with an EVIDENCE passage copied from a student's course material.
For each, answer ONE question: does the EVIDENCE state the same thing as the CLAIM?

Say "same" only if all of these hold:
- direction and polarity match (penalizes is not rewards; slower is not faster; more is not less; A→B is not B→A);
- the entities match (the claim is about the same thing the evidence is about, not a neighbour);
- every specific number, year and name in the claim appears in the evidence;
- if the claim says X causes / creates / leads to / is why Y, the evidence itself says X causes Y.
  Evidence that merely mentions X and Y, or presents Y after X, is NOT the same;
- the claim adds no condition, mechanism or reason the evidence does not give.
Read AROUND IT to see what the evidence is ABOUT — its slide heading, the list it belongs to, the
sentence before it — and treat that as part of the evidence: a claim may name the subject the
heading names, or join the evidence to the sentence next to it. It may NOT bring in anything that
is in neither.
Otherwise say "different". A careful paraphrase of the evidence is "same". When unsure: "different".

Return JSON exactly: {"claims":[{"id":"","verdict":"same|different","why":""}]}`;

const QuoteSchema = z.object({
  lines: z.array(z.object({ id: z.string(), quotes: z.array(z.string()).optional(), quote: z.string().optional() })),
});
const RelationSchema = z.object({ claims: z.array(z.object({ id: z.string(), verdict: z.string(), why: z.string().optional() })) });

const parse = <T>(text: string, schema: z.ZodType<T>): T =>
  schema.parse(JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "")));

export interface ClaimsOptions {
  client?: LLMClient; model?: string; batch?: number; timeoutMs?: number;
  /**
   * Also run stage 2 (does the quote state the SAME relation?). OFF by default on the evidence:
   * on scripts/evals/claims it caught nothing stage 1 had not already stopped, while doubling the
   * false alarms (8% → 18%) and the time (22s → 54s). Kept because the threat it answers — a REAL
   * quote bent into a wrong claim — is real but not yet represented in the eval set. Turn it on
   * when the eval has cases that need it.
   */
  relation?: boolean;
}

export async function checkClaims(lines: ClaimLine[], source: string, opts: ClaimsOptions = {}): Promise<ClaimVerdict[]> {
  if (!lines.length) return [];
  const client = opts.client ?? defaultGeminiClient();
  const model = opts.model ?? GEMINI_FLASH;
  // Batch size is bounded by the REPLY, not the prompt: each line comes back with up to three
  // quotes, and a reply that runs out of room is truncated, unparseable, and used to condemn every
  // line in it (100% false alarms — caught by the eval, twice). Keep batches small, give the reply
  // room, and retry once before calling anything unsupported.
  const batch = opts.batch ?? 16;
  const relBatch = Math.min(batch, 12);
  const sourceWords = norm(source);
  const originalWords = source.split(/\s+/);
  const withTimeout = <T>(p: Promise<T>): Promise<T> =>
    Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("claims check timed out")), opts.timeoutMs ?? 60_000))]);
  const chunks: ClaimLine[][] = [];
  for (let i = 0; i < lines.length; i += batch) chunks.push(lines.slice(i, i + batch));

  // ── Stage 1: quote, verified by code ───────────────────────────────────
  const verdicts = new Map<string, ClaimVerdict>();
  const quoted: { line: ClaimLine; quote: string; context: string }[] = [];
  await Promise.all(chunks.map(async (chunk) => {
    const user = `SOURCE:\n${source.slice(0, 300_000)}\n\n──────\n\nLINES:\n${chunk.map((l) => `[${l.id}] ${l.text}`).join("\n")}`;
    let got: { id: string; quotes?: string[]; quote?: string }[] = [];
    for (let attempt = 0; attempt < 2 && got.length < chunk.length; attempt++) {
      try {
        const res = await withTimeout(client.generate({ system: QUOTE_SYSTEM, user, model, temperature: 0, maxOutputTokens: 24576 }));
        got = parse(res.text, QuoteSchema).lines;
      } catch {
        /* truncated or malformed: try once more, then the lines fall through as unchecked */
      }
    }
    if (got.length < chunk.length) {
      for (const line of chunk.slice(got.length)) {
        verdicts.set(line.id, { id: line.id, supported: false, stage: "unchecked", note: "the checker did not answer for this line" });
      }
    }
    const byId = new Map(got.map((g) => [g.id.replace(/[[\]]/g, ""), (g.quotes ?? (g.quote ? [g.quote] : [])).map((q) => q.trim()).filter(Boolean)]));
    for (const line of chunk) {
      if (verdicts.has(line.id)) continue;
      const quotes = (byId.get(line.id) ?? []).slice(0, 3);
      if (!quotes.length) { verdicts.set(line.id, { id: line.id, supported: false, stage: "quote-missing", note: "the source has no passage that says this" }); continue; }
      const hits = quotes.map((q) => ({ q, hit: findQuote(q, sourceWords) }));
      const bad = hits.find((h) => !h.hit);
      if (bad) { verdicts.set(line.id, { id: line.id, supported: false, stage: "quote-not-in-source", evidence: bad.q, note: "a passage offered as evidence is not in the source" }); continue; }
      const quote = quotes.join(" … ");
      const hit = { start: Math.min(...hits.map((h) => h.hit!.start)), end: hits[0].hit!.end };
      // PDF text breaks a sentence over many short lines, so "words" here are small: take a wide
      // window (±90) or stage 2 cannot see the slide heading that says what the passage is about
      // ("Repeat for a total of 6 runs" — of WHAT? The heading two lines up says Transformer).
      const frac = (n: number) => Math.round((n / sourceWords.length) * originalWords.length);
      const context = originalWords.slice(Math.max(0, frac(hit.start) - 90), frac(hit.end) + 90).join(" ");
      quoted.push({ line, quote, context });
    }
  }));

  // ── Stage 2: does the quote state the SAME relation? ──────────────────
  if (!opts.relation) {
    for (const c of quoted) verdicts.set(c.line.id, { id: c.line.id, supported: true, stage: "passed", evidence: c.quote, note: "quote verified in the source (stage 1 only)" });
    return lines.map((l) => verdicts.get(l.id) ?? { id: l.id, supported: false, stage: "quote-missing", note: "not checked" });
  }
  const relChunks: (typeof quoted)[] = [];
  for (let i = 0; i < quoted.length; i += relBatch) relChunks.push(quoted.slice(i, i + relBatch));
  await Promise.all(relChunks.map(async (chunk) => {
    const user = chunk.map((c) => `[${c.line.id}]\nCLAIM: ${c.line.text}\nEVIDENCE: "${c.quote}"\nAROUND IT: …${c.context}…`).join("\n\n");
    // An answer for every claim, or the batch is retried once: a reply that ran out of room used
    // to condemn every line in it.
    let byId = new Map<string, { id: string; verdict: string; why?: string }>();
    for (let attempt = 0; attempt < 2 && byId.size < chunk.length; attempt++) {
      try {
        const res = await withTimeout(client.generate({ system: RELATION_SYSTEM, user, model, temperature: 0, maxOutputTokens: 16384 }));
        const got = parse(res.text, RelationSchema).claims;
        byId = new Map(got.map((g) => [g.id.replace(/[[\]]/g, ""), g]));
      } catch {
        /* retry once, then the lines below are marked unchecked */
      }
    }
    for (const c of chunk) {
      const g = byId.get(c.line.id);
      if (!g) {
        verdicts.set(c.line.id, { id: c.line.id, supported: false, stage: "unchecked", evidence: c.quote, note: "the checker did not answer for this line" });
        continue;
      }
      const same = g.verdict.trim().toLowerCase() === "same";
      verdicts.set(c.line.id, same
        ? { id: c.line.id, supported: true, stage: "passed", evidence: c.quote, note: g.why ?? "" }
        : { id: c.line.id, supported: false, stage: "relation", evidence: c.quote, note: g.why ?? "the evidence does not state the same thing" });
    }
  }));

  return lines.map((l) => verdicts.get(l.id) ?? { id: l.id, supported: false, stage: "quote-missing", note: "not checked" });
}
