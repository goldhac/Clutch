/**
 * test-deepen-guards.ts — the checks that decide whether a machine-written line may go on an
 * exam sheet. Deterministic, no model calls:  npx tsx scripts/test-deepen-guards.ts
 */
import assert from "node:assert/strict";
import { groundingProblem, numberProblem, paraphrases, stems } from "@/engine/deepen";

const PACK = `
Sixty percent of all adults in the US have one or more chronic diseases. In 2016 there were 5,534 hospitals.
HCA Healthcare has 182 hospitals; CommonSpirit Health has 140. Self attention (intra-attention) lets words
attend to other words in the same sequence. The coverage vector sums attention distributions.
US life expectancy is 76.1; Japan 84.5.
`;
const pack = new Set(stems(PACK));
let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log(`  ok  ${name}`); };

ok("a number that is in the files passes", () => {
  assert.equal(numberProblem("questions", { q: "How many hospitals does HCA have?", a: "182 hospitals" }, PACK), null);
});
ok("a number the slides spell out may be written in digits", () => {
  assert.equal(numberProblem("questions", { q: "What share of US adults have a chronic disease?", a: "60%" }, PACK), null);
  assert.equal(numberProblem("concepts", { term: "Nurses", def: "About 85% work in hospitals." }, "Eighty-five percent of nurses work in hospitals."), null);
});
ok("a wrong figure with all the right words is caught", () => {
  assert.match(numberProblem("questions", { q: "How many hospitals does HCA have?", a: "128 hospitals" }, PACK) ?? "", /128/);
});
ok("a year does not vouch for a number inside it (16 vs 2016)", () => {
  assert.match(numberProblem("concepts", { term: "Chronic disease", def: "16% of adults have one." }, PACK) ?? "", /16%/);
});
ok("thousands separators are ignored", () => {
  assert.equal(numberProblem("concepts", { term: "Hospitals", def: "There were 5534 hospitals in 2016." }, PACK), null);
});
ok("decimals must match exactly", () => {
  assert.equal(numberProblem("concepts", { term: "Life expectancy", def: "US 76.1, Japan 84.5" }, PACK), null);
  assert.match(numberProblem("concepts", { term: "Life expectancy", def: "US 78.1" }, PACK) ?? "", /78\.1/);
});
ok("single digits and list counters are not policed", () => {
  assert.equal(numberProblem("questions", { q: "Name the 2 modes", a: "1. generate 2. copy" }, PACK), null);
});
ok("formulas are exempt (exponents, indices)", () => {
  assert.equal(numberProblem("formulas", { name: "Scaled attention", formula: "softmax(QK^T / sqrt(512))" }, PACK), null);
});
ok("a subject the files never mention is refused", () => {
  assert.match(groundingProblem("concepts", { term: "Master Theorem Case 1", def: "If f(n) = O(n^(log_b a - e)) then T(n) = Theta(n^log_b a)." }, pack) ?? "", /not in your files/);
});
ok("a label word the slides never use does not sink a grounded line", () => {
  assert.equal(groundingProblem("concepts", { term: "Self-Attention Purpose", def: "Lets words attend to other words in the same sequence." }, pack), null);
});
ok("hyphenation does not matter (self-attention = self attention)", () => {
  assert.deepEqual(stems("self-attention"), stems("self attention"));
});
ok("the same fact asked again is a paraphrase", () => {
  const a = new Set(stems("Over 60% of all adults in the US have at least one chronic disease."));
  const b = new Set(stems("More than half of adults in the US have one or more chronic diseases."));
  assert.equal(paraphrases(a, b), true);
});
ok("a different question about the same topic is not", () => {
  const a = new Set(stems("How many hospitals does HCA Healthcare operate?"));
  const b = new Set(stems("Which hospital system is the largest not-for-profit?"));
  assert.equal(paraphrases(a, b), false);
});
console.log(`\n${n} checks passed`);
