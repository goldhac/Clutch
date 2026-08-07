import "@/renderer/density.css";
import "@/renderer/semantics.css";
import "@/renderer/sheet.css";

import type { Metadata } from "next";
import { FittedSheet, TwoPageSheet, normalizeDensity } from "@/components/sheet";
import { takePool } from "@/lib/pool-store";

export const metadata: Metadata = { title: "Exam Reference Sheet" };
export const dynamic = "force-dynamic";

/**
 * /print — the headless render target for /api/pdf (R4).
 *
 * Reads the pool that the POST handler stashed under ?token, then renders
 * the SAME FittedSheet the live app uses (so the PDF is byte-for-byte the
 * on-screen sheet). No dev chrome. Playwright waits for the FitController's
 * data-fit-done signal, verifies no clip, and prints.
 *
 *   ?token=…            required — the stashed pool
 *   ?density=max|…      single-sheet density (default max)
 *   ?cols=5             narrow MAX variant
 *   ?page=front|back    2-page mode (FRONT=7-col MAX, BACK=Balanced)
 */
export default async function PrintPage({
  searchParams,
}: {
  searchParams: Promise<{
    token?: string | string[];
    density?: string | string[];
    cols?: string | string[];
    page?: string | string[];
  }>;
}) {
  const sp = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const token = first(sp.token);
  const page = first(sp.page);
  const cols5 = first(sp.cols) === "5";
  const density = normalizeDensity(first(sp.density));

  const stored = token ? takePool(token) : null;
  if (!stored) {
    // 200 with a sentinel the route can detect (never prints a real sheet
    // for a bad/expired token).
    return (
      <div data-print-error="no-pool" style={{ padding: 24, fontFamily: "sans-serif" }}>
        No pool for this token (expired or invalid).
      </div>
    );
  }

  if (page === "front" || page === "back") {
    // One two-page document, filled sequentially by real measurement —
    // Playwright prints both pages in a single pass (pages=2 assert).
    return (
      <div className="sheet-page">
        <TwoPageSheet content={stored.content} ctx={stored.ctx} cols5={false} />
      </div>
    );
  }

  return (
    <div className="sheet-page">
      <FittedSheet content={stored.content} density={density} cols5={cols5} ctx={stored.ctx} />
    </div>
  );
}
