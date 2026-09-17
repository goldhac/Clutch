/**
 * figures.ts — find the diagrams on a document's pages and cut them out (issue #15).
 *
 * The vision pass already READS figures into words. This keeps the picture too, so a
 * student can put the one diagram that matters on the sheet.
 *
 *   detectFigures  — Gemini returns a bounding box per figure, natively:
 *                    [ymin, xmin, ymax, xmax] normalised to 0–1000.
 *   cropFigures    — `pdftoppm -x -y -W -H` renders JUST that region straight from the
 *                    PDF, so vector diagrams stay crisp at print resolution and no image
 *                    library is needed (poppler is already in the Docker image).
 *
 * Everything here is best-effort: a failure returns no figures and never blocks a sheet.
 */
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { defaultGeminiClient } from "@/engine/gemini-client";
import type { LLMClient } from "@/engine/llm-client";
import type { RasterPage } from "./rasterize";

const run = promisify(execFile);

/** Gemini Flash: bounding boxes are a native skill and this is ~20× cheaper than Pro. */
const DETECT_MODEL = "gemini-2.5-flash";
const PAGES_PER_CALL = 6;
const CONCURRENCY = 4;
/** Widest a figure is ever printed is two sheet columns ≈ 3.2 in; 200 dpi → ~640 px. */
const MAX_CROP_PX = 700;
const CROP_DPI = 200;
/** Below this the figure is an icon or a bullet, not a diagram. */
const MIN_BOX_SHARE = 0.03;

const DETECT_SYSTEM = `
You locate FIGURES on lecture slides and document pages for a study tool.

A figure is a diagram, architecture drawing, flow chart, plot, chart, heat map, matrix/grid
drawing, annotated illustration, or a table that is drawn as a picture.
NOT a figure: logos, decorative icons or clip-art, page headers/footers, slide titles, plain
paragraphs or bullet lists, and a bare equation on its own.

For every figure return:
- "image":   the 1-based index of the image it is on
- "box_2d":  [ymin, xmin, ymax, xmax], normalised to 0-1000, TIGHT around the figure
             INCLUDING its own labels, axis titles and legend, EXCLUDING the slide title and
             any body text beside it
- "caption": a short title for it (use the figure's own caption or the slide title)
- "what":    one line on what it shows
- "importance": 1-5. 5 = the central diagram of the topic that a student would want on a
             one-page exam sheet (an architecture, a process, a key plot). 3 = useful
             illustration. 1 = decorative or redundant with the text.

Return JSON exactly: {"figures":[{"image":1,"box_2d":[0,0,0,0],"caption":"","what":"","importance":3}]}
Return {"figures":[]} when there are none. Never invent a figure.
`.trim();

const DetectSchema = z.object({
  figures: z.array(z.object({
    image: z.number().int(),
    box_2d: z.array(z.number()).length(4),
    caption: z.string(),
    what: z.string(),
    importance: z.number(),
  })),
});

export interface DetectedFigure {
  page: number;
  /** [ymin, xmin, ymax, xmax], 0–1000. */
  box: [number, number, number, number];
  caption: string;
  what: string;
  importance: number;
}

export interface CroppedFigure extends DetectedFigure {
  /** data:image/jpeg;base64,… */
  image: string;
  w: number;
  h: number;
}

export async function detectFigures(
  pages: RasterPage[],
  opts: { client?: LLMClient; documentName?: string } = {},
): Promise<{ figures: DetectedFigure[]; inputTokens: number; outputTokens: number }> {
  if (pages.length === 0) return { figures: [], inputTokens: 0, outputTokens: 0 };
  const client = opts.client ?? defaultGeminiClient();
  const chunks: RasterPage[][] = [];
  for (let i = 0; i < pages.length; i += PAGES_PER_CALL) chunks.push(pages.slice(i, i + PAGES_PER_CALL));

  const out: DetectedFigure[] = [];
  let inTok = 0, outTok = 0, next = 0;
  const worker = async () => {
    while (next < chunks.length) {
      const chunk = chunks[next++];
      try {
        const res = await client.generate({
          system: DETECT_SYSTEM,
          user: `${opts.documentName ? `Document: ${opts.documentName}\n` : ""}${chunk.length} image(s), in order: ${chunk.map((p, i) => `image ${i + 1} = page ${p.page}`).join(", ")}.`,
          images: chunk.map(({ base64, mimeType }) => ({ base64, mimeType })),
          model: DETECT_MODEL,
          temperature: 0,
          maxOutputTokens: 4096,
        });
        inTok += res.usage.inputTokens ?? 0;
        outTok += res.usage.outputTokens ?? 0;
        const cleaned = res.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
        const parsed = DetectSchema.safeParse(JSON.parse(cleaned));
        if (!parsed.success) continue;
        for (const f of parsed.data.figures) {
          const page = chunk[f.image - 1]?.page;
          if (!page) continue;
          const [ymin, xmin, ymax, xmax] = f.box_2d.map((n) => Math.max(0, Math.min(1000, n)));
          if (ymax <= ymin || xmax <= xmin) continue;
          if (((ymax - ymin) * (xmax - xmin)) / 1e6 < MIN_BOX_SHARE) continue;
          out.push({ page, box: [ymin, xmin, ymax, xmax], caption: f.caption.trim(), what: f.what.trim(), importance: Math.round(f.importance) });
        }
      } catch {
        // One failed batch loses only its own pages' figures.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, worker));
  out.sort((a, b) => a.page - b.page || a.box[0] - b.box[0]);
  return { figures: out, inputTokens: inTok, outputTokens: outTok };
}

/** Page sizes in PostScript points, from `pdfinfo` ("Page    3 size: 362.8 x 272.1 pts"). */
async function pageSizes(pdf: string, pages: number[]): Promise<Map<number, { w: number; h: number }>> {
  const sizes = new Map<number, { w: number; h: number }>();
  const first = Math.min(...pages), last = Math.max(...pages);
  const { stdout } = await run("pdfinfo", ["-f", String(first), "-l", String(last), pdf]);
  for (const m of stdout.matchAll(/Page\s+(\d+)\s+size:\s+([\d.]+)\s+x\s+([\d.]+)\s+pts/g)) {
    sizes.set(Number(m[1]), { w: Number(m[2]), h: Number(m[3]) });
  }
  return sizes;
}

export async function cropFigures(buf: Buffer | Uint8Array, figures: DetectedFigure[]): Promise<CroppedFigure[]> {
  if (figures.length === 0) return [];
  const dir = await mkdtemp(path.join(tmpdir(), "clutch-fig-"));
  const src = path.join(dir, "in.pdf");
  try {
    await writeFile(src, Buffer.from(buf));
    const sizes = await pageSizes(src, figures.map((f) => f.page));
    const out: CroppedFigure[] = [];
    for (const [i, f] of figures.entries()) {
      const size = sizes.get(f.page);
      if (!size) continue;
      // 3.5% breathing room: at 2% the attention heat-map lost its last axis label.
      const pad = 35;
      const ymin = Math.max(0, f.box[0] - pad), xmin = Math.max(0, f.box[1] - pad);
      const ymax = Math.min(1000, f.box[2] + pad), xmax = Math.min(1000, f.box[3] + pad);
      const widthIn = ((xmax - xmin) / 1000) * (size.w / 72);
      const dpi = Math.max(72, Math.min(CROP_DPI, Math.floor(MAX_CROP_PX / widthIn)));
      const pxW = (size.w / 72) * dpi, pxH = (size.h / 72) * dpi;
      const x = Math.round((xmin / 1000) * pxW), y = Math.round((ymin / 1000) * pxH);
      const w = Math.round(((xmax - xmin) / 1000) * pxW), h = Math.round(((ymax - ymin) / 1000) * pxH);
      const prefix = path.join(dir, `f${i}`);
      try {
        await run("pdftoppm", [
          "-jpeg", "-jpegopt", "quality=78", "-r", String(dpi), "-f", String(f.page), "-l", String(f.page),
          "-x", String(x), "-y", String(y), "-W", String(w), "-H", String(h), "-singlefile", src, prefix,
        ]);
        const jpg = await readFile(`${prefix}.jpg`);
        out.push({ ...f, image: `data:image/jpeg;base64,${jpg.toString("base64")}`, w, h });
      } catch {
        // Skip a figure poppler can't render; the rest still come back.
      }
    }
    return out;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
