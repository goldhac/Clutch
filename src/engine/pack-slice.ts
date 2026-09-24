/**
 * pack-slice.ts — give one episode only its own topic's material (#6).
 *
 * A series stores the whole upload as one `pack_text`, the same format the sheet engine writes:
 *
 *     ===== lecture-3.pdf [slides] =====
 *     …that file's text…
 *
 *     ===== lecture-4.pdf [slides] =====
 *     …
 *
 * `loadJob` used to hand the worker that entire string, so every episode in a series was written
 * from the whole course. The topic split decided nothing. This recovers a topic's own section by
 * the filename headers the pack was built with.
 *
 * Splitting on the header rather than storing per-file text keeps one source of truth: the pack a
 * sheet is already generated from is the pack an episode is spoken from, so a student who made
 * both cannot get two different readings of the same lecture.
 */

/** The header `/api/generate` writes. Captures the filename so a topic can claim its section. */
const HEADER = /^=====\s*(.+?)\s*\[[^\]]*\]\s*=====$/;

export interface PackSection {
  filename: string;
  /** The header line plus the file's text — what the model should see, unchanged. */
  block: string;
}

/** Break a pack back into the files it was built from, in order. */
export function packSections(packText: string): PackSection[] {
  const out: PackSection[] = [];
  let current: PackSection | null = null;
  for (const line of packText.split("\n")) {
    const m = HEADER.exec(line.trim());
    if (m) {
      if (current) out.push(current);
      current = { filename: m[1], block: line };
      continue;
    }
    if (current) current.block += `\n${line}`;
  }
  if (current) out.push(current);
  return out;
}

/**
 * The material for one topic: the sections whose filenames the topic claims, in pack order.
 *
 * Falls back to the whole pack when nothing matches. A topic with no recoverable text would make
 * an episode about nothing, and the old behaviour — the whole course — at least teaches something
 * real. The caller is told, so a silent fallback never passes for a working split.
 */
export function packTextFor(
  packText: string,
  files: string[],
): { text: string; matched: string[]; missing: string[]; fellBack: boolean } {
  const want = new Set(files);
  const sections = packSections(packText);
  const taken = sections.filter((s) => want.has(s.filename));
  const matched = taken.map((s) => s.filename);
  const missing = files.filter((f) => !matched.includes(f));
  if (!taken.length) return { text: packText, matched, missing, fellBack: true };
  return { text: taken.map((s) => s.block).join("\n\n"), matched, missing, fellBack: false };
}
