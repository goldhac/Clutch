/**
 * pptx.ts — read PowerPoint decks: the text layer AND the picture layer.
 *
 * A .pptx is a zip of XML. Slide text lives in ppt/slides/slideN.xml as
 * <a:t> runs; pictures live in ppt/media/ and are referenced per-slide
 * through ppt/slides/_rels/slideN.xml.rels.
 *
 * Why the picture layer matters: lecture decks routinely paste a diagram,
 * a Gantt chart, or an Excel screenshot as an IMAGE. That content is
 * invisible to text extraction — and it is often exactly what gets tested
 * (observed: the ITSS 3300 Project Management deck, where "critical path"
 * existed only inside image slides).
 */
import { unzipSync, strFromU8 } from "fflate";

export interface PptxSlide {
  index: number;
  text: string;
  /** Embedded images on this slide, base64 + mime. */
  images: { base64: string; mimeType: string; bytes: number }[];
}

export interface PptxDoc {
  slides: PptxSlide[];
  /** Concatenated text layer (what we had before). */
  text: string;
  charCount: number;
  slideCount: number;
}

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  webp: "image/webp",
};

/** Images below this are almost certainly icons/bullets/logos — skip. */
const MIN_IMAGE_BYTES = 25_000;

function slideNo(name: string): number {
  const m = /slide(\d+)\.xml$/.exec(name);
  return m ? Number(m[1]) : 0;
}

/**
 * Pull the <a:t> text runs out of slide XML.
 *
 * NOTE the exact tag match: `<a:t[^>]*>` also matches `<a:tabLst>`,
 * `<a:tileRect/>` etc., which drags raw XML into the "text" and both
 * inflates the char count and poisons the image-heavy heuristic. Only
 * `<a:t>` and `<a:t attr=…>` are real text runs.
 */
function xmlText(xml: string): string {
  const runs = [...xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map((m) =>
    m[1]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'"),
  );
  return runs.join("\n").trim();
}

/** slideN.xml.rels → the media files that slide references. */
function slideMedia(relsXml: string): string[] {
  return [...relsXml.matchAll(/Target="([^"]*media\/[^"]+)"/g)].map((m) =>
    m[1].replace(/^\.\.\//, "ppt/"),
  );
}

/** slideN.xml.rels → the SmartArt/diagram data parts that slide uses. */
function slideDiagrams(relsXml: string): string[] {
  return [...relsXml.matchAll(/Target="([^"]*diagrams\/data\d*\.xml)"/g)].map((m) =>
    m[1].replace(/^\.\.\//, "ppt/"),
  );
}

export function extractPptx(buf: Buffer | Uint8Array): PptxDoc {
  const files = unzipSync(new Uint8Array(buf));
  const slideNames = Object.keys(files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => slideNo(a) - slideNo(b));

  const slides: PptxSlide[] = [];
  for (const name of slideNames) {
    const idx = slideNo(name);
    let text = xmlText(strFromU8(files[name]));

    const relsName = `ppt/slides/_rels/slide${idx}.xml.rels`;
    const rels = files[relsName] ? strFromU8(files[relsName]) : "";
    const targets = rels ? slideMedia(rels) : [];

    // SmartArt/diagram text lives in ppt/diagrams/dataN.xml, NOT in the
    // slide XML — a "Project Scope/Quality/Risk" SmartArt slide looks
    // empty without this.
    for (const d of rels ? slideDiagrams(rels) : []) {
      const part = files[d];
      if (!part) continue;
      const dt = xmlText(strFromU8(part));
      if (dt) text = text ? `${text}\n${dt}` : dt;
    }

    // Speaker notes frequently carry the explanation the slide only
    // shows as a picture — cheap, high-value signal.
    const notesName = `ppt/notesSlides/notesSlide${idx}.xml`;
    if (files[notesName]) {
      const nt = xmlText(strFromU8(files[notesName]))
        .replace(/^\s*\d+\s*$/gm, "") // strip bare slide-number runs
        .trim();
      if (nt) text = text ? `${text}\n[notes] ${nt}` : `[notes] ${nt}`;
    }

    const images: PptxSlide["images"] = [];
    for (const t of targets) {
      const data = files[t];
      if (!data) continue;
      const ext = (t.split(".").pop() ?? "").toLowerCase();
      const mimeType = MIME[ext];
      if (!mimeType) continue; // skip emf/wmf/svg — model can't read them
      if (data.length < MIN_IMAGE_BYTES) continue;
      images.push({
        base64: Buffer.from(data).toString("base64"),
        mimeType,
        bytes: data.length,
      });
    }
    slides.push({ index: idx, text, images });
  }

  const text = slides
    .filter((s) => s.text)
    .map((s) => `\n## Slide ${s.index}\n${s.text}`)
    .join("\n");

  return { slides, text, charCount: text.length, slideCount: slides.length };
}

/**
 * Which slides need the vision pass? A slide whose text is thin relative
 * to the pictures it carries is a picture slide — its meaning is in the
 * image. (A slide with a full bullet list AND a decorative photo does not
 * need transcription.)
 */
export function imageHeavySlides(doc: PptxDoc, minTextChars = 120): PptxSlide[] {
  return doc.slides.filter((s) => s.images.length > 0 && s.text.length < minTextChars);
}
