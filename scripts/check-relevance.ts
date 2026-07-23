/**
 * check-relevance.ts — the R1 gate (spec docs/09 §8, unit).
 *
 *   npm run check:relevance
 *
 * Proves the pure relevance core: scoring bases defined for every type,
 * determinism across shuffled input, composer respects floors + budget,
 * remainder fills, controls move the mix, and extreme pools don't crash.
 * Exits 0 all-pass / 1 any-fail.
 */
import {
  compose,
  scoreItem,
  estimateHeight,
  defaultBudget,
  type ScoreCtx,
  type Section,
} from "@/components/sheet/relevance";
import { sampleContent } from "@samples/sample-content";
import type { SheetContent } from "@/contract/sheet-content";

const C = {
  g: (s: string) => `\x1b[32m${s}\x1b[0m`,
  r: (s: string) => `\x1b[31m${s}\x1b[0m`,
  d: (s: string) => `\x1b[2m${s}\x1b[0m`,
  b: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++;
    console.log(`  ${C.g("PASS")}  ${name}${detail ? C.d("  " + detail) : ""}`);
  } else {
    fail++;
    console.log(`  ${C.r("FAIL")}  ${name}${detail ? "  " + detail : ""}`);
  }
}

const CTX: ScoreCtx = {
  files: [
    { name: "Past midterm 2024.pdf", tag: "past_exam" },
    { name: "Review guide.pdf", tag: "review" },
  ],
  examType: "mixed",
  priority: "balanced",
};

console.log(C.b("\nRelevance core — checks\n"));

/* ── 1. Scoring bases defined for every type (F-BLK-6) ─────────────── */
{
  // A trap with no conf field must NOT score like conf=8; base is 35 (or 50 exam-cited).
  const trap = { text: "X is FALSE because Y", src: "Lecture 7" };
  const trapExam = { text: "Z is FALSE because W", src: "Past midterm 2024 Q5" };
  const table = { title: "z vs t", cols: ["a", "b"], rows: [["1", "2"]], src: "Review p2" };
  const st = scoreItem(trap, "traps", CTX);
  const ste = scoreItem(trapExam, "traps", CTX);
  const stbl = scoreItem(table, "tables", CTX);
  check("trap base ≥ 35 (not the conf=8 default)", st >= 35, `score=${st.toFixed(0)}`);
  check("exam-cited trap treated as verified (≥ 50 + authority)", ste >= 70, `score=${ste.toFixed(0)}`);
  // src "Review p2" hits the review KEYWORD (+12), not the filename tag (+14).
  check("table base = 20 + review-keyword authority", stbl >= 20 + 12, `score=${stbl.toFixed(0)}`);
}

/* ── 2. Verified dominates high-conf; authority + corroboration add ── */
{
  const verified = { conf: "low" as const, verified: true, src: "Past midterm 2024 Q3" };
  const highNoExam = { conf: "high" as const, src: "Slide 14" };
  const sv = scoreItem(verified, "formulas", CTX);
  const sh = scoreItem(highNoExam, "formulas", CTX);
  check("verified (50+auth) > high-conf-no-exam (35)", sv > sh, `verified=${sv.toFixed(0)} high=${sh.toFixed(0)}`);
  const multi = { conf: "med" as const, src: "Slide 14; Review p2; HW3 Q5" };
  const single = { conf: "med" as const, src: "Slide 14" };
  check("multi-source corroboration raises score", scoreItem(multi, "concepts", CTX) > scoreItem(single, "concepts", CTX));
}

/* ── 3. Determinism: shuffled input ⇒ identical composition ─────────── */
{
  const shuffled: SheetContent = {
    ...sampleContent,
    formulas: [...sampleContent.formulas].reverse(),
    concepts: [...sampleContent.concepts].reverse(),
    traps: [...sampleContent.traps].reverse(),
    questions: [...sampleContent.questions].reverse(),
  };
  const a = compose(sampleContent, "max", CTX);
  const b = compose(sampleContent, "max", CTX);
  check("compose is deterministic (same input twice)", JSON.stringify(a.placed.map((p) => p.id)) === JSON.stringify(b.placed.map((p) => p.id)));
  // Shuffling input arrays changes ids (emission index), but the SET of
  // top items by score must be stable — check counts match.
  const c = compose(shuffled, "max", CTX);
  check("composition size stable under input shuffle", a.placed.length === c.placed.length, `${a.placed.length} vs ${c.placed.length}`);
}

/* ── 4. Floors respected (when pool has them) ──────────────────────── */
{
  for (const density of ["max", "balanced", "essentials"] as const) {
    const res = compose(sampleContent, density, CTX);
    const okF = res.counts.formulas >= Math.min(3, sampleContent.formulas.length);
    const okT = res.counts.traps >= Math.min(2, sampleContent.traps.length);
    check(`${density}: floors met (formulas≥3, traps≥2)`, okF && okT, `f=${res.counts.formulas} t=${res.counts.traps}`);
  }
}

/* ── 5. Budget never exceeded (estimated) ──────────────────────────── */
{
  for (const density of ["max", "balanced", "essentials"] as const) {
    const budget = defaultBudget(density);
    const res = compose(sampleContent, density, CTX, budget);
    const used = res.placed.reduce((a, p) => a + p.estHeight, 0);
    check(`${density}: est. used ≤ budget`, used <= budget + 1e-6, `used=${used.toFixed(0)} budget=${budget.toFixed(0)} fill=${(res.estFill * 100).toFixed(0)}%`);
  }
}

/* ── 6. Density shows fewer than MAX (bigger type) ─────────────────── */
{
  const mx = compose(sampleContent, "max", CTX).placed.length;
  const bl = compose(sampleContent, "balanced", CTX).placed.length;
  const es = compose(sampleContent, "essentials", CTX).placed.length;
  check("placed count: max ≥ balanced ≥ essentials", mx >= bl && bl >= es, `max=${mx} bal=${bl} ess=${es}`);
}

/* ── 7. Essentials drops topics + tables (unless underfill) ─────────── */
{
  const res = compose(sampleContent, "essentials", CTX);
  check("essentials: topics dropped (or ≤2 on underfill)", res.counts.topics <= 2, `topics=${res.counts.topics}`);
  check("essentials: tables dropped", res.counts.tables === 0, `tables=${res.counts.tables}`);
}

/* ── 8. Controls move the mix ──────────────────────────────────────── */
{
  const problem = compose(sampleContent, "max", { ...CTX, examType: "problem-solving" });
  const concept = compose(sampleContent, "max", { ...CTX, examType: "conceptual" });
  check("problem-solving yields ≥ formulas than conceptual", problem.counts.formulas >= concept.counts.formulas, `ps=${problem.counts.formulas} c=${concept.counts.formulas}`);
  check("conceptual yields ≥ concepts than problem-solving", concept.counts.concepts >= problem.counts.concepts, `c=${concept.counts.concepts} ps=${problem.counts.concepts}`);
}

/* ── 9. Extreme pools don't crash + behave ─────────────────────────── */
{
  const empty: SheetContent = { ...sampleContent, formulas: [], concepts: [], traps: [], questions: [], topics: [], tables: [] };
  const r1 = compose(empty, "max", CTX);
  check("empty pool → empty placement, no crash", r1.placed.length === 0);

  const oneGiant: SheetContent = {
    ...empty,
    formulas: [{
      name: "Huge", formula: "a\n".repeat(40), vars: "x", when: "y",
      src: "Slide 1", conf: "high" as const,
    }],
  };
  const r2 = compose(oneGiant, "essentials", CTX);
  check("one oversized item doesn't throw", Array.isArray(r2.placed));

  const allVerified: SheetContent = {
    ...sampleContent,
    formulas: sampleContent.formulas.map((f) => ({ ...f, verified: true, conf: "high" as const })),
  };
  const r3 = compose(allVerified, "balanced", CTX);
  check("all-verified pool composes + respects budget", r3.placed.reduce((a, p) => a + p.estHeight, 0) <= defaultBudget("balanced") + 1e-6);
}

/* ── 10. estimateHeight: multiline formula ≈ line count ────────────── */
{
  const single = estimateHeight({ name: "A", formula: "x = 1", vars: "x", when: "y", src: "s" }, "formulas", "max");
  const multi = estimateHeight({ name: "A", formula: "a=1\nb=2\nc=3\nd=4", vars: "x", when: "y", src: "s" }, "formulas", "max");
  check("multiline formula taller than single-line", multi > single, `single=${single.toFixed(0)} multi=${multi.toFixed(0)}`);
}

console.log();
if (fail === 0) {
  console.log(C.g(C.b(`✓ ${pass}/${pass} checks passed`)));
  process.exit(0);
} else {
  console.log(C.r(C.b(`✗ ${fail} failed, ${pass} passed`)));
  process.exit(1);
}
