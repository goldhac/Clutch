/**
 * /api/pdf — render the sheet to a verified one-page A4-landscape PDF.
 *
 * The Phase 0 gate: if THIS endpoint can't reliably produce a correctly-
 * paged PDF from a typed SheetContent, the product is broken.
 *
 * Two entry points share one renderer:
 *   GET  — dev/QA path. Renders /sheet from the on-disk ?g=<name> pool (or
 *          the sample), ?density=, ?cols=5, ?page=front|back.
 *   POST — the production path (R4). Body carries the user's pool
 *          { content, density, cols5, ctx, page }. We stash it in the
 *          in-process pool store, drive Playwright to /print?token=…, and
 *          drop the token when done. This is how /results exports a PDF of
 *          a sheet that only exists in the user's browser session.
 *
 * The single renderer navigates Playwright to a real page URL on
 * 127.0.0.1, waits for the client FitController's `data-fit-done` signal,
 * VERIFIES no visible block is clipped, asserts the page count, and prints.
 *
 * On a violated rule (clip or wrong page count) it returns 422 (the
 * request was valid, the render wasn't) so the caller can act on it
 * without treating it as a 500.
 */
import { type NextRequest } from "next/server";
import { chromium, type Page } from "playwright";
import { assertPageCount, PageCountError } from "@/lib/pdf-verify";
import { safeParseSheetContent } from "@/contract/sheet-content";
import { putPool, dropPool } from "@/lib/pool-store";
import { EMPTY_CTX } from "@/components/sheet/relevance";

// Playwright spawns Chromium subprocesses — Node runtime, not Edge.
export const runtime = "nodejs";

// Avoid Next caching a stale rendering of the sheet.
export const dynamic = "force-dynamic";

const VALID_DENSITIES = new Set(["essentials", "balanced", "max", "minimal", "standard"]);

/** A visible block spilled outside the column box — content the reader
 * would silently lose. Distinct from PageCountError (wrong # of pages). */
class ClipError extends Error {
  constructor(public readonly clipped: number) {
    super(`${clipped} block(s) clipped outside the page — the FitController did not converge`);
    this.name = "ClipError";
  }
}

/** The /print target rendered its no-pool sentinel (bad/expired token). */
class PrintTargetError extends Error {
  constructor(reason: string) {
    super(`print target error: ${reason}`);
    this.name = "PrintTargetError";
  }
}

function localBase(): string {
  const port = process.env.PORT ?? "3000";
  return `http://127.0.0.1:${port}`;
}

/**
 * Independently verify the FitController's promise: every VISIBLE fit-leaf
 * must sit within its column container's content box (horizontal axis —
 * multicol overflow is sideways). Returns the count that don't. This is a
 * real check, not a trust of `data-fit-done`.
 */
async function countClipped(page: Page): Promise<number> {
  return page.evaluate(() => {
    // Check EVERY sheet on the target — the two-page document renders
    // front AND back; a clip on either page is a defect.
    let clipped = 0;
    const TOL = 1.5;
    for (const cols of Array.from(document.querySelectorAll<HTMLElement>(".sheet .cols"))) {
      const box = cols.getBoundingClientRect();
      for (const el of Array.from(cols.querySelectorAll<HTMLElement>("[data-fit-id]"))) {
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        // Clipped if the block's right edge extends past the visible columns.
        if (r.right > box.right + TOL) clipped++;
      }
    }
    return clipped;
  });
}

async function renderToPdf(opts: {
  targetUrl: string;
  pages: 1 | 2;
  density: string;
  verifyClip: boolean;
}): Promise<Uint8Array> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newContext().then((ctx) => ctx.newPage());

    // Emulate print media so the @media print rules fire (hide dev chrome).
    await page.emulateMedia({ media: "print" });
    await page.goto(opts.targetUrl, { waitUntil: "networkidle" });

    // Never print a sheet for a bad/expired token.
    const printError = await page
      .$eval("[data-print-error]", (el) => el.getAttribute("data-print-error"))
      .catch(() => null);
    if (printError) throw new PrintTargetError(printError);

    // The client FitController (Layer C) measures + trims/gap-fills before
    // it marks the sheet done. Wait so the PDF captures the FITTED result,
    // not the pre-measure baseline. Falls through after a short budget if
    // the signal never appears (JS disabled) — CSS overflow still clips to
    // one page.
    // FittedSheet marks its .sheet; TwoPageSheet marks its .two-page
    // wrapper only after BOTH pages settle — match either.
    await page
      .waitForSelector("[data-fit-done='1']", { timeout: 6000 })
      .catch(() => {});

    // Real clip verifier (R4): assert the FitController actually converged.
    if (opts.verifyClip) {
      const clipped = await countClipped(page);
      if (clipped > 0) throw new ClipError(clipped);
    }

    const pdf = await page.pdf({
      format: "A4",
      landscape: true,
      margin: { top: "0.16in", bottom: "0.16in", left: "0.14in", right: "0.14in" },
      printBackground: true,
      preferCSSPageSize: true,
    });

    // THE HARD RULE — page count is sacred. Throws PageCountError if not.
    await assertPageCount(pdf, opts.pages, opts.density);
    return new Uint8Array(pdf);
  } finally {
    await browser.close();
  }
}

function pdfResponse(pdf: Uint8Array, density: string): Response {
  return new Response(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Exam Reference Sheet (${density}).pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

function errorResponse(err: unknown): Response {
  if (err instanceof PageCountError || err instanceof ClipError || err instanceof PrintTargetError) {
    return new Response(err.message, {
      status: 422,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  console.error("[/api/pdf] unexpected error:", err);
  return new Response(err instanceof Error ? err.message : String(err), {
    status: 500,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

// ── GET — dev/QA render from the on-disk ?g= pool or the sample ─────────
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const density = (url.searchParams.get("density") ?? "max").toLowerCase();
  if (!VALID_DENSITIES.has(density)) {
    return new Response(`invalid density="${density}"`, { status: 400 });
  }
  const cols5 = url.searchParams.get("cols") === "5";
  const pageParam = url.searchParams.get("page");
  const isSplit = pageParam === "front" || pageParam === "back";
  // Front/back mode renders the two-page document (sequential fill) —
  // ONE Playwright pass produces the final 2-page PDF. No merge step.
  const pages = isSplit ? 2 : Number.parseInt(url.searchParams.get("pages") ?? "1", 10);
  if (pages !== 1 && pages !== 2) {
    return new Response(`pages must be 1 or 2; got "${pages}"`, { status: 400 });
  }

  const sheetUrl = new URL(`${localBase()}/sheet`);
  sheetUrl.searchParams.set("density", density);
  if (cols5) sheetUrl.searchParams.set("cols", "5");
  sheetUrl.searchParams.set("print", "1");
  const g = url.searchParams.get("g");
  if (g && /^[a-z0-9-]+$/i.test(g)) sheetUrl.searchParams.set("g", g);
  if (isSplit) sheetUrl.searchParams.set("page", pageParam!);

  try {
    const pdf = await renderToPdf({
      targetUrl: sheetUrl.toString(),
      pages: pages as 1 | 2,
      density,
      verifyClip: true,
    });
    return pdfResponse(pdf, density);
  } catch (err) {
    return errorResponse(err);
  }
}

// ── POST — production render of the user's own pool (R4) ────────────────
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("body must be JSON", { status: 400 });
  }
  const b = body as {
    content?: unknown;
    density?: string;
    cols5?: boolean;
    ctx?: unknown;
    page?: string;
  };

  const density = (b.density ?? "max").toLowerCase();
  if (!VALID_DENSITIES.has(density)) {
    return new Response(`invalid density="${density}"`, { status: 400 });
  }
  const parsed = safeParseSheetContent(b.content);
  if (!parsed.success) {
    return new Response(
      `content failed the contract: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
      { status: 400 },
    );
  }
  const isSplit = b.page === "front" || b.page === "back";
  // Front/back = the two-page document in one pass.
  const pages: 1 | 2 = isSplit ? 2 : 1;

  const ctx = b.ctx && typeof b.ctx === "object" ? (b.ctx as typeof EMPTY_CTX) : EMPTY_CTX;
  const token = putPool(parsed.data, ctx);
  try {
    const printUrl = new URL(`${localBase()}/print`);
    printUrl.searchParams.set("token", token);
    printUrl.searchParams.set("density", density);
    if (b.cols5) printUrl.searchParams.set("cols", "5");
    if (isSplit) printUrl.searchParams.set("page", b.page!);

    const pdf = await renderToPdf({
      targetUrl: printUrl.toString(),
      pages,
      // Front/back are both the 7-col MAX (one continuous sheet).
      density: isSplit ? "max" : density,
      verifyClip: true,
    });
    return pdfResponse(pdf, density);
  } catch (err) {
    return errorResponse(err);
  } finally {
    dropPool(token);
  }
}
