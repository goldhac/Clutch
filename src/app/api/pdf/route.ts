/**
 * /api/pdf — render the sheet to a verified one-page A4-landscape PDF.
 *
 * The Phase 0 gate (roadmap): if THIS endpoint can't reliably produce a
 * one-page PDF from a typed SheetContent object, the product is broken.
 * Step 7's Tighten loop will eventually catch overflow and retry; for
 * now we throw loudly with PageCountError so callers (and we) see it.
 *
 * Architecture: the same renderer that feeds /sheet (in-browser preview)
 * feeds this route — we just navigate Playwright to our own /sheet URL
 * and ask it to print. Single rendering codepath = single set of bugs.
 *
 * Query params (same shape as /sheet plus `pages`):
 *   density = minimal | standard | max     (default: max)
 *   cols    = 5                            (max-only; 5-col variant)
 *   pages   = 1 | 2                        (default: 1)
 *                                          2-page front/back lands with
 *                                          Step 5 renderer work; route
 *                                          already verifies.
 *
 * On overflow: returns 422 with a human-readable error (the
 * OverflowMonitor on /sheet shows the same thing visually).
 */
import { type NextRequest } from "next/server";
import { chromium } from "playwright";
import { assertPageCount, PageCountError } from "@/lib/pdf-verify";

// Playwright spawns Chromium subprocesses — Node runtime, not Edge.
export const runtime = "nodejs";

// Avoid Next caching a stale rendering of the sheet.
export const dynamic = "force-dynamic";

const VALID_DENSITIES = new Set(["minimal", "standard", "max"]);

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const density = (url.searchParams.get("density") ?? "max").toLowerCase();
  if (!VALID_DENSITIES.has(density)) {
    return new Response(`invalid density="${density}"`, { status: 400 });
  }
  const cols5 = url.searchParams.get("cols") === "5";
  const pages = Number.parseInt(url.searchParams.get("pages") ?? "1", 10);
  if (pages !== 1 && pages !== 2) {
    return new Response(`pages must be 1 or 2; got "${pages}"`, { status: 400 });
  }

  // We point Playwright at the same Next.js server we're running on.
  // Same codepath as the in-browser /sheet preview.
  const sheetUrl = new URL("/sheet", url.origin);
  sheetUrl.searchParams.set("density", density);
  if (cols5) sheetUrl.searchParams.set("cols", "5");
  sheetUrl.searchParams.set("print", "1"); // tells page to hide dev chrome

  const browser = await chromium.launch();
  try {
    const page = await browser.newContext().then((ctx) => ctx.newPage());

    // Emulate print media so the @media print rules in our CSS fire
    // (hides the OverflowMonitor + dev bar + page boundary marker).
    await page.emulateMedia({ media: "print" });

    await page.goto(sheetUrl.toString(), { waitUntil: "networkidle" });

    const pdf = await page.pdf({
      format: "A4",
      landscape: true,
      margin: {
        top: "0.16in",
        bottom: "0.16in",
        left: "0.14in",
        right: "0.14in",
      },
      printBackground: true, // formula bg, table headers, conf dots, etc.
      preferCSSPageSize: true, // let @page in density.css be authoritative
    });

    // THE HARD RULE — one page is sacred. Throws PageCountError if not.
    await assertPageCount(pdf, pages, density);

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Exam Reference Sheet (${density}).pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof PageCountError) {
      // 422 Unprocessable Entity: the request was valid but the rendered
      // output violated our content rule. Caller (UI/Tighten loop) can
      // act on this without treating it as a 500.
      return new Response(err.message, {
        status: 422,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    console.error("[/api/pdf] unexpected error:", err);
    return new Response(
      err instanceof Error ? err.message : String(err),
      { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  } finally {
    await browser.close();
  }
}
