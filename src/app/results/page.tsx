"use client";

import "@/renderer/density.css";
import "@/renderer/semantics.css";
import "@/renderer/sheet.css";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  safeParseSheetContent,
  type SheetContent,
} from "@/contract/sheet-content";
import { type Density, renderSheet } from "@/renderer/sheet";

interface Stash {
  content: unknown;
  meta?: {
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
    retried?: boolean;
    sanitizedItems?: number;
    droppedPatterns?: number;
  };
  warnings?: string[];
  density?: Density;
  savedAt?: string;
}

export default function ResultsPage() {
  const [stash, setStash] = useState<Stash | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [density, setDensity] = useState<Density>("max");

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("cramsheet:last");
      if (!raw) {
        setError("No generated sheet found in this session. Go back and generate one.");
        return;
      }
      const parsed = JSON.parse(raw) as Stash;
      setStash(parsed);
      if (parsed.density) setDensity(parsed.density);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const content = useMemo<SheetContent | null>(() => {
    if (!stash) return null;
    const result = safeParseSheetContent(stash.content);
    if (!result.success) {
      setError(
        "The engine output didn't pass the contract validator. " +
          result.error.issues.map((i) => i.message).join("; "),
      );
      return null;
    }
    return result.data;
  }, [stash]);

  const sheetHtml = useMemo(() => {
    if (!content) return "";
    return renderSheet(content, { density });
  }, [content, density]);

  if (error) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-bold text-[color:var(--color-strong-red)]">
          Something went wrong
        </h1>
        <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-700">{error}</p>
        <Link
          href="/generate"
          className="mt-6 inline-block rounded bg-[color:var(--color-primary-indigo)] px-4 py-2 text-sm font-semibold text-white"
        >
          ← Back to generate
        </Link>
      </main>
    );
  }

  if (!stash || !content) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-sm text-neutral-500">Loading…</p>
      </main>
    );
  }

  const warnings = stash.warnings ?? [];

  return (
    <div className="sheet-page">
      <DevBar
        density={density}
        setDensity={setDensity}
        meta={stash.meta}
      />
      {warnings.length > 0 && <WarningsStrip warnings={warnings} />}
      <div dangerouslySetInnerHTML={{ __html: sheetHtml }} />
    </div>
  );
}

function WarningsStrip({ warnings }: { warnings: string[] }) {
  return (
    <div className="print:hidden fixed inset-x-0 top-0 z-40 border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900 shadow-sm">
      <div className="mx-auto max-w-5xl">
        <strong>{warnings.length} engine warning{warnings.length === 1 ? "" : "s"}:</strong>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          {warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function DevBar({
  density,
  setDensity,
  meta,
}: {
  density: Density;
  setDensity: (d: Density) => void;
  meta?: Stash["meta"];
}) {
  // For results from a real engine run, the PDF export uses the same
  // sample-driven /api/pdf route — TODO Step 7 wires a /api/pdf-from-stash
  // that pulls from the persisted SheetContent instead. For now, the
  // density preview is enough to validate the engine output.
  return (
    <nav
      aria-label="Sheet dev bar"
      className="print:hidden fixed right-3 top-3 z-50 flex items-center gap-2 rounded border border-neutral-300 bg-white/95 p-1 text-xs shadow"
    >
      <span className="px-1 py-0.5 text-neutral-500">density:</span>
      {(["minimal", "standard", "max"] as Density[]).map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => setDensity(d)}
          className={`rounded px-2 py-0.5 ${density === d ? "bg-black text-white" : "bg-white text-black hover:bg-neutral-200"}`}
        >
          {d}
        </button>
      ))}
      <span className="mx-1 self-center text-neutral-300">|</span>
      <Link
        href="/generate"
        className="rounded bg-neutral-100 px-2 py-0.5 text-black hover:bg-neutral-200"
      >
        ← New
      </Link>
      {meta?.model && (
        <span
          className="ml-1 text-neutral-400"
          title={`model: ${meta.model}${meta.retried ? " (retried)" : ""}${meta.inputTokens ? ` · ${meta.inputTokens} in / ${meta.outputTokens} out` : ""}`}
        >
          {meta.model.split("-").slice(0, 2).join("-")}
          {meta.retried ? " ↺" : ""}
        </span>
      )}
    </nav>
  );
}
