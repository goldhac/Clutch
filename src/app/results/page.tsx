"use client";

import "@/renderer/density.css";
import "@/renderer/semantics.css";
import "@/renderer/sheet.css";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { safeParseSheetContent, type SheetContent } from "@/contract/sheet-content";
import { FittedSheet, type Density } from "@/components/sheet";
import { EMPTY_CTX, type ScoreCtx } from "@/components/sheet/relevance";
import {
  Button,
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
  /** Scoring context (R2) — files/examType/priority for Layer A. */
  ctx?: ScoreCtx;
  /** Entitlement tier. UI-gated today; server-enforced once auth lands. */
  tier?: "free" | "pro";
  savedAt?: string;
}

/** Free-tier presets — steer the DETERMINISTIC composer (no engine call,
 * instant). Each maps to the ScoreCtx controls the relevance system
 * already honors. */
const FREE_PRESETS: { label: string; patch: Partial<ScoreCtx> }[] = [
  { label: "More formulas", patch: { priority: "formulas" } },
  { label: "More concepts", patch: { priority: "concepts" } },
  { label: "Problem-heavy", patch: { examType: "problem-solving" } },
  { label: "Concept-heavy", patch: { examType: "conceptual" } },
  { label: "Reset mix", patch: { priority: "balanced", examType: "mixed" } },
];

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
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  // Adjust panel state — free presets patch the compose ctx locally;
  // Pro free-text tweaks go through /api/tweak and replace the pool.
  const [ctxPatch, setCtxPatch] = useState<Partial<ScoreCtx>>({});
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [tweaking, setTweaking] = useState(false);
  const [tweakError, setTweakError] = useState<string | null>(null);

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

  // Export via POST (R4): the user's pool lives only in this browser
  // session, so we ship it to /api/pdf, which stashes it, renders /print
  // through Playwright (FitController + clip verifier), and streams the
  // one-page PDF back. 422 = the render violated a rule (clip / page count).
  async function exportPdf() {
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch("/api/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, density, ctx: effectiveCtx }),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      window.open(objUrl, "_blank", "noopener");
      // Revoke after the new tab has had time to load the blob.
      setTimeout(() => URL.revokeObjectURL(objUrl), 60_000);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }

  const tier = stash?.tier ?? "free";
  const effectiveCtx: ScoreCtx = { ...(stash?.ctx ?? EMPTY_CTX), ...ctxPatch };

  function applyPreset(label: string, patch: Partial<ScoreCtx>) {
    setCtxPatch(patch);
    setActivePreset(label);
  }

  // Pro: free-text tweak — the pool is engine-edited then contract
  // re-validated; the stash is updated so exports use the edited sheet.
  async function applyTweak() {
    if (!instruction.trim() || !stash || !content) return;
    setTweaking(true);
    setTweakError(null);
    try {
      const res = await fetch("/api/tweak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, instruction: instruction.trim() }),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      const payload = (await res.json()) as { content: unknown };
      const next = { ...stash, content: payload.content };
      setStash(next);
      sessionStorage.setItem("cramsheet:last", JSON.stringify(next));
      setInstruction("");
    } catch (e) {
      setTweakError(e instanceof Error ? e.message : String(e));
    } finally {
      setTweaking(false);
    }
  }

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
            <Button size="sm" onClick={exportPdf} loading={exporting}>
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              </svg>
              {exporting ? "Rendering…" : "Export PDF"}
            </Button>
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

        {exportError && (
          <div className="mx-auto max-w-6xl px-5 pb-3">
            <Callout variant="danger">PDF export failed: {exportError}</Callout>
          </div>
        )}
      </header>

      {/* ── Adjust panel — tiered edits ──────────────────────────────── */}
      <div className="print:hidden mx-auto max-w-6xl px-5 pt-5">
        <div className="rounded-[var(--r-lg)] border border-[var(--ink-150)] bg-[var(--paper)] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold text-[var(--ink-800)]">Adjust the sheet</span>
            <span className="text-[12px] text-[var(--ink-400)]">instant, no re-generation</span>
            <div className="ml-1 flex flex-wrap gap-1.5">
              {FREE_PRESETS.map((pz) => (
                <button
                  key={pz.label}
                  type="button"
                  onClick={() => applyPreset(pz.label, pz.patch)}
                  className={`rounded-full border px-2.5 py-0.5 text-[12px] font-medium transition-colors ${
                    activePreset === pz.label
                      ? "border-[var(--ink-900)] bg-[var(--ink-900)] text-white"
                      : "border-[var(--ink-200)] bg-white text-[var(--ink-700)] hover:border-[var(--ink-400)]"
                  }`}
                >
                  {pz.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 flex items-start gap-2">
            <div className="relative flex-1">
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                disabled={tier !== "pro" || tweaking}
                rows={2}
                maxLength={500}
                placeholder={'Tell it what to change — e.g. "shorter questions" · "more SQL formulas" · "drop the Tableau section" · "add worked examples to every trap"'}
                className="w-full resize-none rounded-[var(--r-md)] border border-[var(--ink-200)] bg-white px-3 py-2 text-[13px] text-[var(--ink-900)] placeholder:text-[var(--ink-400)] focus:border-[var(--ink-500)] focus:outline-none disabled:bg-[var(--ink-100)] disabled:text-[var(--ink-400)]"
              />
              {tier !== "pro" && (
                <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-[var(--ink-900)] px-2 py-0.5 text-[11px] font-semibold text-white">
                  ✦ Pro
                </span>
              )}
            </div>
            <Button
              size="sm"
              onClick={applyTweak}
              disabled={tier !== "pro" || !instruction.trim()}
              loading={tweaking}
            >
              {tweaking ? "Editing…" : "Apply edit"}
            </Button>
          </div>
          {tier !== "pro" && (
            <p className="mt-1.5 text-[12px] text-[var(--ink-500)]">
              Free tier: use the preset chips above. Custom edits — in your own words —
              come with <Link href="/pricing" className="underline">Pro</Link>.
            </p>
          )}
          {tweakError && (
            <div className="mt-2">
              <Callout variant="danger">Edit failed: {tweakError}</Callout>
            </div>
          )}
        </div>
      </div>

      {/* ── The sheet, centered on the workspace ─────────────────────── */}
      <div className="flex justify-center overflow-x-auto px-4 py-8">
        <div className="rounded-[var(--r-lg)] shadow-[var(--sh-xl)]">
          <FittedSheet content={content} density={density} ctx={effectiveCtx} />
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
