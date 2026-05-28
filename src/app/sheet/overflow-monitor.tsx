"use client";

import { useEffect, useState } from "react";

/**
 * Dev-mode page-overflow monitor.
 *
 * The renderer's hard rule (Build Plan §0): one page is sacred. In
 * Step 4 the PDF route enforces this programmatically via page count.
 * Until then, this client component measures the rendered .sheet in
 * the browser and shows a red badge if content extends past the page
 * boundary — so we never silently lose traps + questions to a clipped
 * 5th column again.
 *
 * Runs only in development (NODE_ENV check) so production builds are
 * unaffected. The PDF route in Step 4 will assert page-count and throw.
 */
interface Measurement {
  vertOver: number;
  horizOver: number;
  pageW: number;
  pageH: number;
  contentW: number;
  contentH: number;
}

export function OverflowMonitor() {
  const [m, setM] = useState<Measurement | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const measure = () => {
      const sheet = document.querySelector<HTMLElement>(".sheet");
      if (!sheet) return;
      setM({
        pageW: sheet.clientWidth,
        pageH: sheet.clientHeight,
        contentW: sheet.scrollWidth,
        contentH: sheet.scrollHeight,
        horizOver: Math.max(0, sheet.scrollWidth - sheet.clientWidth),
        vertOver: Math.max(0, sheet.scrollHeight - sheet.clientHeight),
      });
    };
    // Measure after paint + after fonts settle.
    const t1 = setTimeout(measure, 50);
    const t2 = setTimeout(measure, 600);
    window.addEventListener("resize", measure);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("resize", measure);
    };
  }, []);

  if (!m) return null;

  const TOL = 2; // sub-pixel rounding tolerance
  const overflowing = m.vertOver > TOL || m.horizOver > TOL;

  if (!overflowing) {
    return (
      <div className="print:hidden fixed left-3 top-3 z-50 rounded border border-green-300 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-800 shadow">
        ✓ fits on one A4 page · {m.contentW}×{m.contentH} / {m.pageW}×{m.pageH}px
      </div>
    );
  }
  const dirs: string[] = [];
  if (m.horizOver > TOL) dirs.push(`${m.horizOver}px wide`);
  if (m.vertOver > TOL) dirs.push(`${m.vertOver}px tall`);
  return (
    <div
      className="print:hidden fixed left-3 top-3 z-50 rounded border border-red-300 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800 shadow"
      title="In PDF print mode this content would be clipped. Engine Tighten pass (Step 7) will trim to fit; for now, the sample is too dense."
    >
      ⚠ PAGE OVERFLOW · {dirs.join(" + ")} · would clip in PDF
    </div>
  );
}
