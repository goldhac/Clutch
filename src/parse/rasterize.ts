/**
 * rasterize.ts — turn PDF pages into PNGs so the vision pass can read
 * pages whose content is drawn, not typed.
 *
 * Uses poppler's `pdftoppm` (available via `brew install poppler`, and in
 * the Playwright Docker base image via `apt-get install poppler-utils`).
 * We shell out rather than pulling a WASM PDF renderer because the binary
 * is faster, and this path only runs during ingest — never per request.
 *
 * If pdftoppm is missing we degrade gracefully: no rasterization, ingest
 * continues on the text layer alone, and the caller surfaces a warning.
 * Losing image content is bad; failing the whole upload is worse.
 */
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export interface RasterPage {
  page: number;
  base64: string;
  mimeType: "image/png";
}

let cachedAvailable: boolean | null = null;

/** Is pdftoppm on PATH? Cached — the answer can't change mid-process. */
export async function rasterizerAvailable(): Promise<boolean> {
  if (cachedAvailable !== null) return cachedAvailable;
  try {
    await run("pdftoppm", ["-v"]);
    cachedAvailable = true;
  } catch {
    cachedAvailable = false;
  }
  return cachedAvailable;
}

export interface RasterizeOptions {
  /** Only these 1-based page numbers. Omit = all pages. */
  pages?: number[];
  /** Render DPI. 110 keeps small axis labels legible without huge files. */
  dpi?: number;
  /** Safety cap on how many pages we'll rasterize. */
  maxPages?: number;
}

/**
 * Render selected PDF pages to PNG. Returns [] if the tool is missing.
 */
export async function rasterizePdf(
  buf: Buffer | Uint8Array,
  opts: RasterizeOptions = {},
): Promise<RasterPage[]> {
  if (!(await rasterizerAvailable())) return [];

  const dpi = opts.dpi ?? 110;
  const maxPages = opts.maxPages ?? 12;
  const wanted = opts.pages?.slice(0, maxPages);

  const dir = await mkdtemp(path.join(tmpdir(), "cramsheet-raster-"));
  const src = path.join(dir, "in.pdf");
  try {
    await writeFile(src, Buffer.from(buf));
    const out: RasterPage[] = [];

    if (wanted && wanted.length > 0) {
      // One invocation per page keeps the numbering unambiguous.
      for (const p of wanted) {
        const prefix = path.join(dir, `p${p}`);
        await run("pdftoppm", [
          "-png", "-r", String(dpi), "-f", String(p), "-l", String(p), src, prefix,
        ]);
        const produced = (await readdir(dir)).filter(
          (f) => f.startsWith(`p${p}-`) || f === `p${p}.png`,
        );
        for (const f of produced) {
          out.push({
            page: p,
            base64: (await readFile(path.join(dir, f))).toString("base64"),
            mimeType: "image/png",
          });
        }
      }
    } else {
      const prefix = path.join(dir, "pg");
      await run("pdftoppm", [
        "-png", "-r", String(dpi), "-f", "1", "-l", String(maxPages), src, prefix,
      ]);
      const files = (await readdir(dir))
        .filter((f) => f.startsWith("pg-") && f.endsWith(".png"))
        .sort();
      for (const f of files) {
        const n = Number(/pg-(\d+)\.png$/.exec(f)?.[1] ?? 0);
        out.push({
          page: n,
          base64: (await readFile(path.join(dir, f))).toString("base64"),
          mimeType: "image/png",
        });
      }
    }
    return out;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
