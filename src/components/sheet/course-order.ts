/**
 * course-order.ts — put topic groups in the order the COURSE taught them (issue #12).
 *
 * Ranking still decides WHAT earns a place (the fitter picks by score across the
 * whole pool, whatever order groups render in). This only decides WHERE a topic
 * sits, because a student who remembers "that was early in the course" should
 * find it early on the sheet — sheets ordered like the course materials
 * correlated with ~13% higher exam scores in a content analysis of student
 * support sheets (ASEE, "Do support sheets actually support students?").
 *
 * No engine call: every topic already cites where it came from
 * ("22-bert.pdf p18-28; 23-pretrained.pdf p2"). The position is read from the
 * citation that points at course material — not at the past exam or review
 * sheet, which the engine lists first because they carry the most authority.
 */
import type { Topic } from "@/contract/sheet-content";

/** Tags that are the course itself, in teaching order. Everything else is about the exam. */
const COURSE_TAGS = new Set(["slides", "notes", "textbook", "lecture", "transcript"]);

const stemOf = (name: string) => name.toLowerCase().replace(/\.[a-z0-9]{1,5}$/, "");

/** "Chapter 03_final" → 3 · "8-parsing" → 8 · "lecture-06" → 6 · "notes" → null */
function sequenceNumber(name: string): number | null {
  const s = stemOf(name);
  const labelled = /(?:lecture|lec|chapter|chap|ch|week|wk|unit|module|mod|session|class|part|topic|l)[\s._-]*0*(\d{1,3})(?!\d)/.exec(s);
  if (labelled) return Number(labelled[1]);
  const leading = /^0*(\d{1,3})(?!\d)/.exec(s);
  if (leading) return Number(leading[1]);
  return null;
}

/** First page / slide number mentioned in one citation part. */
function pageNumber(part: string): number {
  const m = /(?:\bpp?\.?|\bpages?|\bslides?|\bsl\.?|\bs)\s*0*(\d{1,4})/i.exec(part);
  return m ? Number(m[1]) : 0;
}

/** The filename a citation part starts with — names may contain spaces ("Chapter 03_final.pptx"). */
function citedName(part: string): string {
  return /^(.*?\.(?:pdf|pptx?|docx?|md|txt))\b/i.exec(part)?.[1] ?? part.split(/[\s,]/)[0];
}

/** Is this file about the EXAM rather than the course? "_final" in "Chapter 03_final" is not. */
const EXAMISH = /(^|[^a-z])(exam|review|quiz|midterm|homework|hw\d*)([^a-z]|$)|final[\s_-]*exam/;

interface Position { course: 0 | 1; file: number; page: number }

export function courseOrder(topics: Topic[], files: { name: string; tag: string }[] = []): number[] {
  const identity = topics.map((_, i) => i);
  if (topics.length < 2) return identity;

  // Teaching order of the pack's files: by the number in the name, else upload order.
  const ranked = files
    .map((f, upload) => ({ ...f, upload, stem: stemOf(f.name), seq: sequenceNumber(f.name) }))
    .sort((a, b) => (a.seq ?? 1e6) - (b.seq ?? 1e6) || a.upload - b.upload);
  const fileIndex = new Map(ranked.map((f, i) => [f.stem, i]));

  const positionOf = (topic: Topic): Position | null => {
    let best: Position | null = null;
    for (const part of topic.src.split(";")) {
      const p = part.trim().toLowerCase();
      if (!p) continue;
      // Exact filename first. The engine sometimes shortens one ("lecture-database…"), so fall back
      // to the file sharing the longest prefix — but only a long one: "chapter 0" is shared by every
      // chapter file and must never decide the match.
      let file = ranked.find((f) => p.includes(f.stem));
      if (!file) {
        let bestLen = 0;
        for (const f of ranked) {
          let n = 0;
          while (n < f.stem.length && n < p.length && f.stem[n] === p[n]) n++;
          if (n >= 10 && n >= f.stem.length * 0.6 && n > bestLen) { bestLen = n; file = f; }
        }
      }
      let pos: Position | null = null;
      if (file) {
        pos = { course: COURSE_TAGS.has(file.tag) ? 0 : 1, file: fileIndex.get(file.stem)!, page: pageNumber(p.replace(file.stem, "")) };
      } else {
        // No pack metadata (saved or sample sheets): read the sequence straight from the citation.
        const seq = sequenceNumber(citedName(p));
        if (seq !== null) pos = { course: EXAMISH.test(citedName(p)) ? 1 : 0, file: seq, page: pageNumber(p) };
      }
      if (!pos) continue;
      if (!best || pos.course < best.course || (pos.course === best.course && (pos.file < best.file || (pos.file === best.file && pos.page < best.page)))) {
        best = pos;
      }
    }
    return best;
  };

  const positions = topics.map(positionOf);
  // Nothing in the citations says where topics sit in the course: keep priority order.
  if (positions.filter((p) => p && p.course === 0).length < 2) return identity;

  return identity.sort((a, b) => {
    const pa = positions[a], pb = positions[b];
    if (!pa || !pb) return pa ? -1 : pb ? 1 : a - b; // unplaced topics keep their rank, after the placed ones
    return pa.course - pb.course || pa.file - pb.file || pa.page - pb.page || a - b;
  });
}

/** "Chapter 03_final" → "Ch" · "lecture-06" → "Lec" · "8-parsing" → "" (a bare number says enough). */
function sequenceWord(name: string): string {
  const s = stemOf(name);
  if (/chapter|chap|\bch[\s._-]*\d/.test(s)) return "Ch ";
  if (/lecture|\blec[\s._-]*\d|\bl[\s._-]*\d/.test(s)) return "Lec ";
  if (/week|\bwk[\s._-]*\d/.test(s)) return "Wk ";
  if (/unit/.test(s)) return "Unit ";
  if (/module|\bmod[\s._-]*\d/.test(s)) return "Mod ";
  if (/session|class/.test(s)) return "Class ";
  return "";
}

/**
 * The small locator on each topic banner: where in the course this topic lives.
 *   "22 · p18"   one file, first page        "Ch 3–5"   several chapters
 * Read from the topic's course citations only (never the exam/review ones); null when the
 * citations carry no sequence — a wrong chapter label is worse than none.
 */
export function topicSpans(topics: Topic[], files: { name: string; tag: string }[] = []): (string | null)[] {
  const known = files.map((f) => ({ ...f, stem: stemOf(f.name) }));
  return topics.map((topic) => {
    const hits: { seq: number; word: string; page: number; unit: string }[] = [];
    for (const part of topic.src.split(";")) {
      const p = part.trim().toLowerCase();
      if (!p || EXAMISH.test(citedName(p))) continue;
      const file = known.find((f) => p.includes(f.stem));
      if (file && !COURSE_TAGS.has(file.tag)) continue;
      const name = file ? file.name : citedName(p);
      const seq = sequenceNumber(name);
      if (seq === null) continue;
      const rest = p.replace(stemOf(name), "");
      hits.push({ seq, word: sequenceWord(name), page: pageNumber(rest), unit: /\bslides?\b|\bsl\b/.test(rest) ? "s" : "p" });
    }
    if (!hits.length) return null;
    hits.sort((a, b) => a.seq - b.seq || a.page - b.page);
    const first = hits[0], last = hits[hits.length - 1];
    if (first.seq !== last.seq) return `${first.word}${first.seq}–${last.seq}`;
    return first.page ? `${first.word}${first.seq} · ${first.unit}${first.page}` : `${first.word}${first.seq}`;
  });
}
