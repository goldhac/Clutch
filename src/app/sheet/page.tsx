import "@/renderer/density.css";
import "@/renderer/semantics.css";
import "@/renderer/sheet.css";

import type { Metadata } from "next";
import { sampleContent } from "@samples/sample-content";
import { type Density, renderSheet } from "@/renderer/sheet";
import { OverflowMonitor } from "./overflow-monitor";

const DENSITIES: Density[] = ["minimal", "standard", "max"];

function parseDensity(raw: string | string[] | undefined): Density {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return DENSITIES.includes(v as Density) ? (v as Density) : "max";
}

// PDF metadata title comes from the document title — both browser tab
// and the downloaded PDF say "Exam Reference Sheet" (PRD §11.7 /
// Handoff rule 9: marketing says "cheat sheet"; product + PDF say
// "Exam Reference Sheet").
export const metadata: Metadata = {
  title: "Exam Reference Sheet",
};

/**
 * /sheet — renders sample-content via the deterministic renderSheet().
 *
 *   ?density=max       (default — the hero)
 *   ?density=standard  (3 cols / 7.5pt)
 *   ?density=minimal   (2 cols / 9pt)
 *   &cols=5            (only meaningful with max — try the 5-col variant)
 *
 * Step 6 (engine) will swap the source from `samples/sample-content.ts`
 * to engine output. /api/pdf renders this same URL through Playwright
 * for the verified one-page export.
 */
export default async function SheetPage({
  searchParams,
}: {
  searchParams: Promise<{ density?: string | string[]; cols?: string | string[] }>;
}) {
  const sp = await searchParams;
  const density = parseDensity(sp.density);
  const cols5 = sp.cols === "5";
  const html = renderSheet(sampleContent, { density, cols5 });

  return (
    <div className="sheet-page">
      {/* Dev-only chrome — `print:hidden` keeps it out of PDF; route
       * additionally calls emulateMedia({media:"print"}) for defense
       * in depth. */}
      <DevBar density={density} cols5={cols5} />
      <OverflowMonitor />
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

function DevBar({ density, cols5 }: { density: Density; cols5: boolean }) {
  const link = (d: Density, extra = "") => `?density=${d}${extra}`;
  const Item = ({
    label,
    href,
    active,
  }: {
    label: string;
    href: string;
    active: boolean;
  }) => (
    <a
      href={href}
      className={`rounded px-2 py-0.5 ${active ? "bg-black text-white" : "bg-white text-black hover:bg-neutral-200"}`}
    >
      {label}
    </a>
  );

  // Build the matching /api/pdf URL so Export downloads the same density.
  const pdfHref = `/api/pdf?density=${density}${cols5 ? "&cols=5" : ""}`;

  return (
    <nav
      aria-label="Sheet dev bar"
      className="print:hidden fixed right-3 top-3 z-50 flex gap-1 rounded border border-neutral-300 bg-white/95 p-1 text-xs shadow"
    >
      <span className="px-1 py-0.5 text-neutral-500">density:</span>
      <Item label="minimal" href={link("minimal")} active={density === "minimal"} />
      <Item label="standard" href={link("standard")} active={density === "standard"} />
      <Item label="max" href={link("max")} active={density === "max" && !cols5} />
      <Item label="max ×5" href={link("max", "&cols=5")} active={density === "max" && cols5} />
      <span className="mx-1 self-center text-neutral-300">|</span>
      <a
        href={pdfHref}
        className="rounded bg-[color:var(--color-primary-indigo)] px-2 py-0.5 font-semibold text-white hover:opacity-90"
        title="Render with Playwright + verify page count (one page is sacred)"
      >
        Export PDF
      </a>
    </nav>
  );
}
