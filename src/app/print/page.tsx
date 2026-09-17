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
    only?: string | string[];
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
    // for a bad/expired token). The data-print-error attribute is the
    // machine contract; the card below is for the human who lands on a
    // dead link (v2 handoff edge state).
    return (
      <div
        data-print-error="no-pool"
        className="flex min-h-screen items-center justify-center bg-[var(--paper)] px-6"
      >
        <div className="w-full max-w-[560px] overflow-hidden rounded-[14px] border border-[var(--ink-150)] bg-white shadow-[var(--sh-lg)]">
          <div className="px-8 pb-7 pt-7">
            <div className="flex items-center gap-2.5">
              <span aria-hidden className="h-[7px] w-[7px] rounded-full bg-[var(--conf-low)]" />
              <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-500)]">
                Print target · no pool
              </span>
            </div>
            <h1 className="mt-3.5 font-serif text-[30px] leading-[1.1] tracking-[-0.02em] text-[var(--ink-900)]">
              This print link has expired.
            </h1>
            <p className="mt-3 text-[14px] leading-[1.6] text-[var(--ink-600)]" style={{ textWrap: "pretty" }}>
              Pools are held for a few minutes and then dropped, so a sheet can never render from
              a stale token. Nothing was charged. Re-open your sheet and export again.
            </p>
            <div className="mt-5 flex gap-3">
              <a
                href="/results"
                className="inline-flex h-10 items-center rounded-[var(--r-md)] bg-[var(--band)] px-4 text-[14px] font-semibold text-white"
              >
                Back to my sheet
              </a>
              <a
                href="/library"
                className="inline-flex h-10 items-center rounded-[var(--r-md)] border border-[var(--border-input)] bg-white px-4 text-[14px] font-semibold text-[var(--ink-900)]"
              >
                My Sheets
              </a>
            </div>
          </div>
          <div className="border-t border-[var(--ink-150)] bg-[var(--conf-low-bg)] px-8 py-3 font-mono text-[11px] text-[var(--conf-low-deep)]">
            no-pool · token expired or invalid
          </div>
        </div>
      </div>
    );
  }

  if (page === "front" || page === "back") {
    // One two-page document, filled sequentially by real measurement —
    // Playwright prints both pages in a single pass (pages=2 assert).
    // only=front: the account isn't entitled to the back page, so it is left out of the print
    // (decided by /api/pdf from the signed-in profile, never by the client).
    return (
      <div className={first(sp.only) === "front" ? "sheet-page front-only" : "sheet-page"}>
        <TwoPageSheet content={stored.content} ctx={stored.ctx} cols5={false} continuous={first(sp.only) !== "front"} />
      </div>
    );
  }

  return (
    <div className="sheet-page">
      <FittedSheet content={stored.content} density={density} cols5={cols5} ctx={stored.ctx} />
    </div>
  );
}
