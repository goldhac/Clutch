/**
 * test-pack-slice.ts — each episode speaks from its own topic, not the whole course (#6).
 *   npx tsx scripts/test-pack-slice.ts
 *
 * Before this, `loadJob` handed the worker the entire pack and a fixed 24 minutes, so the topic
 * split decided nothing. These checks are what stop that regressing. Deterministic, no model calls.
 */
import assert from "node:assert/strict";
import { packSections, packTextFor } from "@/engine/pack-slice";

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log(`  ok  ${name}`); };

/** Exactly the format /api/generate writes (route.ts:189). */
const pack = (files: { name: string; tag: string; text: string }[]) =>
  files.map((f) => `===== ${f.name} [${f.tag}] =====\n${f.text}`).join("\n\n");

const P = pack([
  { name: "8-parsing.pdf", tag: "slides", text: "Dependency parsing.\nArc-standard transitions." },
  { name: "9-parsing.pdf", tag: "slides", text: "Graph-based parsing.\nEisner's algorithm." },
  { name: "21-attn.pdf", tag: "slides", text: "Scaled dot-product attention." },
  { name: "review.pdf", tag: "review", text: "Know attention and parsing." },
]);

ok("a pack breaks back into the files it was built from", () => {
  const s = packSections(P);
  assert.deepEqual(s.map((x) => x.filename), ["8-parsing.pdf", "9-parsing.pdf", "21-attn.pdf", "review.pdf"]);
  // The header stays on the block: the model should see which file it is reading.
  assert.ok(s[0].block.startsWith("===== 8-parsing.pdf [slides] ====="));
  assert.ok(s[0].block.includes("Arc-standard transitions."));
});

ok("a topic gets only its own files", () => {
  const r = packTextFor(P, ["8-parsing.pdf", "9-parsing.pdf"]);
  assert.equal(r.fellBack, false);
  assert.deepEqual(r.matched, ["8-parsing.pdf", "9-parsing.pdf"]);
  assert.ok(r.text.includes("Eisner's algorithm."));
  assert.ok(!r.text.includes("Scaled dot-product attention."), "another topic's lecture leaked in");
  assert.ok(!r.text.includes("Know attention and parsing."), "the review sheet leaked in");
});

ok("sections come back in pack order, not the order asked for", () => {
  const r = packTextFor(P, ["9-parsing.pdf", "8-parsing.pdf"]);
  assert.ok(r.text.indexOf("Arc-standard") < r.text.indexOf("Eisner"), "a two-part lecture must stay in order");
});

ok("a one-file topic gets one file", () => {
  const r = packTextFor(P, ["21-attn.pdf"]);
  assert.equal(r.matched.length, 1);
  assert.ok(r.text.includes("Scaled dot-product attention."));
  assert.ok(!r.text.includes("Dependency parsing."));
});

ok("a filename that is not in the pack is reported, not silently dropped", () => {
  const r = packTextFor(P, ["21-attn.pdf", "gone.pdf"]);
  assert.equal(r.fellBack, false);
  assert.deepEqual(r.missing, ["gone.pdf"]);
  assert.ok(r.text.includes("Scaled dot-product attention."));
});

ok("a topic matching nothing falls back to the whole pack AND says so", () => {
  const r = packTextFor(P, ["nothing.pdf"]);
  assert.equal(r.fellBack, true);
  assert.equal(r.text, P);
  assert.deepEqual(r.missing, ["nothing.pdf"]);
});

ok("a topic with no files falls back rather than returning nothing", () => {
  const r = packTextFor(P, []);
  assert.equal(r.fellBack, true);
  assert.equal(r.text, P);
});

ok("text that looks like a header inside a file does not split it", () => {
  const tricky = pack([
    { name: "a.pdf", tag: "slides", text: "Intro\n== not a header ==\nmore\n=====incomplete" },
    { name: "b.pdf", tag: "slides", text: "Second" },
  ]);
  assert.deepEqual(packSections(tricky).map((x) => x.filename), ["a.pdf", "b.pdf"]);
  assert.ok(packTextFor(tricky, ["a.pdf"]).text.includes("== not a header =="));
});

ok("filenames with spaces and brackets survive the round trip", () => {
  const odd = pack([
    { name: "Chapter 3 [final].pptx", tag: "slides", text: "Mixed methods" },
    { name: "b.pdf", tag: "notes", text: "Other" },
  ]);
  assert.deepEqual(packSections(odd).map((x) => x.filename), ["Chapter 3 [final].pptx", "b.pdf"]);
  const r = packTextFor(odd, ["Chapter 3 [final].pptx"]);
  assert.equal(r.fellBack, false);
  assert.ok(r.text.includes("Mixed methods"));
  assert.ok(!r.text.includes("Other"));
});

ok("an empty pack does not throw", () => {
  assert.deepEqual(packSections(""), []);
  assert.equal(packTextFor("", ["a.pdf"]).fellBack, true);
});

ok("every topic together accounts for the teaching files", () => {
  // What a real series does: the split covers the pack, and no two topics share a file.
  const split = [["8-parsing.pdf", "9-parsing.pdf"], ["21-attn.pdf"]];
  const seen = new Set<string>();
  for (const files of split) {
    const r = packTextFor(P, files);
    assert.equal(r.fellBack, false);
    for (const f of r.matched) {
      assert.ok(!seen.has(f), `${f} is in two episodes`);
      seen.add(f);
    }
  }
  assert.equal(seen.size, 3, "the review file is not an episode, the three lectures are");
});

console.log(`${n} checks passed`);
