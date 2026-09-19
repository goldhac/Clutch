/**
 * test-podcast-checks.ts — the soft rules, proved to fire (#3).
 *   npx tsx scripts/test-podcast-checks.ts
 *
 * The approved round-4 script passes every check, which is necessary but proves nothing on its
 * own: a port that always returns [] would also pass. So each rule is tested by BREAKING the real
 * script in exactly one way and asserting that rule — and, where it matters, only that rule — fires.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { safeParsePodcastOutline, type PodcastOutline } from "@/contract/podcast-outline";
import type { PodcastLine } from "@/contract/podcast-script";
import { cueFound, scriptIssues } from "@/engine/podcast-checks";

const DIR = "scripts/phase0/out/21-attn-r4-2026-09-15T21-44-42";
const parsed = safeParsePodcastOutline(JSON.parse(readFileSync(`${DIR}/outline.json`, "utf8")));
assert.equal(parsed.success, true, "the real outline must satisfy the outline contract");
const outline = parsed.data as PodcastOutline;
const REAL: PodcastLine[] = JSON.parse(readFileSync(`${DIR}/script.json`, "utf8")).lines;
const TARGET = 24 * 160;

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log(`  ok  ${name}`); };
const clone = (): PodcastLine[] => JSON.parse(JSON.stringify(REAL));
const fires = (lines: PodcastLine[], tag: string) => {
  const issues = scriptIssues(lines, TARGET, outline);
  assert.ok(issues.some((i) => i.startsWith(tag)), `expected ${tag}; got: ${issues.map((i) => i.split(":")[0]).join(", ") || "nothing"}`);
};

ok("the approved script passes every check", () => {
  assert.deepEqual(scriptIssues(REAL, TARGET, outline), []);
});
ok("LENGTH fires on a short draft", () => fires(clone().slice(0, 60), "LENGTH"));
ok("WRITTEN FOR THE EYE fires on a formula left as symbols", () => {
  const ls = clone(); ls[20].text = "The score is softmax(QK^T / √d_k) over the values.";
  fires(ls, "WRITTEN FOR THE EYE");
});
ok("RHYTHM fires when every turn is a paragraph", () => {
  const ls = clone();
  ls.forEach((l) => { l.text = "This is a deliberately long turn that keeps going well past the point where a listener would want a reaction from the other host, and then goes on further still to be sure."; });
  fires(ls, "RHYTHM");
});
ok("BALANCE fires when B is reduced to prompts", () => {
  const ls = clone();
  ls.forEach((l) => { if (l.speaker === "B") l.text = "Right."; });
  fires(ls, "BALANCE");
});
ok("FILLER fires on bare acknowledgements", () => {
  const ls = clone();
  ls.forEach((l, i) => { if (i % 4 === 0) l.text = "Exactly."; });
  fires(ls, "FILLER");
});
ok("SPINE fires when the running example is dropped", () => {
  const kw = outline.spine.keyword.toLowerCase();
  const ls = clone();
  ls.forEach((l) => { l.text = l.text.replace(new RegExp(kw, "gi"), "the thing"); });
  fires(ls, "SPINE");
});
ok("CURIOSITY fires when B stops pushing back", () => {
  const ls = clone();
  ls.forEach((l) => { if (l.speaker === "B") l.text = l.text.replace(/\b(wait|hold on|hang on|but doesn'?t|but isn'?t|isn'?t that just)\b/gi, "so"); });
  fires(ls, "CURIOSITY");
});
ok("ANNOUNCER fires on a narrated transition", () => {
  const ls = clone(); ls[40].text = "Now let's move on to the coverage vector.";
  fires(ls, "ANNOUNCER");
});
ok("MUST-SAY fires when a promised item is never said", () => {
  const cue = outline.must_say[0].spoken_cue;
  const ls = clone();
  const words = cue.replace(/[-_]/g, " ").split(/\s+/).filter((w) => w.length > 2);
  ls.forEach((l) => { words.forEach((w) => { l.text = l.text.replace(new RegExp(w, "gi"), "something"); }); });
  fires(ls, "MUST-SAY");
});
ok("AIRTIME fires when one section eats the episode", () => {
  const big = outline.sections.reduce((a, b) => (a.weight > b.weight ? a : b));
  const idx = outline.beats.findIndex((b) => b.section !== big.name && b.kind !== "open");
  const ls = clone();
  ls.forEach((l) => { if (l.beat !== 0) l.beat = idx; });
  fires(ls, "AIRTIME");
});
ok("TRUST fires on a claim about what is on the exam", () => {
  const ls = clone(); ls[30].text = "This will definitely be on the exam.";
  fires(ls, "TRUST");
});
ok("INTRO fires when the welcome is gone", () => {
  const ls = clone();
  ls.forEach((l) => { if (l.beat === 0) l.text = l.text.replace(/welcome/gi, "hello"); });
  fires(ls, "INTRO");
});

// cueFound is the piece that made a correct line fail in round 4 ("d_k" vs "d k").
ok("cueFound matches across hyphens and inflections", () => {
  assert.equal(cueFound("scaled by the square root of d k", "square root of d-k"), true);
  assert.equal(cueFound("the outputs are concatenated together", "concatenate"), true);
  assert.equal(cueFound("nothing like it here", "square root of d-k"), false);
});

console.log(`\n${n} checks passed`);
