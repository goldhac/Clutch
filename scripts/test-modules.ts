/**
 * test-modules.ts — the free, instant half of sheet modules (#20).
 *   npx tsx scripts/test-modules.ts
 *
 * Every control here only shows or hides what the engine already wrote, so these checks are pure
 * and free. The one that matters most is the last group: a line the student wrote is PINNED, and
 * neither "less" nor the fitter may take it. Silently ranking away something a professor said
 * would be on the exam is the single failure this feature cannot afford.
 */
import assert from "node:assert/strict";
import { applyEdit, applyModules, editKey, trimmedIds, trimRoom, MIN_TOPIC_LINES } from "@/components/sheet/modules";
import type { SheetContent } from "@/contract/sheet-content";

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log(`  ok  ${name}`); };

const concept = (term: string, topic: string, mine?: true) => ({
  term, def: `${term} definition.`, topic, src: mine ? "you" : "Slide 3", conf: "med" as const,
  ...(mine ? { mine } : {}),
});
const question = (q: string, topic: string) => ({
  q, a: "Answer.", kind: "short" as const, topic, src: "Slide 4", conf: "med" as const,
});

const content = (): SheetContent => ({
  title: "NLP Reference Sheet",
  topics: [
    { name: "Attention", why: "Core.", src: "a.pdf", conf: "med" },
    { name: "Parsing", why: "Also core.", src: "b.pdf", conf: "med" },
  ],
  formulas: [],
  concepts: [concept("Softmax", "Attention"), concept("Arc-standard", "Parsing")],
  traps: [],
  questions: [question("Why scale?", "Attention"), question("What is a dependency?", "Parsing")],
  notes: [
    { id: "n1", topic: "Attention", text: "He said this is on the final.", createdAt: "2026-09-29T10:00:00Z" },
    { id: "n2", text: "Loose note.", createdAt: "2026-09-29T10:01:00Z" },
  ],
} as SheetContent);

// ── unticking a topic ────────────────────────────────────────────────────────────────────────
ok("no modules leaves the sheet exactly as it was", () => {
  const c = content();
  assert.equal(applyModules(c, undefined), c, "it copied when it had nothing to do");
  assert.equal(applyModules(c, {}), c);
});

ok("unticking a topic removes the topic and everything in it", () => {
  const r = applyModules(content(), { Parsing: { off: true } });
  assert.deepEqual(r.topics.map((t) => t.name), ["Attention"]);
  assert.equal(r.concepts.length, 1);
  assert.equal(r.questions.length, 1);
  assert.ok(!r.concepts.some((x) => x.topic === "Parsing"), "a Parsing line survived");
});

ok("unticking one topic never touches another", () => {
  const r = applyModules(content(), { Parsing: { off: true } });
  assert.equal(r.concepts[0].term, "Softmax");
  assert.equal(r.questions[0].q, "Why scale?");
});

ok("a note follows its topic off the sheet, a loose note stays", () => {
  const r = applyModules(content(), { Attention: { off: true } });
  assert.deepEqual(r.notes?.map((x) => x.id), ["n2"], "a note outlived the topic it was pinned to");
});

// ── section mix ──────────────────────────────────────────────────────────────────────────────
ok("a topic's section mix hides only that topic's sections", () => {
  const r = applyModules(content(), { Attention: { sections: ["concepts"] } });
  // Attention keeps concepts, loses questions. Parsing is untouched.
  assert.ok(r.concepts.some((x) => x.topic === "Attention"));
  assert.ok(!r.questions.some((x) => x.topic === "Attention"), "Attention kept a question");
  assert.ok(r.questions.some((x) => x.topic === "Parsing"), "Parsing lost a question it should keep");
});

ok("an empty section list hides every section of that topic", () => {
  const r = applyModules(content(), { Attention: { sections: [] } });
  assert.ok(!r.concepts.some((x) => x.topic === "Attention"));
  assert.ok(!r.questions.some((x) => x.topic === "Attention"));
  assert.equal(r.topics.length, 2, "the topic itself should still be ticked");
});

// ── less ─────────────────────────────────────────────────────────────────────────────────────
const scored = (ids: [string, number][]) => ids.map(([id, score]) => ({ id, score }));
const topicFrom = (map: Record<string, string>) => (id: string) => map[id];

ok("less drops the lowest-scored lines of that topic only", () => {
  const items = scored([["a1", 10], ["a2", 2], ["a3", 5], ["a4", 9], ["a5", 1], ["p1", 0]]);
  const topics = topicFrom({ a1: "A", a2: "A", a3: "A", a4: "A", a5: "A", p1: "P" });
  const out = trimmedIds(items, { A: { trim: 2 } }, topics, () => ({}));
  assert.deepEqual([...out].sort(), ["a2", "a5"], "it took the wrong lines");
  assert.ok(!out.has("p1"), "it reached into another topic");
});

ok("less stops at the floor instead of emptying a topic", () => {
  const items = scored([["a1", 3], ["a2", 2], ["a3", 1], ["a4", 4]]);
  const topics = topicFrom({ a1: "A", a2: "A", a3: "A", a4: "A" });
  const out = trimmedIds(items, { A: { trim: 99 } }, topics, () => ({}));
  assert.equal(out.size, 4 - MIN_TOPIC_LINES, `it went below the ${MIN_TOPIC_LINES}-line floor`);
});

ok("a topic already at the floor cannot be trimmed at all", () => {
  const items = scored([["a1", 3], ["a2", 2], ["a3", 1]]);
  const out = trimmedIds(items, { A: { trim: 5 } }, topicFrom({ a1: "A", a2: "A", a3: "A" }), () => ({}));
  assert.equal(out.size, 0);
});

ok("an unticked topic is not also trimmed", () => {
  const items = scored([["a1", 3], ["a2", 2], ["a3", 1], ["a4", 0]]);
  const out = trimmedIds(items, { A: { off: true, trim: 2 } }, topicFrom({ a1: "A", a2: "A", a3: "A", a4: "A" }), () => ({}));
  assert.equal(out.size, 0, "off and trim both fired");
});

ok("trimRoom tells the UI when 'less' must become 'remove'", () => {
  assert.equal(trimRoom(10), 7);
  assert.equal(trimRoom(10, 7), 0);
  assert.equal(trimRoom(MIN_TOPIC_LINES), 0);
  assert.equal(trimRoom(1), 0, "it went negative");
});

// ── the rule that outranks the rest ──────────────────────────────────────────────────────────
ok("less will not take a line the student wrote", () => {
  const items = scored([["a1", 9], ["a2", 8], ["a3", 7], ["mine", 0], ["a4", 1]]);
  const topics = topicFrom({ a1: "A", a2: "A", a3: "A", mine: "A", a4: "A" });
  const byId = (id: string) => (id === "mine" ? { mine: true } : {});
  const out = trimmedIds(items, { A: { trim: 2 } }, topics, byId);
  assert.ok(!out.has("mine"), "it trimmed the student's own line — the worst bug this feature can have");
  // Their line is the lowest-scored, so the next two weakest go instead.
  assert.deepEqual([...out].sort(), ["a3", "a4"]);
});

ok("a topic of nothing but the student's own lines is untouchable", () => {
  const items = scored([["m1", 1], ["m2", 2], ["m3", 3], ["m4", 4]]);
  const topics = topicFrom({ m1: "A", m2: "A", m3: "A", m4: "A" });
  const out = trimmedIds(items, { A: { trim: 3 } }, topics, () => ({ mine: true }));
  assert.equal(out.size, 0);
});

ok("the student's own lines still count toward the floor", () => {
  // 4 lines, one theirs: only 1 may go, not 2 — the floor counts what is LEFT on the sheet.
  const items = scored([["a1", 9], ["a2", 5], ["a3", 4], ["mine", 0]]);
  const topics = topicFrom({ a1: "A", a2: "A", a3: "A", mine: "A" });
  const out = trimmedIds(items, { A: { trim: 3 } }, topics, (id) => (id === "mine" ? { mine: true } : {}));
  assert.equal(out.size, 1, "the floor ignored the student's line");
  assert.ok(!out.has("mine"));
});

// ── editing a line in place ──────────────────────────────────────────────────────────────────
const editable = () => ({
  concepts: [
    { term: "Softmax", def: "Turns scores into a distribution.", src: "Slide 3", conf: "med" },
    { term: "Star line", def: "Checked against a past exam.", src: "Past exam 2024 Q5", conf: "high", verified: true },
  ],
  questions: [{ q: "Why scale?", a: "Gradient stability.", src: "Slide 4", conf: "med" }],
  formulas: [] as unknown[],
});

ok("identity comes from what the line says, not where it sits", () => {
  assert.equal(editKey({ term: "Softmax" }, "concepts"), "concepts|softmax");
  assert.equal(editKey({ q: "Why scale?" }, "questions"), "questions|why scale?");
  // Case and padding must not change identity — the same line typed differently is the same line.
  assert.equal(editKey({ term: "  SOFTMAX  " }, "concepts"), "concepts|softmax");
  assert.equal(editKey({ term: "" }, "concepts"), undefined);
  assert.equal(editKey(null, "concepts"), undefined);
});

ok("an edit rewrites the right line and marks it the student's", () => {
  const out = applyEdit(editable(), "concepts|softmax", { a: "Softmax", b: "MY OWN WORDS." });
  const c = out.concepts[0] as Record<string, unknown>;
  assert.equal(c.def, "MY OWN WORDS.");
  assert.equal(c.mine, true);
  assert.equal(c.src, "Slide 3", "the provenance trail was thrown away");
  // The untouched line is untouched.
  assert.equal((out.concepts[1] as Record<string, unknown>).mine, undefined);
});

ok("editing a verified line takes its star away", () => {
  // The star said Clutch checked THIS sentence. It no longer applies to these words.
  const out = applyEdit(editable(), "concepts|star line", { a: "Star line", b: "I rewrote it." });
  const c = out.concepts[1] as Record<string, unknown>;
  assert.equal(c.verified, undefined, "an edited line kept the verified star");
  assert.equal(c.conf, "med", "an edited line kept high confidence it no longer earns");
  assert.equal(c.mine, true);
});

ok("a question edit writes q and a, not term and def", () => {
  const out = applyEdit(editable(), "questions|why scale?", { a: "Why divide by sqrt(d_k)?", b: "To keep gradients stable." });
  const q = out.questions[0] as Record<string, unknown>;
  assert.equal(q.q, "Why divide by sqrt(d_k)?");
  assert.equal(q.a, "To keep gradients stable.");
  assert.equal(q.mine, true);
});

ok("a key that matches nothing changes nothing", () => {
  // Fails safe: a stale key must never edit a neighbouring line.
  const before = editable();
  const after = applyEdit(before, "concepts|gone", { a: "x", b: "y" });
  assert.deepEqual(after.concepts, before.concepts);
  assert.deepEqual(applyEdit(before, "tables|anything", { a: "x", b: "y" }).concepts, before.concepts);
});

ok("an edited line can be found again by its NEW text", () => {
  const out = applyEdit(editable(), "concepts|softmax", { a: "Softmax (mine)", b: "Rewritten." });
  assert.equal(editKey(out.concepts[0], "concepts"), "concepts|softmax (mine)");
  // And the old key no longer matches, so a second edit with it is refused rather than misapplied.
  assert.deepEqual(applyEdit(out, "concepts|softmax", { a: "z", b: "z" }).concepts, out.concepts);
});

console.log(`${n} checks passed`);
