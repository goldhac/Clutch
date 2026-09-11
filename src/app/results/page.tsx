"use client";

import "@/renderer/density.css";
import "@/renderer/semantics.css";
import "@/renderer/sheet.css";

import { useEffect, useMemo, useState } from "react";
import { safeParseSheetContent, type SheetContent } from "@/contract/sheet-content";
import { FittedSheet, TwoPageSheet, type Density } from "@/components/sheet";
import { EMPTY_CTX, type ScoreCtx } from "@/components/sheet/relevance";
import { LinkButton, Wordmark, Toaster, toast, Modal, ModalOptions, OptionTile } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * /results — v2 handoff: sticky toolbar (breadcrumb · fit chip · Save /
 * Make another / Export), salmon warning strip, pages centered on the
 * workspace, and the fixed bottom DOCK — density switch, free preset
 * chips, "Edit in your own words" (Pro: dark editor panel; free: the
 * upsell card). The sealed back page renders inside TwoPageSheet.
 *
 * All product logic unchanged: session stash + ?g= self-seed, contract
 * validation, deterministic preset patches, /api/tweak Pro edits,
 * /api/pdf export (front page vs both), Supabase save.
 */
interface Stash {
  content: unknown;
  meta?: { model?: string; retried?: boolean; inputTokens?: number; outputTokens?: number };
  warnings?: string[];
  density?: Density;
  ctx?: ScoreCtx;
  tier?: "free" | "pro";
  savedAt?: string;
}

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
  const [exportModal, setExportModal] = useState(false);
  const [ctxPatch, setCtxPatch] = useState<Partial<ScoreCtx>>({});
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [upsellOpen, setUpsellOpen] = useState(false);
  const [tweaking, setTweaking] = useState(false);
  const [tweakError, setTweakError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const g = sp.get("g");
    if (g) {
      const tier = sp.get("tier") === "pro" ? ("pro" as const) : ("free" as const);
      fetch(`/api/dev-pool?g=${encodeURIComponent(g)}`)
        .then(async (r) => {
          if (!r.ok) throw new Error(await r.text());
          const { content } = (await r.json()) as { content: unknown };
          const seeded: Stash = {
            content,
            meta: { model: "gemini-2.5-pro" },
            warnings: [],
            density: "max",
            tier,
            ctx: EMPTY_CTX,
            savedAt: new Date().toISOString(),
          };
          sessionStorage.setItem("clutch:last", JSON.stringify(seeded));
          setStash(seeded);
          setDensity("max");
        })
        .catch((e) => setError(e instanceof Error ? e.message : String(e)));
      return;
    }
    try {
      const raw = sessionStorage.getItem("clutch:last");
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
        <h1 className="mt-8 font-serif text-[34px] tracking-[-0.025em] text-[var(--ink-900)]">
          Nothing to show yet
        </h1>
        <p className="mt-3 max-w-sm text-[15px] leading-[1.6] text-[var(--ink-600)]">{error}</p>
        <LinkButton href="/generate" className="mt-6">
          Make a sheet
        </LinkButton>
      </div>
    );
  }

  if (!stash || !content) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--paper)]">
        <div className="flex items-center gap-3 font-mono text-[12px] text-[var(--ink-500)]">
          <span aria-hidden className="h-4 w-4 animate-[cl-spin_800ms_linear_infinite] rounded-full border-2 border-[var(--ink-300)] border-t-transparent" />
          loading your sheet
        </div>
      </div>
    );
  }

  const tier = stash.tier ?? "free";
  const pro = tier === "pro";
  const effectiveCtx: ScoreCtx = { ...(stash.ctx ?? EMPTY_CTX), ...ctxPatch };
  const warnings = stash.warnings ?? [];
  const showWarnings = warnings.length > 0 && !dismissed;
  const maxLocked = density === "max" && !pro;

  async function runExport(page?: "front") {
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch("/api/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          density,
          ctx: effectiveCtx,
          ...(page ? { page } : density === "max" && pro ? { page: "front" } : {}),
        }),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      window.open(objUrl, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(objUrl), 60_000);
      toast(density === "max" && pro ? "Exported · 2-page PDF" : "Exported · front page PDF");
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }

  function onExportClick() {
    // MAX while locked → the export decision modal (front free / both
    // pages needs the unlock). Everything else exports directly.
    if (maxLocked) setExportModal(true);
    else void runExport();
  }

  function applyPreset(label: string, patch: Partial<ScoreCtx>) {
    setCtxPatch(patch);
    setActivePreset(label);
  }

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
      sessionStorage.setItem("clutch:last", JSON.stringify(next));
      setInstruction("");
      setEditorOpen(false);
      toast("Sheet rewritten to your instruction");
    } catch (e) {
      setTweakError(e instanceof Error ? e.message : String(e));
    } finally {
      setTweaking(false);
    }
  }

  async function saveToLibrary() {
    if (!content) return;
    setSaving(true);
    setSaveError(null);
    try {
      const supabase = supabaseBrowser();
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) {
        window.location.href = "/auth?next=" + encodeURIComponent("/results");
        return;
      }
      const { data, error: insErr } = await supabase
        .from("sheets")
        .insert({
          user_id: userRes.user.id,
          title: content.title,
          content: content as unknown as Record<string, unknown>,
          ctx: effectiveCtx as unknown as Record<string, unknown>,
        })
        .select("id")
        .single();
      if (insErr) throw insErr;
      setSavedId(data.id);
      toast("Saved to My Sheets");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--paper-2)]">
      <Toaster />

      {/* ── toolbar ─────────────────────────────────────────────────── */}
      <header className="print:hidden sticky top-0 z-[var(--z-sticky)] border-b border-[var(--border-input)] bg-[var(--paper-glass)] backdrop-blur-[10px]">
        <div className="mx-auto flex h-[58px] max-w-[1320px] items-center gap-3.5 px-4 sm:px-7">
          <Wordmark size="sm" />
          <span aria-hidden className="hidden text-[var(--ink-300)] sm:inline">/</span>
          <span className="hidden min-w-0 truncate text-[14px] font-medium text-[var(--ink-800)] sm:inline">
            {content.title}
          </span>
          {warnings.length > 0 ? (
            <span className="hidden shrink-0 rounded-full bg-[var(--salmon)] px-2.5 py-[3px] font-mono text-[11px] font-semibold text-[var(--salmon-text)] md:inline">
              {warnings.length} warning{warnings.length === 1 ? "" : "s"}
            </span>
          ) : (
            <span className="hidden shrink-0 rounded-full bg-[var(--conf-high-bg)] px-2.5 py-[3px] font-mono text-[11px] font-semibold text-[var(--conf-high)] md:inline">
              Fits at {density.toUpperCase()}
            </span>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void saveToLibrary()}
              disabled={saving || !!savedId}
              className="tap hidden h-[34px] items-center rounded-[var(--r-md)] border border-[var(--border-input)] bg-[var(--surface)] px-3.5 text-[13px] font-semibold text-[var(--ink-900)] transition-[background-color] duration-[160ms] hover:bg-[var(--ink-50)] disabled:opacity-60 sm:inline-flex"
            >
              {savedId ? "Saved ✓" : saving ? "Saving…" : "Save"}
            </button>
            <LinkButton href="/generate" variant="secondary" size="sm" className="tap hidden !h-[34px] sm:inline-flex">
              Make another
            </LinkButton>
            <button
              type="button"
              onClick={onExportClick}
              disabled={exporting}
              className="inline-flex h-[34px] items-center gap-1.5 rounded-[var(--r-md)] bg-[var(--band)] px-3.5 text-[13px] font-semibold text-white transition-[background-color,transform] duration-[160ms] ease-[var(--ease-out)] hover:bg-[var(--band-2)] active:scale-[0.98] disabled:opacity-60"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              </svg>
              {exporting ? "Rendering…" : maxLocked ? "Export" : "Export PDF"}
            </button>
          </div>
        </div>

        {showWarnings && (
          <div className="mx-auto max-w-[1320px] px-4 pb-3 sm:px-7">
            <div className="flex items-start gap-[11px] rounded-[9px] border border-[var(--salmon-line)] bg-[var(--salmon)] px-3.5 py-3">
              <span aria-hidden className="shrink-0 text-[13px] text-[var(--salmon-text)]">★</span>
              <div className="flex-1 text-[13px] leading-[1.55] text-[var(--ink-800)]">
                {warnings.join(" ")}
              </div>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="shrink-0 border-b border-[#e0bfae] font-mono text-[11px] text-[var(--salmon-text)]"
              >
                dismiss
              </button>
            </div>
          </div>
        )}
        {(exportError || saveError || tweakError) && (
          <div className="mx-auto max-w-[1320px] px-4 pb-3 sm:px-7">
            <div role="alert" className="rounded-[9px] border border-[var(--conf-low)]/25 bg-[var(--conf-low-bg)] px-3.5 py-3 text-[13px] leading-[1.55] text-[var(--conf-low-deep)]">
              {exportError ? `Export failed: ${exportError}` : saveError ? `Save failed: ${saveError}` : `Edit failed: ${tweakError}`}
            </div>
          </div>
        )}
      </header>

      {/* ── workspace ───────────────────────────────────────────────── */}
      <div className="px-4 pb-[168px] pt-9">
        <div className="mx-auto flex max-w-[1320px] flex-col items-center gap-[34px]">
          {/* The sheet is a fixed 1122px page and will always be wider
           * than a phone. `overflow-x-auto` only scrolls if the scroller
           * itself fits the viewport — previously it sat on the flex row,
           * which was itself 1122px wide, so the PAGE scrolled sideways
           * instead (373px at 375px viewport). The scroller now takes the
           * viewport width and the wide row lives inside it. */}
          <div className="w-full max-w-full overflow-x-auto">
            <div className="flex min-w-max justify-center">
              <div className="animate-[cl-rise_400ms_var(--ease-pop)]">
                {density === "max" ? (
                  <TwoPageSheet content={content} ctx={effectiveCtx} lockBack={!pro} />
                ) : (
                  <div className="shadow-[0_30px_60px_rgba(17,17,20,.18),0_4px_10px_rgba(17,17,20,.08)]">
                    <FittedSheet content={content} density={density} ctx={effectiveCtx} />
                  </div>
                )}
              </div>
            </div>
          </div>

          {stash.meta?.model && (
            <div className="print:hidden flex items-center gap-2 font-mono text-[11px] text-[var(--ink-500)]">
              <span>generated by {stash.meta.model}{stash.meta.retried ? " (retried)" : ""}</span>
              <span aria-hidden className="text-[var(--ink-300)]">·</span>
              <a href="/library" className="tap-area underline-offset-2 hover:underline">My Sheets</a>
            </div>
          )}
        </div>
      </div>

      {/* ── the dock ────────────────────────────────────────────────── */}
      <div className="print:hidden pointer-events-none fixed inset-x-0 bottom-0 z-[var(--z-overlay)] flex flex-col items-center gap-2.5 px-5 pb-[22px]">
        {editorOpen && pro && (
          <div className="pointer-events-auto w-full max-w-[640px] animate-[cl-rise_220ms_var(--ease-pop)] rounded-[14px] bg-[var(--band-2)] p-4 shadow-[0_20px_50px_rgba(17,17,20,.4)]">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-white">Edit in your own words</span>
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="font-mono text-[11px] text-[var(--on-band-muted)] hover:text-[var(--on-band)]"
              >
                close
              </button>
            </div>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={2}
              maxLength={500}
              disabled={tweaking}
              placeholder="shorter questions · more SQL formulas · drop the Tableau section · add a worked example to every trap"
              className="mt-2.5 w-full resize-none rounded-[9px] border border-[var(--band-line)] bg-[var(--band)] px-3 py-[11px] text-[13px] leading-[1.5] text-white outline-none placeholder:text-[var(--ink-500)] focus:border-[var(--signal-500)]"
            />
            <div className="mt-2.5 flex items-center justify-between gap-4">
              <span className="font-mono text-[11px] text-[var(--ink-500)]">
                re-runs the engine on your pool · usually 2–3 minutes
              </span>
              <button
                type="button"
                onClick={() => void applyTweak()}
                disabled={!instruction.trim() || tweaking}
                className="inline-flex h-9 items-center gap-2 rounded-[9px] bg-white px-4 text-[13px] font-semibold text-[var(--ink-900)] transition-[opacity,transform] duration-[160ms] active:scale-[0.98] disabled:opacity-40"
              >
                {tweaking && (
                  <span aria-hidden className="h-3.5 w-3.5 animate-[cl-spin_800ms_linear_infinite] rounded-full border-2 border-[var(--ink-400)] border-t-transparent" />
                )}
                {tweaking ? "Rewriting…" : "Apply edit"}
              </button>
            </div>
          </div>
        )}

        {upsellOpen && !pro && (
          <div className="pointer-events-auto w-full max-w-[520px] animate-[cl-rise_220ms_var(--ease-pop)] rounded-[14px] border border-[var(--border-input)] bg-white p-5 shadow-[0_20px_50px_rgba(17,17,20,.24)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[14px] font-semibold text-[var(--ink-900)]">
                  Custom edits come with the unlock
                </div>
                <p className="mt-1.5 max-w-[44ch] text-[13px] leading-[1.6] text-[var(--ink-600)]" style={{ textWrap: "pretty" }}>
                  The preset mixes below are free and instant. Rewriting the sheet in your own
                  words re-runs the engine on your pool — that is part of unlocking this sheet.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setUpsellOpen(false)}
                className="shrink-0 font-mono text-[11px] text-[var(--ink-500)] hover:text-[var(--ink-900)]"
              >
                close
              </button>
            </div>
            <a
              href="/pricing"
              className="mt-3.5 inline-flex h-[38px] items-center rounded-[9px] bg-[var(--band)] px-4 text-[13px] font-semibold text-white transition-transform duration-[160ms] active:scale-[0.98]"
            >
              Unlock this sheet · $4.99
            </a>
          </div>
        )}

        <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-3 rounded-[14px] bg-[var(--band)] px-3 py-[9px] shadow-[0_18px_44px_rgba(17,17,20,.34),0_2px_6px_rgba(17,17,20,.2)]">
          <span className="flex shrink-0 items-center rounded-[9px] bg-white/[0.08] p-[3px]">
            {DENSITY_OPTS.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => setDensity(d.value)}
                className={
                  "tap rounded-[6px] px-3 py-[5px] text-[12.5px] font-semibold transition-[background-color,color] duration-[160ms] " +
                  (density === d.value
                    ? "bg-white text-[var(--band)]"
                    : "text-[var(--on-band-muted)] hover:text-[var(--on-band)]")
                }
              >
                {d.label}
              </button>
            ))}
          </span>
          <span aria-hidden className="hidden h-[26px] w-px bg-[var(--ink-700)] sm:block" />
          <span className="flex flex-wrap items-center justify-center gap-1.5">
            {FREE_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p.label, p.patch)}
                className={
                  "tap rounded-full border px-2.5 py-1 text-[12px] font-medium transition-[background-color,color,border-color] duration-[160ms] " +
                  (activePreset === p.label
                    ? "border-white bg-white text-[var(--band)]"
                    : "border-[var(--band-line)] text-[var(--on-band-muted)] hover:border-[var(--ink-500)] hover:text-[var(--on-band)]")
                }
              >
                {p.label}
              </button>
            ))}
          </span>
          <span aria-hidden className="hidden h-[26px] w-px bg-[var(--ink-700)] sm:block" />
          <button
            type="button"
            onClick={() => {
              if (pro) {
                setEditorOpen((v) => !v);
                setUpsellOpen(false);
              } else {
                setUpsellOpen((v) => !v);
                setEditorOpen(false);
              }
            }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-[9px] px-3 py-[7px] text-[12.5px] font-semibold text-white transition-colors duration-[160ms] hover:bg-white/10"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
            Edit in your own words
            {!pro && <span aria-hidden className="text-[var(--verified)]">✦</span>}
          </button>
        </div>
        <div className="pointer-events-none font-mono text-[11px] text-[var(--ink-500)]">
          presets are free &amp; instant · custom edits re-run the engine on your pool
        </div>
      </div>

      {/* ── export decision (MAX while locked) ──────────────────────── */}
      <Modal
        open={exportModal}
        onClose={() => setExportModal(false)}
        tone="decision"
        eyebrow="EXPORT · PDF"
        title="Which pages?"
        footer={{ tint: "plain", text: "prints at 100% on A4 landscape, borderless" }}
      >
        <p>
          The front page exports free. The back page is sealed — unlocking this sheet exports
          both pages as one PDF.
        </p>
        <ModalOptions>
          <OptionTile
            primary
            label="Front page"
            sub="free · page 1 of 2"
            onClick={() => {
              setExportModal(false);
              void runExport("front");
            }}
          />
          <OptionTile
            label="Both pages"
            sub="needs the $4.99 unlock"
            onClick={() => {
              setExportModal(false);
              window.location.href = "/pricing";
            }}
          />
        </ModalOptions>
      </Modal>
    </div>
  );
}
