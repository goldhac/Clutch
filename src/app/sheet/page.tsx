import "@/renderer/density.css";
import "@/renderer/semantics.css";
import "@/renderer/sheet.css";

import type { Metadata } from "next";
import Link from "next/link";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { sampleContent } from "@samples/sample-content";
import { FittedSheet, type Density, normalizeDensity } from "@/components/sheet";
import { splitFrontBack } from "@/components/sheet/relevance";
import { safeParseSheetContent, type SheetContent } from "@/contract/sheet-content";

function parseDensity(raw: string | string[] | undefined): Density {
  return normalizeDensity(Array.isArray(raw) ? raw[0] : raw);
}

/**
 * Dev loader: ?g=<name> renders samples/generated/<name>.json instead of
 * the hardcoded sample. Name is sanitized to [a-z0-9-]; invalid or
 * unparseable files fall back to the sample. (The production pool
 * transport is R4's /print route — this is the dev/QA path.)
 */
async function loadContent(g: string | undefined): Promise<SheetContent> {
  if (!g || !/^[a-z0-9-]+$/i.test(g)) return sampleContent;
  try {
    const file = path.join(process.cwd(), "samples", "generated", `${g}.json`);
    const parsed = safeParseSheetContent(JSON.parse(await readFile(file, "utf-8")));
    return parsed.success ? parsed.data : sampleContent;
  } catch {
    return sampleContent;
  }
}

// PDF metadata title comes from the document title — both browser tab
// and the downloaded PDF say "Exam Reference Sheet" (PRD §11.7 /
// Handoff rule 9: marketing says "cheat sheet"; product + PDF say
// "Exam Reference Sheet").
export const metadata: Metadata = {
  title: "Exam Reference Sheet",
};

/**
 * /sheet — renders sample-content via the <Sheet> React component.
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
  searchParams: Promise<{
    density?: string | string[];
    cols?: string | string[];
    g?: string | string[];
    page?: string | string[];
  }>;
}) {
  const sp = await searchParams;
  const cols5 = sp.cols === "5";
  const g = Array.isArray(sp.g) ? sp.g[0] : sp.g;
  const page = Array.isArray(sp.page) ? sp.page[0] : sp.page;
  const pool = await loadContent(g);

  // ?page=front|back → the R6 front/back prototype: FRONT = MAX (×5),
  // BACK = Balanced composed from the remainder (docs/09 §7).
  if (page === "front" || page === "back") {
    // FRONT is the full 7-col MAX weapon (the proven design); BACK is
    // Balanced (docs/09 §7). cols5=false → the standard 7-col front.
    const fb = splitFrontBack(pool, undefined, false);
    const isFront = page === "front";
    return (
      <div className="sheet-page">
        <DevBar density={isFront ? "max" : "balanced"} cols5={false} g={g} page={page} />
        <FittedSheet
          content={isFront ? fb.front : fb.back}
          density={isFront ? "max" : "balanced"}
          cols5={false}
          debug
        />
      </div>
    );
  }

  const density = parseDensity(sp.density);
  return (
    <div className="sheet-page">
      <DevBar density={density} cols5={cols5} g={g} />
      <FittedSheet content={pool} density={density} cols5={cols5} debug />
    </div>
  );
}

function DevBar({
  density,
  cols5,
  g,
  page,
}: {
  density: Density;
  cols5: boolean;
  g?: string;
  page?: string;
}) {
  const gq = g ? `&g=${g}` : "";
  const link = (d: Density, extra = "") => `?density=${d}${extra}${gq}`;
  const Item = ({
    label,
    href,
    active,
  }: {
    label: string;
    href: string;
    active: boolean;
  }) => (
    <Link
      href={href}
      className={`rounded px-2 py-0.5 ${active ? "bg-black text-white" : "bg-white text-black hover:bg-neutral-200"}`}
    >
      {label}
    </Link>
  );

  const pdfHref = `/api/pdf?density=${density}${cols5 ? "&cols=5" : ""}${gq}${page ? `&page=${page}` : ""}`;

  return (
    <nav
      aria-label="Sheet dev bar"
      className="print:hidden fixed right-3 top-3 z-50 flex gap-1 rounded border border-neutral-300 bg-white/95 p-1 text-xs shadow"
    >
      <span className="px-1 py-0.5 text-neutral-500">density:</span>
      <Item label="essentials" href={link("essentials")} active={!page && density === "essentials"} />
      <Item label="balanced" href={link("balanced")} active={!page && density === "balanced"} />
      <Item label="max" href={link("max")} active={!page && density === "max" && !cols5} />
      <Item label="max ×5" href={link("max", "&cols=5")} active={!page && density === "max" && cols5} />
      {g && (
        <>
          <span className="mx-1 self-center text-neutral-300">|</span>
          <Item label="FRONT" href={`?g=${g}&page=front`} active={page === "front"} />
          <Item label="BACK" href={`?g=${g}&page=back`} active={page === "back"} />
        </>
      )}
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
