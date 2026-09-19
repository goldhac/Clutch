/**
 * test-podcast-contract.ts — the structure an episode must have (#3).
 * Deterministic, no model calls:  npx tsx scripts/test-podcast-contract.ts
 *
 * Every case here is a real failure from Phase 0, not an invented one.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { safeParsePodcastScript, structuralIssues, type PodcastLine } from "@/contract/podcast-script";

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log(`  ok  ${name}`); };
const L = (speaker: "A" | "B", kind: string, text: string, beat = 0): PodcastLine =>
  ({ speaker, kind, text, beat }) as PodcastLine;

/** A minimal valid episode: alternating, every wrapper kind, one complete retrieval beat. */
function valid() {
  const lines: PodcastLine[] = [
    L("A", "open", "A model meets a name it has never seen and freezes."),
    L("B", "motivation", "Why does that stop it completely?"),
    L("A", "mechanism", "The decoder can only pick from a fixed vocabulary."),
    L("B", "confusion", "So an unknown name has no entry at all?"),
    L("A", "example", "Right — my dog UNK is named after UNK UNK."),
    L("B", "analogy", "Like hearing a new name at a party and repeating it."),
    L("A", "relevance", "This is the bit an exam question hangs on."),
    L("B", "retrieval-question", "So what does the copy mechanism actually copy?"),
    L("A", "retrieval-pickup", "Have a go before I answer."),
    L("B", "retrieval-attempt", "A word from the input, using the attention weights?"),
    L("A", "retrieval-answer", "Exactly that — the attention distribution over the input."),
    L("B", "midpoint-recap", "So copying handles the unknown word."),
    L("A", "mechanism", "And coverage handles the repeats, separately."),
    L("B", "recap", "Copying for unknowns, coverage for repeats."),
    L("A", "homework", "Open your sheet and find the coverage vector line."),
    L("B", "outro", "See you in the next one."),
  ];
  // pad to the 20-line minimum, keeping alternation
  while (lines.length < 22) {
    const at = lines.length - 4;
    lines.splice(at, 0,
      L(lines[at - 1].speaker === "A" ? "B" : "A", "mechanism", "And that is why the weights matter."),
      L(lines[at - 1].speaker === "A" ? "A" : "B", "confusion", "Does that hold for long inputs?"));
  }
  return { title: "Attention Networks", summary: "How copying and coverage fix the decoder.", lines };
}

const parse = (s: unknown) => safeParsePodcastScript(s);
const failsWith = (s: unknown, re: RegExp) => {
  const r = parse(s);
  assert.equal(r.success, false, "expected this script to be rejected");
  const msg = r.success ? "" : r.error.issues.map((i) => i.message).join(" | ");
  assert.match(msg, re);
};

ok("a well-formed episode passes", () => {
  const r = parse(valid());
  assert.equal(r.success, true, r.success ? "" : r.error.issues.map((i) => i.message).join(" | "));
});
ok("two teaching lines by the same host are rejected", () => {
  const s = valid();
  s.lines[3] = L("A", "confusion", "And another thing entirely.");
  failsWith(s, /strictly alternate/);
});
ok("a host may pose the retrieval question, then pick it up", () => {
  // Both exceptions at once, exactly as the approved episode does it.
  const s = valid();
  s.lines[6] = L("A", "relevance", "This is the bit an exam question hangs on.");
  s.lines[7] = L("A", "retrieval-question", "So what does the copy mechanism copy?");
  s.lines[8] = L("A", "retrieval-pickup", "Take a second.");
  const r = parse(s);
  assert.equal(r.success, true, r.success ? "" : r.error.issues.map((i) => i.message).join(" | "));
});
ok("the answer may run on over several turns", () => {
  const s = valid();
  s.lines.splice(11, 0, L("B", "retrieval-answer", "So the weights pick the word."), L("A", "retrieval-answer", "Exactly."));
  const r = parse(s);
  assert.equal(r.success, true, r.success ? "" : r.error.issues.map((i) => i.message).join(" | "));
});
ok("an episode that stops mid-thought is rejected", () => {
  const s = valid();
  s.lines.push(L("A", "mechanism", "One more thing about the weights."));
  failsWith(s, /last line must be part of the outro/);
});
ok("a missing homework close is rejected", () => {
  const s = valid();
  s.lines[s.lines.length - 2] = L("A", "recap", "That is the lot.");
  failsWith(s, /wrapper kind|homework/);
});
ok("homework after the outro is rejected", () => {
  const s = valid();
  const hw = s.lines.findIndex((l) => l.kind === "homework");
  s.lines[hw].kind = "recap";
  s.lines.splice(s.lines.length, 0, L("B", "homework", "Go find it on your sheet."), L("A", "outro", "Bye."));
  failsWith(s, /near the end|before the outro/);
});
ok("a retrieval question answered immediately is rejected", () => {
  const s = valid();
  s.lines.splice(8, 2); // drop the pickup and the attempt
  failsWith(s, /pickup|pause is the point/);
});
ok("no retrieval beat at all is rejected", () => {
  const s = valid();
  s.lines = s.lines.filter((l) => !l.kind.startsWith("retrieval"));
  s.lines = s.lines.filter((l, i) => i === 0 || l.speaker !== s.lines[i - 1].speaker);
  failsWith(s, /retrieval/);
});
ok("addressing a host as \"B\" is rejected", () => {
  const s = valid();
  s.lines[2] = L("A", "mechanism", "Okay, B, what do you think happens next?");
  failsWith(s, /labels in this file|no line may address/);
});
ok("a paragraph read aloud is rejected", () => {
  const s = valid();
  s.lines[2] = L("A", "mechanism", "So ".repeat(200));
  failsWith(s, /under 400 characters|paragraph/);
});
ok("an unknown field is rejected", () => {
  const s = valid() as unknown as Record<string, unknown>;
  s.tone = "warm";
  failsWith(s, /Unrecognized key|tone/);
});
ok("an unknown line kind is rejected", () => {
  const s = valid();
  (s.lines[2] as unknown as Record<string, unknown>).kind = "banter";
  failsWith(s, /Invalid|expected one of/i);
});
ok("all furniture and no teaching is rejected", () => {
  const s = valid();
  s.lines.forEach((l) => { if (!l.kind.startsWith("retrieval")) l.kind = "recap"; });
  failsWith(s, /wrapper kind|all furniture/);
});

// The real round-4 script must satisfy the contract — if it does not, the contract is wrong.
ok("the round-4 episode Gold approved passes", () => {
  const raw = JSON.parse(readFileSync("scripts/phase0/out/21-attn-r4-2026-09-15T21-44-42/script.json", "utf8"));
  const script = { title: "NLP — Attention Networks", summary: "Copying, coverage and the transformer.", lines: raw.lines };
  const r = parse(script);
  assert.equal(r.success, true, r.success ? "" : "REAL SCRIPT REJECTED: " + r.error.issues.map((i) => i.message).join(" | "));
});

ok("structuralIssues reports the same rules as repairable text", () => {
  const s = valid();
  s.lines[3] = L("A", "confusion", "And another thing entirely.");
  s.lines[5] = L("A", "analogy", "Okay, B, what do you reckon?");
  const issues = structuralIssues(s.lines);
  assert.ok(issues.length >= 2, `expected two structural issues, got ${issues.length}`);
  assert.ok(issues.every((i) => i.startsWith("STRUCTURE: ")), "each must be tagged for the patch loop");
  assert.match(issues.join(" "), /alternate/);
  assert.match(issues.join(" "), /labels in this file|address a host/);
});
ok("structuralIssues is silent on a good script", () => {
  assert.deepEqual(structuralIssues(valid().lines), []);
});

console.log(`\n${n} checks passed`);
