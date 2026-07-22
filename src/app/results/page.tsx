"use client";

import "@/renderer/density.css";
import "@/renderer/semantics.css";
import "@/renderer/sheet.css";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { safeParseSheetContent, type SheetContent } from "@/contract/sheet-content";
import { Sheet, type Density } from "@/components/sheet";
import {
  LinkButton,
  Callout,
  Chip,
  SegmentedControl,
  Wordmark,
} from "@/components/ui";

interface Stash {
  content: unknown;
  meta?: {
    model?: string;
    retried?: boolean;
    inputTokens?: number;
    outputTokens?: number;
  };
  warnings?: string[];
  density?: Density;
  savedAt?: string;
}

const DENSITY_OPTS = [
  { value: "max" as const, label: "MAX" },
  { value: "balanced" as const, label: "Balanced" },
  { value: "essentials" as const, label: "Essentials" },
];

export default function ResultsPage() {
  const [stash, setStash] = useState<Stash | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [density, setDensity] = useState<Density>("max");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("cramsheet:last");
      if (!raw) {
        setError("No generated sheet found in this session. Generate one to see it here.");
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
        "The engine output didn't pass the contract validator: " +
          result.error.issues.map((i) => i.message).join("; "),
      );
      return null;
    }
    return result.data;
  }, [stash]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--paper)] px-6 text-center">
        <Wordmark href="/" />
        <h1 className="mt-8 font-serif text-3xl text-[var(--ink-900)]">Nothing to show yet</h1>
        <p className="mt-2 max-w-sm text-[15px] text-[var(--ink-600)]">{error}</p>
        <LinkButton href="/generate" className="mt-6">
          Make a sheet
        </LinkButton>
      </div>
    );
  }

  if (!stash || !content) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--paper)]">
        <p className="text-[14px] text-[var(--ink-500)]">Loading your sheet…</p>
      </div>
    );
  }

  const warnings = stash.warnings ?? [];
  const showWarnings = warnings.length > 0 && !dismissed;

  return (
    <div className="min-h-screen bg-[var(--paper-2)]">
      {/* ── Results toolbar (sticky) ─────────────────────────────────── */}
      <header className="print:hidden sticky top-0 z-[var(--z-sticky)] border-b border-[var(--ink-150)] bg-[color-mix(in_srgb,var(--paper)_88%,transparent)] backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-5 py-2.5">
          <Wordmark />
          <span className="text-[var(--ink-300)]">/</span>
          <span className="text-[14px] font-medium text-[var(--ink-700)]">{content.title}</span>
          {warnings.length > 0 ? (
            <Chip tone="warn">
              {warnings.length} warning{warnings.length === 1 ? "" : "s"}
            </Chip>
          ) : (
            <Chip tone="success">Fits at {density.toUpperCase()}</Chip>
          )}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <SegmentedControl
              ariaLabel="Density"
              size="sm"
              value={density}
              onChange={setDensity}
              options={DENSITY_OPTS}
            />
            <LinkButton href="/generate" size="sm" variant="secondary">
              Make another
            </LinkButton>
            <LinkButton
              href={`/api/pdf?density=${density}`}
              size="sm"
              target="_blank"
              rel="noopener"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              </svg>
              Export PDF
            </LinkButton>
          </div>
        </div>

        {showWarnings && (
          <div className="mx-auto max-w-6xl space-y-2 px-5 pb-3">
            {warnings.map((w, i) => (
              <Callout key={i} variant="warn">
                {w}
              </Callout>
            ))}
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="text-[12px] text-[var(--ink-500)] underline hover:text-[var(--ink-800)]"
            >
              Dismiss warnings
            </button>
          </div>
        )}
      </header>

      {/* ── The sheet, centered on the workspace ─────────────────────── */}
      <div className="flex justify-center overflow-x-auto px-4 py-8">
        <div className="rounded-[var(--r-lg)] shadow-[var(--sh-xl)]">
          <Sheet content={content} density={density} />
        </div>
      </div>

      {stash.meta?.model && (
        <p className="print:hidden pb-10 text-center font-mono text-[11px] text-[var(--ink-400)]">
          generated by {stash.meta.model}
          {stash.meta.retried ? " (retried)" : ""}
          {" · "}
          <Link href="/library" className="underline">
            My Sheets
          </Link>
        </p>
      )}
    </div>
  );
}
