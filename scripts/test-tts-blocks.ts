/**
 * test-tts-blocks.ts — the voice-swap workaround, tested without spending anything (#4).
 *   npx tsx scripts/test-tts-blocks.ts
 *
 * The provider bug: a block that OPENS with speaker B comes back with the voices reversed, 3 takes
 * out of 3. Everything here defends the one invariant that avoids it — no block ever opens with B —
 * against the real approved script and against the shapes that tempt the splitter to break it.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { PodcastLine } from "@/contract/podcast-script";
import { PREVIEW_SECONDS, cutPreview, toBlocks, writeWav } from "@/engine/tts";

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log(`  ok  ${name}`); };
const L = (speaker: "A" | "B", kind: string, text: string, beat = 0): PodcastLine =>
  ({ speaker, kind, text, beat }) as PodcastLine;

const REAL: PodcastLine[] = JSON.parse(
  readFileSync("scripts/phase0/out/source-p1-2026-09-19T19-22-01/script.json", "utf8"),
).lines;

ok("no block of the real episode opens with B", () => {
  const blocks = toBlocks(REAL);
  const bad = blocks.map((b, i) => ({ i, first: b.lines[0] })).filter((x) => x.first.speaker === "B");
  assert.equal(bad.length, 0, `blocks opening with B: ${bad.map((x) => `#${x.i} "${x.first.text.slice(0, 40)}"`).join(", ")}`);
  assert.ok(blocks.length > 10, `expected the episode to split into many blocks, got ${blocks.length}`);
});
ok("every line survives the split, in order", () => {
  const flat = toBlocks(REAL).flatMap((b) => b.lines);
  assert.equal(flat.length, REAL.length);
  assert.deepEqual(flat.map((l) => l.text), REAL.map((l) => l.text));
});
ok("no block exceeds the character budget by more than one line", () => {
  for (const b of toBlocks(REAL)) {
    const chars = b.lines.reduce((sum, l) => sum + l.text.length + 11, 0);
    const withoutLast = chars - (b.lines[b.lines.length - 1].text.length + 11);
    assert.ok(withoutLast <= 1500, `block of ${chars} chars (${withoutLast} before its last line)`);
  }
});
ok("a retrieval question gets a real pause after it", () => {
  const blocks = toBlocks(REAL);
  const qBlocks = blocks.filter((b) => b.lines.some((l) => l.kind === "retrieval-question"));
  assert.ok(qBlocks.length > 0, "the episode has retrieval beats");
  assert.ok(qBlocks.every((b) => b.pauseAfterMs >= 2000), "each must be followed by a listener pause");
});
ok("a B line at a block boundary carries its A line along", () => {
  // The exact shape the carry exists for: a long A/B run that must split where B would lead.
  const lines: PodcastLine[] = [];
  for (let i = 0; i < 14; i++) {
    lines.push(L("A", "mechanism", "A".repeat(120) + ` ${i}`, 0));
    lines.push(L("B", "confusion", "B".repeat(120) + ` ${i}`, 0));
  }
  const blocks = toBlocks(lines);
  assert.ok(blocks.length > 1, "this must split into several blocks");
  for (const [i, b] of blocks.entries()) assert.equal(b.lines[0].speaker, "A", `block #${i} opens with B`);
});
ok("a new beat starting on B still opens with A", () => {
  const lines: PodcastLine[] = [
    L("A", "open", "Welcome in.", 0),
    L("B", "open", "Glad to be here.", 0),
    L("A", "mechanism", "Here is the mechanism.", 0),
    L("B", "confusion", "But why does that hold?", 1),
    L("A", "mechanism", "Because of the weights.", 1),
  ];
  for (const [i, b] of toBlocks(lines).entries()) assert.equal(b.lines[0].speaker, "A", `block #${i} opens with B`);
});
ok("writeWav produces a valid 16-bit mono header", () => {
  const pcm = new Uint8Array(480);
  const wav = writeWav(pcm, 24000);
  const b = Buffer.from(wav);
  assert.equal(b.toString("ascii", 0, 4), "RIFF");
  assert.equal(b.toString("ascii", 8, 12), "WAVE");
  assert.equal(b.readUInt16LE(22), 1, "channels");
  assert.equal(b.readUInt32LE(24), 24000, "sample rate");
  assert.equal(b.readUInt16LE(34), 16, "bit depth");
  assert.equal(b.readUInt32LE(4), 36 + pcm.length, "RIFF size");
  assert.equal(wav.length, 44 + pcm.length);
});

ok("the preview is the first 90 seconds, and never more", () => {
  const rate = 24000;
  const fiveMinutes = new Uint8Array(300 * rate * 2);
  const clip = cutPreview(fiveMinutes, rate);
  assert.equal(clip.length / (rate * 2), PREVIEW_SECONDS, "a long episode is cut to 90s");
  assert.ok(clip.length < fiveMinutes.length / 3, "and is a small fraction of the whole");
  const short = new Uint8Array(40 * rate * 2);
  assert.equal(cutPreview(short, rate).length, short.length, "a short episode previews as itself");
});

console.log(`\n${n} checks passed`);
