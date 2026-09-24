/**
 * test-topic-split.ts — the split a student sees before spending anything (#6).
 *   npx tsx scripts/test-topic-split.ts
 *
 * A wrong split is the most expensive failure in the product: it spends a whole episode's credits
 * on something that was never a topic. Deterministic, no model calls.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import type { FileTag } from "@/engine/prompt";
import { MAX_EPISODE_MINUTES, MIN_TOPIC_MINUTES, splitTopics, subjectKey, titleOf, type SourceFile } from "@/engine/topic-split";

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log(`  ok  ${name}`); };
/** ~1,100 chars is a minute of audio; this makes a file of a given length. */
const file = (filename: string, minutes: number, tag: FileTag = "slides"): SourceFile =>
  ({ filename, tag, text: "x".repeat(Math.round(minutes * 1100)) });

ok("a lecture number is not a subject", () => {
  assert.equal(subjectKey("12-mt.pdf"), "mt");
  assert.equal(subjectKey("21-attn.pdf"), "attn");
  assert.equal(subjectKey("Lecture 4.pdf"), "4");
  assert.equal(titleOf("15-embeddings.pdf"), "Embeddings");
});

ok("one file is one topic", () => {
  const { topics } = splitTopics([file("21-attn.pdf", 20), file("14-srl.pdf", 18)]);
  assert.equal(topics.length, 2);
  assert.ok(topics.every((t) => !t.merged));
});

ok("a two-part lecture is ONE topic, not two half-episodes", () => {
  const { topics } = splitTopics([file("12-mt.pdf", 11), file("13-mt.pdf", 12), file("14-srl.pdf", 15)]);
  assert.equal(topics.length, 2, `expected mt to be one topic, got ${topics.map((t) => t.title).join(", ")}`);
  assert.deepEqual(topics[0].files, ["12-mt.pdf", "13-mt.pdf"]);
  assert.equal(topics[0].merged, "same subject");
});

ok("the same subject NOT consecutive stays separate", () => {
  // Course order matters: a subject revisited weeks later is a different episode.
  const { topics } = splitTopics([file("12-mt.pdf", 11), file("14-srl.pdf", 15), file("20-mt.pdf", 11)]);
  assert.equal(topics.length, 3);
});

ok("a topic too thin to fill five minutes merges", () => {
  const { topics, notes } = splitTopics([file("1-intro-tagging.pdf", 2), file("2-languagemodeling.pdf", 14)]);
  assert.equal(topics.length, 1);
  assert.equal(topics[0].merged, "too thin");
  assert.ok(topics[0].materialMinutes >= MIN_TOPIC_MINUTES);
  assert.ok(notes.some((x) => /too thin to be worth listening/.test(x)), "the student is told why");
});

ok("two thin neighbours join each other, not the long one", () => {
  const { topics } = splitTopics([file("a-one.pdf", 20), file("b-two.pdf", 3), file("c-three.pdf", 3)]);
  assert.equal(topics.length, 2);
  assert.equal(topics[0].files.length, 1, "the 20-minute topic stays alone");
  assert.deepEqual(topics[1].files, ["b-two.pdf", "c-three.pdf"]);
});

ok("no topic is left under the minimum", () => {
  const { topics } = splitTopics([file("a.pdf", 2), file("b.pdf", 2), file("c.pdf", 2)]);
  assert.ok(topics.every((t) => t.materialMinutes >= MIN_TOPIC_MINUTES), topics.map((t) => `${t.title}:${t.materialMinutes}`).join(" "));
});

ok("review material orders the topics and is not made into an episode", () => {
  const files: SourceFile[] = [
    file("12-mt.pdf", 12),
    file("21-attn.pdf", 12),
    { filename: "exam-review.pdf", tag: "review", text: "attn attn attn attention is everywhere on this exam" },
  ];
  const { topics, notes } = splitTopics(files);
  assert.equal(topics.length, 2, "the review sheet is not an episode");
  assert.ok(!topics.some((t) => t.files.includes("exam-review.pdf")));
  const attn = topics.find((t) => t.title === "Attn")!;
  assert.ok(attn.examMentions > 0, "the review sheet mentions it");
  assert.equal(attn.priority, "T1", "so it is first to listen to");
  assert.ok(notes.some((x) => /review material mentions it most/.test(x)));
});

ok("every topic gets a priority, and T1 is the smallest band", () => {
  const { topics } = splitTopics(Array.from({ length: 9 }, (_, i) => file(`${i + 1}-topic${i}.pdf`, 12)));
  assert.equal(topics.length, 9);
  assert.ok(topics.every((t) => ["T1", "T2", "T3"].includes(t.priority)));
  assert.equal(topics.filter((t) => t.priority === "T1").length, 3);
});

ok("nothing to teach is said plainly, not crashed on", () => {
  const { topics, notes } = splitTopics([{ filename: "exam.pdf", tag: "past_exam", text: "only an exam" }]);
  assert.equal(topics.length, 0);
  assert.ok(notes.some((x) => /No lecture material/.test(x)));
});

// ── The acceptance criterion: the real pack ────────────────────────────────────────────────
const DIR = "reference/exam-prep";
/** Measured with `ingestDocument(..., { vision: false })` — so the minutes below are real. */
const REAL_CHARS: Record<string, number> = {
  "CLUTCH.pdf": 35354, "1-introduction.pdf": 13013, "2-languagemodeling.pdf": 11033,
  "3-languagemodeling.pdf": 10516, "4-classification.pdf": 12041, "5-classification.pdf": 11662,
  "6-tagging.pdf": 10725, "7-tagging.pdf": 17458, "8-parsing.pdf": 13065, "9-parsing.pdf": 7677,
  "10-dependency.pdf": 6723, "11-dependency.pdf": 10048, "12-mt.pdf": 9429, "13-mt.pdf": 11984,
};
if (existsSync(DIR)) {
  ok("the real 14-file pack splits sensibly", () => {
    const names = readdirSync(DIR).filter((f) => f.endsWith(".pdf")).sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0)).slice(0, 14);
    // Length is what matters here, not content: use the real file sizes as a stand-in for depth.
    const files: SourceFile[] = names.map((filename) => ({
      filename,
      tag: "slides",
      // Real extracted lengths, measured with the ingest pass (vision off) on 2026-09-24.
      text: "x".repeat(REAL_CHARS[filename] ?? 11000),
    }));
    const { topics, notes } = splitTopics(files);
    console.log(`\n      ${names.length} files → ${topics.length} topics`);
    for (const t of topics) {
      console.log(`      ${t.priority}  ${t.title.padEnd(20)} episode ${String(t.episodeMinutes).padStart(2)} min  (material ${String(t.materialMinutes).padStart(5)})  ${t.files.join(" + ")}${t.merged ? `  ${t.merged}` : ""}`);
    }
    notes.slice(0, 3).forEach((x) => console.log(`      note: ${x}`));
    assert.ok(topics.length >= 5 && topics.length < names.length, `expected fewer topics than files, got ${topics.length}`);
    assert.ok(topics.every((t) => t.materialMinutes >= MIN_TOPIC_MINUTES), "no topic under the minimum");
    assert.ok(topics.every((t) => t.episodeMinutes >= MIN_TOPIC_MINUTES && t.episodeMinutes <= MAX_EPISODE_MINUTES), "every episode is a listenable length");
    // The pairs the pack really contains must be recognised.
    const pairs = topics.filter((t) => t.merged === "same subject").map((t) => t.title);
    assert.ok(pairs.length >= 2, `expected the two-part lectures to be found, got ${pairs.join(", ") || "none"}`);
    console.log("");
  });
} else {
  console.log("  --  skipped the real pack (reference/exam-prep not present)");
}

console.log(`${n} checks passed`);
