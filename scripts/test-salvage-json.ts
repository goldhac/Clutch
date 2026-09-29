/**
 * test-salvage-json.ts — keep the sheet that arrived when the model was cut off (#10).
 *   npx tsx scripts/test-salvage-json.ts
 *
 * The rule being protected: salvage may only ever TRUNCATE and CLOSE. It must never invent a
 * value, never repair malformed JSON, and never touch output that was already fine — a model
 * writing genuine nonsense is a different problem with a different answer, and quietly fixing it
 * would hide a real defect.
 */
import assert from "node:assert/strict";
import { salvageTruncatedJson, wasTruncated } from "@/engine/salvage-json";
import { tryParseJsonAndValidate } from "@/engine/rank";

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log(`  ok  ${name}`); };

const SHEET = {
  title: "NLP Final",
  topics: [{ id: "t1", name: "Attention" }, { id: "t2", name: "Parsing" }],
  questions: [
    { topic: "t1", q: "What does softmax over QK^T produce?", a: "Attention weights.", kind: "short" },
    { topic: "t1", q: "Why scale by sqrt(d_k)?", a: "To keep gradients stable.", kind: "short" },
    { topic: "t2", q: "What is arc-standard?", a: "A transition system.", kind: "short" },
  ],
};
const full = JSON.stringify(SHEET);

ok("valid JSON is left completely alone", () => {
  const r = salvageTruncatedJson(full);
  assert.equal(r.text, null, "it rewrote output that was already fine");
});

ok("a response cut mid-item keeps the complete items", () => {
  // Cut inside the last question's answer.
  const cut = full.slice(0, full.indexOf('"What is arc-standard?"') + 10);
  const r = salvageTruncatedJson(cut);
  assert.ok(r.text, "nothing was salvaged from a recoverable truncation");
  const parsed = JSON.parse(r.text) as typeof SHEET;
  assert.equal(parsed.title, "NLP Final");
  assert.equal(parsed.questions.length, 2, "it did not keep exactly the whole items");
  assert.equal(parsed.questions[1].a, "To keep gradients stable.");
  assert.ok(r.discarded > 0);
});

ok("a response cut mid-string does not keep half a word", () => {
  const cut = full.slice(0, full.indexOf("To keep gradients") + 8); // mid-answer
  const r = salvageTruncatedJson(cut);
  assert.ok(r.text);
  const parsed = JSON.parse(r.text) as typeof SHEET;
  // The half-written question must be gone entirely, not present with a truncated answer.
  assert.equal(parsed.questions.length, 1);
  assert.equal(parsed.questions[0].q, "What does softmax over QK^T produce?");
});

ok("a string containing braces or quotes does not confuse the scan", () => {
  const tricky = JSON.stringify({
    title: "T",
    items: [
      { q: 'He said "use {this}" and [that]', a: "ok" },
      { q: "second", a: "fine" },
    ],
  });
  assert.equal(salvageTruncatedJson(tricky).text, null, "valid input was altered");
  const cut = tricky.slice(0, tricky.indexOf('"second"') + 4);
  const r = salvageTruncatedJson(cut);
  assert.ok(r.text);
  const parsed = JSON.parse(r.text) as { items: { q: string }[] };
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].q, 'He said "use {this}" and [that]', "a brace inside a string broke the scan");
});

ok("an escaped quote before the cut is handled", () => {
  const esc = JSON.stringify({ a: [{ q: 'say \\"hi\\"' }, { q: "next" }] });
  const cut = esc.slice(0, esc.indexOf('"next"') + 3);
  const r = salvageTruncatedJson(cut);
  assert.ok(r.text);
  assert.equal((JSON.parse(r.text) as { a: unknown[] }).a.length, 1);
});

ok("genuinely malformed output is refused, not repaired", () => {
  assert.equal(salvageTruncatedJson('{"a": ,,, }').text, null);
  assert.equal(salvageTruncatedJson("this is not json at all").text, null);
  assert.equal(salvageTruncatedJson("").text, null);
  assert.equal(salvageTruncatedJson("   ").text, null);
});

ok("a truncation with nothing complete yet yields nothing", () => {
  // Cut before the first item ever closed.
  assert.equal(salvageTruncatedJson('{"title": "NLP Fin').text, null);
});

ok("nested containers are closed in the right order", () => {
  const deep = JSON.stringify({ a: { b: [{ c: [1, 2] }, { c: [3] }] } });
  const cut = deep.slice(0, deep.indexOf("{\"c\":[3]") + 6);
  const r = salvageTruncatedJson(cut);
  assert.ok(r.text, "a nested truncation was not recovered");
  const parsed = JSON.parse(r.text) as { a: { b: unknown[] } };
  assert.equal(parsed.a.b.length, 1);
});

ok("the provider's own truncation signal is recognised", () => {
  assert.equal(wasTruncated("MAX_TOKENS"), true);
  assert.equal(wasTruncated("max_tokens"), true);
  assert.equal(wasTruncated("length"), true);
  assert.equal(wasTruncated("STOP"), false);
  assert.equal(wasTruncated("SAFETY"), false);
  assert.equal(wasTruncated(undefined), false);
});

ok("salvage never grows the document", () => {
  const cut = full.slice(0, full.length - 40);
  const r = salvageTruncatedJson(cut);
  if (r.text) assert.ok(r.text.length <= cut.length + 8, "it added more than closing brackets");
});

// ── end to end through the real validator ───────────────────────────────────────────────────
ok("a truncated real sheet still ships, and still passes every rule", () => {
  // Shapes taken from a real production sheet (2026-09-29), not invented: examFormat is an
  // object, a topic carries name/why/src, a question carries q/kind/a/src/conf/topic.
  const q = (i: number) => ({
    q: `Question ${i}: what does this mechanism produce?`,
    kind: "short",
    a: `Answer ${i}.`,
    src: "21-attn.pdf p3",
    conf: "med",
    topic: "Attention",
  });
  const sheet = {
    title: "NLP Final",
    examFormat: { mix: "Mixed format.", time: "Not specified", openBook: false, notes: "From slides." },
    topics: [{ name: "Attention", why: "Core mechanism, its own lecture.", src: "21-attn.pdf" }],
    formulas: [], concepts: [], tables: [], traps: [],
    questions: [q(1), q(2), q(3)],
  };
  const full = JSON.stringify(sheet);
  const cut = full.slice(0, full.indexOf("Question 3") + 6);
  const r = tryParseJsonAndValidate(cut, 3);
  assert.ok(r.ok, `a recoverable truncation was thrown away: ${r.ok ? "" : r.error}`);
  assert.equal(r.value.questions.length, 2, "it kept a partial question");
  assert.equal(r.value.questions[1].a, "Answer 2.");
});

ok("an early cut still ships what arrived — the fill pass completes it", () => {
  // Deliberate: we cannot tell how much the model meant to write, and a retry after an output
  // ceiling lands in the same place. A short valid sheet goes through deepen and reaches the
  // 160-line target from the same pack; a 422 gives the student nothing after ~185 s.
  const q = (i: number) => ({ q: `Question ${i}: what is it?`, kind: "short", a: `Answer ${i}.`, src: "f.pdf p1", conf: "med", topic: "Attention" });
  const sheet = {
    title: "NLP Final",
    examFormat: { mix: "Mixed format.", time: "Not specified", openBook: false, notes: "From slides." },
    topics: [{ name: "Attention", why: "Core mechanism.", src: "f.pdf" }],
    formulas: [], concepts: [], tables: [], traps: [],
    questions: Array.from({ length: 40 }, (_, i) => q(i)),
  };
  const full = JSON.stringify(sheet);
  const r = tryParseJsonAndValidate(full.slice(0, Math.floor(full.length * 0.2)), 3);
  assert.ok(r.ok, "an early truncation was thrown away instead of being topped up later");
  assert.ok(r.value.questions.length >= 1);
  assert.ok(r.value.questions.length < 40, "it somehow kept everything");
  // Every kept item is whole — no half-written question reached the sheet.
  for (const x of r.value.questions) assert.ok(x.q && x.a, "a partial question survived");
});

ok("the failure message shows the END of the output, where a truncation actually is", () => {
  const r = tryParseJsonAndValidate('{"title":"x","questions":[{"q":"aaaa', 3);
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.error.includes("Last 200 chars"), "still quoting the first 200 chars");
});

console.log(`${n} checks passed`);
