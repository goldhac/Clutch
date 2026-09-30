"use client";

import "@/renderer/density.css";
import "@/renderer/semantics.css";
import "@/renderer/sheet.css";

import { useEffect, useMemo, useState, useRef } from "react";
import { safeParseSheetContent, type SheetContent } from "@/contract/sheet-content";
import { FittedSheet, TwoPageSheet, type Density } from "@/components/sheet";
import { TopicRail } from "./TopicRail";
import { EditLine } from "./EditLine";
import { VersionPanel } from "./VersionPanel";
import { ViewTray } from "./ViewTray";
import { ago, describeChange, listVersions, saveVersion, VERSION_DEBOUNCE_MS, type SheetVersion } from "@/lib/sheet-versions";
import { applyEdit, editFields, editKey, removeLine } from "@/components/sheet/modules";
import { EMPTY_CTX, viewOf, type ScoreCtx, type ViewOptions } from "@/components/sheet/relevance";
import { defaultFigureIds } from "@/components/sheet/Figures";
import type { FreeAction } from "@/lib/edit-router";
import { EditChat } from "./EditChat";
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
  /** Set when the sheet was opened from My Sheets: the row this session edits. */
  sheetId?: string;
}


/**
 * One dock button, so the eight of them are one control rather than eight guesses.
 *
 * `open` is the tether's opener half: while its tray is up the button goes white-on-ink, which is
 * what ties the panel hanging above it to the thing that summoned it.
 */
function DockButton({
  open,
  onClick,
  hideOnPhone = true,
  phoneOpen = false,
  children,
  ...rest
}: {
  open?: boolean;
  onClick: () => void;
  /** False for the ones that survive on a phone: Topics, Edit, Export. */
  hideOnPhone?: boolean;
  /** The phone's "More" is open, so the folded controls are showing. */
  phoneOpen?: boolean;
  children: React.ReactNode;
} & React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...rest}
      className={
        (hideOnPhone && !phoneOpen ? "hidden sm:inline-flex " : "inline-flex ") +
        "ctl tap h-9 shrink-0 items-center gap-1.5 rounded-[9px] px-3 text-[13px] font-semibold " +
        (open ? "bg-white text-[var(--band)]" : "text-white hover:shadow-[inset_0_0_0_1px_#3a3a45]")
      }
    >
      {children}
    </button>
  );
}

const DockDivider = () => (
  <span aria-hidden className="mx-1 hidden h-6 w-px bg-[var(--band-line)] sm:block" />
);

const DENSITY_OPTS = [
  { value: "max" as const, label: "MAX" },
  { value: "balanced" as const, label: "Balanced" },
  { value: "essentials" as const, label: "Essentials" },
];

/** Last known account tier on this device, so the first paint is already the right layout. */
const TIER_CACHE = "clutch:tier";
/** Back page used less than this (0–1) → restock from the pack. */
const AUTO_FILL_BELOW = 0.85;
const AUTO_FILL_MAX = 3;
/** How long the layout must hold still before a fill is worth paying for. */
const SETTLE_MS = 1500;

export default function ResultsPage() {
  const [stash, setStash] = useState<Stash | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [density, setDensity] = useState<Density>("max");
  const [dismissed, setDismissed] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportModal, setExportModal] = useState(false);
  const [ctxPatch, setCtxPatch] = useState<Partial<ScoreCtx>>({});
  // Still set by the chat router ("problem-heavy"); nothing displays it since the dock dropped
  // the preset pills for the rail's per-topic section mix.
  const [, setActivePreset] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  // Measured by the sheet itself: how much of the back page is used (null until the first fit).
  const [backFill, setBackFill] = useState<number | null>(null);
  const [chatAutoSend, setChatAutoSend] = useState<string | undefined>(undefined);
  // Phones: the dock's options would cover ~40% of the screen, so they fold behind one button.
  const [dockOpen, setDockOpen] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);
  /** The per-topic rail (#20). Same tray idiom as Diagrams: one open at a time. */
  const [railOpen, setRailOpen] = useState(false);
  /** The line the student clicked to edit (#20): its value-based key, not its position. */
  const [editing, setEditing] = useState<{ key: string; a: string; b: string; labels: [string, string]; wasVerified: boolean; src?: string; mine?: boolean; topic?: string; topicIndex?: number } | null>(null);
  /**
   * The topic the student is pointing at in the rail (#20). Ephemeral: it is NOT view state and
   * must never reach the stash — it is a preview of what unticking would remove.
   */
  const [previewTopic, setPreviewTopic] = useState<string | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  /** The display controls (§9), one tray instead of five loose dock groups. */
  const [viewOpen, setViewOpen] = useState(false);
  const [versions, setVersions] = useState<SheetVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  /** The content as it was BEFORE the burst of edits currently being debounced. */
  const pendingVersionRef = useRef<unknown>(null);
  const versionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A debounced version still owed when the page goes away is a version lost. Clearing the timer
  // is not enough — but writing on unmount is unreliable too, so the honest fix is a SHORT debounce
  // (4 s) and accepting that closing the tab mid-burst loses at most that burst's starting point.
  // The edit itself is already saved; only the undo point would be missing.
  useEffect(() => () => { if (versionTimerRef.current) clearTimeout(versionTimerRef.current); }, []);

  // null = not known yet. The sheet is NOT drawn until it is: free and Pro lay the pages out
  // differently (Pro = one continuous flow), so drawing first as free made every Pro account
  // watch the sheet re-lay itself out a few seconds in.
  const [profileTier, setProfileTier] = useState<"free" | "pro" | null>(null);

  useEffect(() => {
    let cancelled = false;
    const settle = (t: "free" | "pro") => {
      if (cancelled) return;
      setProfileTier(t);
      try {
        localStorage.setItem(TIER_CACHE, t);
      } catch {
        /* private mode: no cache, the wait below still applies */
      }
    };
    // Last known tier on this device paints at once; the real one replaces it when it lands.
    // Cosmetic only: /api/pdf and /api/edit decide entitlement on the server.
    // Only while a sign-in cookie exists: signed out is free, with nothing to wait for.
    const signedIn = document.cookie.split(";").some((c) => /^\s*sb-.*-auth-token/.test(c));
    if (!signedIn) {
      settle("free");
      return;
    }
    try {
      const cached = localStorage.getItem(TIER_CACHE);
      if (cached === "pro" || cached === "free") setProfileTier(cached);
    } catch {
      /* ignore */
    }
    const supabase = supabaseBrowser();
    // getSession reads the cookie (no round trip); getUser would add a network call before the
    // profile query even starts.
    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        const uid = data.session?.user.id;
        if (!uid) return settle("free");
        const { data: profile } = await supabase.from("profiles").select("tier").eq("id", uid).single();
        settle(profile?.tier === "pro" ? "pro" : "free");
      })
      .catch(() => settle("free")); // signed out or offline
    // Never hold the sheet hostage to a slow network.
    const giveUp = setTimeout(() => setProfileTier((t) => t ?? "free"), 2500);
    return () => {
      cancelled = true;
      clearTimeout(giveUp);
    };
  }, []);
  // Every accepted chat edit can be taken back (this visit).
  const [undoStack, setUndoStack] = useState<unknown[]>([]);
  const [upsellOpen, setUpsellOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  // Content changed since the last save (edits, fills): Save becomes "Save changes" and updates the row.
  const [dirty, setDirty] = useState(false);
  /** When the row last took a write, for the dock's "Saved · 2m ago". */
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  /** Re-reads that relative time once a minute; nothing else in the page ticks. */
  const [tick, setTick] = useState(() => Date.now());
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
      if (parsed.sheetId) setSavedId(parsed.sheetId);
      if (parsed.savedAt) setLastSavedAt(parsed.savedAt);
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

  // ── Auto-fill: the sheet keeps both sides full on its own ─────────────────────────────────
  // The fitter reshapes instantly from the ranked bench on every toggle and edit. When the bench
  // runs dry (an older sheet, a removed topic, quiz mode), this restocks it from the student's own
  // files: no banner, no approval step — a note while it works, then "Added N lines · Undo".
  // Bounded: it waits for the layout to settle, never runs while the chat is open (a pending
  // proposal was computed against the current lines), stops when the files have nothing more to
  // give or the student undoes it, and runs at most AUTO_FILL_MAX times a visit.
  const [autoFill, setAutoFill] = useState<"idle" | "filling" | "off">("idle");
  const autoFillRuns = useRef(0);
  // Lines the fitter is showing right now; with backFill it says how many lines two pages hold in THIS view.
  const fitLinesRef = useRef(0);
  const stashRef = useRef(stash);
  stashRef.current = stash;
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  /**
   * Keep an already-saved sheet saved.
   *
   * The dock reads "Saved · 2m ago", and a label that says so while the row is stale would be a
   * lie. This only ever writes a row the student already asked us to keep — the FIRST save stays
   * explicit, and undo plus the last 20 versions are both still there if a write was not wanted.
   */
  useEffect(() => {
    if (!savedId || !dirty || saving) return;
    const t = setTimeout(() => void saveToLibrary(), 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedId, dirty, saving, content]);

  const savedIdRef = useRef(savedId);
  savedIdRef.current = savedId;
  // The decision is made from LIVE values on a one-second watchdog, not from a React dependency
  // firing at the right moment. A sheet opened from My Sheets once sat at 0% for a minute because
  // the measurement that should have started the fill landed while another condition was still
  // settling, and nothing changed afterwards to run the check again. A watchdog cannot miss that.
  const autoFillRef = useRef<"idle" | "filling" | "off">("idle");
  /** Ref first, then state: the watchdog reads the ref a second later, before React has re-rendered. */
  const setFillState = (v: "idle" | "filling" | "off") => {
    autoFillRef.current = v;
    setAutoFill(v);
  };
  const backFillRef = useRef<number | null>(backFill);
  const settledAt = useRef(0);
  if (backFillRef.current !== backFill) {
    backFillRef.current = backFill;
    settledAt.current = Date.now(); // the layout just changed; let it settle before spending a call
  }
  /**
   * Has the student taken the sheet into their own hands? (#20)
   *
   * Any module control — an unticked topic, a trimmed one, a changed section mix — means the gaps
   * on this sheet are DELIBERATE. Found on live 2026-09-29: unticking a topic dropped the back
   * page under the auto-fill threshold, and the watchdog immediately spent a model call writing
   * new lines to fill the space the student had just chosen to empty. It undid their edit and
   * charged them for it.
   *
   * The fitter still refills from the bench, which is free and instant and is what "its space goes
   * to the rest" means. What stands down is the paid call.
   */
  // Read from the stash rather than effectiveCtx, which is built further down: this runs in the
  // auto-fill watchdog, above the render.
  const curating = Object.keys(stash?.ctx?.view?.modules ?? {}).length > 0;

  const canAutoFill =
    density === "max" && !editorOpen && !curating && !!stash &&
    (profileTier === "pro" || (process.env.NODE_ENV !== "production" && stash?.tier === "pro"));
  useEffect(() => {
    if (!canAutoFill) return;
    let pack: string | null = null;
    try {
      pack = sessionStorage.getItem("clutch:pack");
    } catch {
      pack = null; // without the files' text the fill can still build practice on the sheet's own lines
    }
    let stopped = false;
    const fill = async () => {
      const cur = stashRef.current;
      const parsed = cur ? safeParseSheetContent(cur.content) : null;
      if (!cur || !parsed?.success) return setFillState("idle");
      // Free and instant first: every sheet already carries ranked, cited traps, hidden by default
      // only to save space. With space to spare they go on — unless the student chose otherwise.
      if (cur.ctx?.view?.traps === undefined && cur.ctx?.examFormat !== "true-false" && parsed.data.traps.length > 0) {
        setView((v) => ({ ...v, traps: true }));
        // Free and instant: not a fill. Hand the claim back — the watchdog looks again once the
        // refit reports how much room the traps left.
        return setFillState("idle");
      }
      autoFillRuns.current++;
      setFillState("filling");
      try {
        const res = await fetch("/api/edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "fill",
            auto: true,
            countTraps: viewOf(cur.ctx ?? undefined).traps,
            // Measured, not assumed: N lines cover (1 + backFill) / 2 of the two pages, so two full pages
            // in this view (quiz mode, sources on…) hold N / that. Plus surplus for the fitter to choose from.
            target: fitLinesRef.current > 0 ? Math.ceil((fitLinesRef.current / ((1 + (backFillRef.current ?? 0)) / 2)) * 1.12) : undefined,
            content: { ...parsed.data, figures: undefined },
            packText: pack ?? undefined,
            files: (cur.ctx?.files ?? []).map((f: { name: string }) => f.name),
            examFormat: cur.ctx?.examFormat,
          }),
        });
        if (!res.ok) {
          // Quiet is right for "you've had your fills today"; a provider outage the student can
          // retry deserves a word, since they are looking at a half-empty page wondering.
          if (res.status === 503) toast("Couldn't fill the back page just now — nothing changed. Try again in a bit.", "star");
          return setFillState("off");
        }
        const p = (await res.json()) as { ops: unknown[]; proposed: SheetContent; exhausted?: boolean };
        if (!p.ops?.length) return setFillState("off");
        const before = cur.content;
        const next = { ...p.proposed, figures: parsed.data.figures };
        const persist = (c: unknown) => {
          const id = savedIdRef.current;
          if (!id) return;
          // A sheet from My Sheets stays filled: the row is updated, never copied.
          void supabaseBrowser().from("sheets").update({ content: c as Record<string, unknown> }).eq("id", id)
            .then(({ error: e }) => { if (!e) { setDirty(false); setLastSavedAt(new Date().toISOString()); } });
        };
        setUndoStack((u) => [...u.slice(-9), before]);
        replaceContent(next);
        persist(next);
        toast(`Filled the back page · ${p.ops.length} lines added`, "check", {
          label: "Undo",
          onAction: () => {
            setFillState("off"); // the student said no: do not fill again this visit
            setUndoStack((u) => u.slice(0, -1));
            replaceContent(before);
            persist(before);
          },
        });
        setFillState(p.exhausted ? "off" : "idle");
      } catch {
        setFillState("off");
      }
    };
    const watchdog = setInterval(() => {
      if (stopped || autoFillRef.current !== "idle" || autoFillRuns.current >= AUTO_FILL_MAX) return;
      const room = backFillRef.current;
      if (room === null || room >= AUTO_FILL_BELOW) return;
      if (Date.now() - settledAt.current < SETTLE_MS) return;
      autoFillRef.current = "filling"; // claim it now: the next tick must not start a second fill
      void fill();
    }, 1000);
    return () => {
      stopped = true;
      clearInterval(watchdog);
    };
    // Only canAutoFill may restart the watchdog: the writers are re-made every render, and
    // listing them would tear this down and stand it back up on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAutoFill]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--paper)] px-6 text-center">
        <Wordmark href="/generate" />
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

  const tierPending = profileTier === null && !(process.env.NODE_ENV !== "production" && stash?.tier === "pro");
  if (!stash || !content || tierPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--paper)]">
        <div className="flex items-center gap-3 font-mono text-[12px] text-[var(--ink-500)]">
          <span aria-hidden className="h-4 w-4 animate-[cl-spin_800ms_linear_infinite] rounded-full border-2 border-[var(--ink-300)] border-t-transparent" />
          loading your sheet
        </div>
      </div>
    );
  }

  // Entitlement comes from the signed-in user's profile. The ?tier=pro preview switch is a
  // development aid only: before 2026-09-17 it was the ONLY source, so a real Pro account was
  // treated as free here (caught running the live flow), and anyone could add it to the URL.
  const previewTier = process.env.NODE_ENV !== "production" ? stash.tier : undefined;
  const tier = profileTier === "pro" || previewTier === "pro" ? "pro" : "free";
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

  /** Display options are free and instant; saved with the sheet so a reload and the PDF match. */
  function toggleView(key: "traps" | "tags" | "answers") {
    setView((current) => ({ ...current, [key]: !current[key] }));
  }

  /** The dock stacks its trays in one column, so exactly one may be open. */
  function closeTrays() {
    setRailOpen(false);
    setTrayOpen(false);
    setViewOpen(false);
    setVersionsOpen(false);
    setEditorOpen(false);
  }

  /**
   * The one way the stash changes.
   *
   * It persists for the visit AND marks the sheet dirty, which is what the dock's "Saved · 2m ago"
   * and the autosave both read. Only `replaceContent` used to do the second half, so view options
   * — unticked topics, source style, order — lived in sessionStorage alone: a sheet reopened from
   * My Sheets came back with every topic put back and no sign anything had been lost.
   */
  function updateStash(patch: (prev: Stash) => Stash) {
    setStash((prev) => {
      if (!prev) return prev;
      const next = patch(prev);
      setDirty(true);
      try {
        sessionStorage.setItem("clutch:last", JSON.stringify(next));
      } catch {
        /* private mode / quota: the change still applies for this visit */
      }
      return next;
    });
  }

  function setView(update: (current: ViewOptions) => ViewOptions) {
    updateStash((prev) => ({ ...prev, ctx: { ...(prev.ctx ?? EMPTY_CTX), view: update(viewOf(prev.ctx ?? EMPTY_CTX)) } }));
  }

  /**
   * Re-weights the sheet for another exam format: free and instant (scoring, section shares, and
   * traps on for True/False). The WORDING of the questions only changes through an edit or a re-make.
   */
  function setFormat(examFormat: NonNullable<ScoreCtx["examFormat"]>) {
    const examType = examFormat === "problems" ? "problem-solving" : examFormat === "mixed" ? "mixed" : "conceptual";
    updateStash((prev) => ({ ...prev, ctx: { ...(prev.ctx ?? EMPTY_CTX), examFormat, examType } }));
    setCtxPatch({});
    setActivePreset(null);
  }

  function setOrder(order: "course" | "priority") {
    updateStash((prev) => ({ ...prev, ctx: { ...(prev.ctx ?? EMPTY_CTX), order } }));
  }

  /** Display changes the chat routed locally: free, instant, no model call. */
  function handleFree(actions: FreeAction[]) {
    for (const a of actions) {
      if (a.type === "view") setView((v) => ({ ...v, [a.key]: a.on }));
      else if (a.type === "sources") setView((v) => ({ ...v, sources: a.value }));
      else if (a.type === "order") setOrder(a.value);
      else if (a.type === "format") setFormat(a.value);
      else if (a.type === "density") setDensity(a.value);
      else if (a.type === "preset") applyPreset(a.label, a.patch);
      else if (a.type === "figure") setView((v) => ({ ...v, figures: [...new Set([...(v.figures ?? (content ? defaultFigureIds(content) : [])), a.id])] }));
      else if (a.type === "figures-off") setView((v) => ({ ...v, figures: [] }));
      else if (a.type === "open-diagrams") setTrayOpen(true);
    }
  }

  /**
   * Turn a click on the sheet into an edit. The line is identified by what it SAYS
   * (`data-edit-key`), not by its position: `data-fit-id` indexes the composed sheet, which the
   * view options and module controls have already rearranged.
   */
  function onSheetClick(e: React.MouseEvent) {
    if (!content) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-edit-key]");
    const key = el?.dataset.editKey;
    if (!key) return;
    const section = key.split("|")[0] as "concepts" | "questions" | "formulas" | "notes";
    const list = (content as unknown as Record<string, unknown[]>)[section];
    const item = Array.isArray(list) ? list.find((x) => editKey(x, section) === key) : undefined;
    const fields = editFields(item, section);
    if (!fields) return;
    e.preventDefault();
    const meta = (item ?? {}) as { verified?: boolean; src?: string; mine?: boolean; topic?: string };
    // A note has no `mine` field to read — NoteSchema is strict and never needed one, because a
    // note only ever comes from the student in the first place.
    const isMine = section === "notes" || meta.mine === true;
    const ix = meta.topic ? content.topics.findIndex((t) => t.name === meta.topic) : -1;
    setEditing({
      key,
      a: fields.a,
      b: fields.b,
      labels: fields.labels,
      wasVerified: meta.verified === true,
      src: meta.src,
      mine: isMine,
      topic: meta.topic,
      topicIndex: ix < 0 ? undefined : ix,
    });
    setRailOpen(false);
    setTrayOpen(false);
    setViewOpen(false);
    // The dock stacks its trays in one column: with the chat open too, the editor is pushed off
    // the top of the screen. One at a time.
    setEditorOpen(false);
  }

  /**
   * Remember what the sheet was, once the student stops typing.
   *
   * Debounced because edits arrive in bursts — fix a word, fix another, add a note — and twenty
   * slots filled by one minute's typing is a history that cannot reach anything worth restoring.
   * The snapshot taken is the content from BEFORE the burst, which is the state they would want
   * back, not the one they just left.
   */
  function rememberVersion(before: unknown, after: unknown) {
    const id = savedIdRef.current;
    // Nothing to attach history to until the sheet lives in the library.
    if (!id) return;
    if (pendingVersionRef.current === null) pendingVersionRef.current = before;
    const label = describeChange(before, after);
    if (versionTimerRef.current) clearTimeout(versionTimerRef.current);
    versionTimerRef.current = setTimeout(() => {
      const snapshot = pendingVersionRef.current;
      pendingVersionRef.current = null;
      if (snapshot === null || snapshot === undefined) return;
      void (async () => {
        const { data } = await supabaseBrowser().auth.getUser();
        if (!data.user) return;
        await saveVersion(supabaseBrowser(), id, data.user.id, snapshot, label);
      })();
    }, VERSION_DEBOUNCE_MS);
  }

  async function openVersions() {
    setVersionsOpen(true);
    setRailOpen(false);
    setTrayOpen(false);
    setViewOpen(false);
    setEditorOpen(false);
    setEditing(null);
    const id = savedIdRef.current;
    if (!id) return setVersions([]);
    setVersionsLoading(true);
    setVersions(await listVersions(supabaseBrowser(), id));
    setVersionsLoading(false);
  }

  function replaceContent(nextContent: unknown) {
    updateStash((prev) => ({ ...prev, content: nextContent }));
  }

  function acceptEdit(nextContent: SheetContent) {
    if (!stash) return;
    setUndoStack((u) => [...u.slice(-9), stash.content]);
    replaceContent(nextContent);
    toast("Edit applied");
  }

  function undoEdit() {
    const last = undoStack[undoStack.length - 1];
    if (last === undefined) return;
    setUndoStack((u) => u.slice(0, -1));
    replaceContent(last);
    setFillState("off"); // never fight an undo by filling again
    toast("Edit undone");
  }

  function toggleFigure(id: string) {
    if (!content) return;
    setView((current) => {
      const chosen = new Set(current.figures ?? defaultFigureIds(content));
      if (chosen.has(id)) chosen.delete(id);
      else chosen.add(id);
      return { ...current, figures: [...chosen] };
    });
  }

  function applyPreset(label: string, patch: Partial<ScoreCtx>) {
    setCtxPatch(patch);
    setActivePreset(label);
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
      // The student's own text goes with the sheet, so reopening it later can still add
      // grounded lines through Edit with Clutch. Absent when the session never had it.
      let packText: string | null = null;
      try {
        packText = sessionStorage.getItem("clutch:pack");
      } catch {
        packText = null;
      }
      if (savedId) {
        const { error: updErr } = await supabase
          .from("sheets")
          .update({ title: content.title, content: content as unknown as Record<string, unknown>, ctx: effectiveCtx as unknown as Record<string, unknown> })
          .eq("id", savedId);
        if (updErr) throw updErr;
        setDirty(false);
        setLastSavedAt(new Date().toISOString());
        return;
      }
      const { data, error: insErr } = await supabase
        .from("sheets")
        .insert({
          user_id: userRes.user.id,
          title: content.title,
          content: content as unknown as Record<string, unknown>,
          ctx: effectiveCtx as unknown as Record<string, unknown>,
          // Postgres refuses NUL in text; sessions opened before the ingest fix may still carry one.
          pack_text: packText ? packText.replace(/\u0000/g, "").slice(0, 400_000) : null,
        })
        .select("id")
        .single();
      if (insErr) throw insErr;
      setSavedId(data.id);
      setDirty(false);
      setLastSavedAt(new Date().toISOString());
      toast("Saved to My Sheets");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const changedTopics = Object.keys(viewOf(effectiveCtx).modules ?? {}).length;

  return (
    <div
      className="min-h-screen bg-[var(--paper-2)]"
      // Why the sheet is (or is not) topping itself up — readable in any browser, no build needed.
      data-autofill={`${canAutoFill ? "on" : "off"}:${autoFill}:${backFill === null ? "unmeasured" : Math.round(backFill * 100) + "%"}:${autoFillRuns.current}`}
    >
      <Toaster />

      {/* ── toolbar ─────────────────────────────────────────────────── */}
      <header className="print:hidden sticky top-0 z-[var(--z-sticky)] border-b border-[var(--border-input)] bg-[var(--paper-glass)] backdrop-blur-[10px]">
        <div className="mx-auto flex h-[58px] max-w-[1320px] items-center gap-3.5 px-4 sm:px-7">
          {/* /generate, not "/": the marketing page is not auth-aware, so landing a signed-in
              student there looks exactly like being signed out (Gold, twice). */}
          <Wordmark size="sm" href="/generate" />
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
            {/* Save state and Export both live in the dock now (§3): the sheet's own controls
                belong with the sheet, not split across two bars. */}
            <LinkButton href="/generate" variant="secondary" size="sm" className="tap !h-[34px]">
              Make another
            </LinkButton>
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
        {autoFill === "filling" && (
          <div className="mx-auto max-w-[1320px] px-4 pb-3 sm:px-7">
            <div role="status" className="flex items-center gap-[11px] rounded-[9px] border border-[var(--ink-150)] bg-[var(--paper)] px-3.5 py-3 text-[13px] leading-[1.55] text-[var(--ink-800)]">
              <span aria-hidden className="h-3.5 w-3.5 shrink-0 animate-[cl-spin_800ms_linear_infinite] rounded-full border-2 border-[var(--ink-300)] border-t-transparent" />
              Filling the back page. Every new line is checked against your files first, and nothing already on the sheet is repeated. About a minute.
            </div>
          </div>
        )}
        {(exportError || saveError) && (
          <div className="mx-auto max-w-[1320px] px-4 pb-3 sm:px-7">
            <div role="alert" className="rounded-[9px] border border-[var(--conf-low)]/25 bg-[var(--conf-low-bg)] px-3.5 py-3 text-[13px] leading-[1.55] text-[var(--conf-low-deep)]">
              {exportError ? `Export failed: ${exportError}` : `Save failed: ${saveError}`}
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
              {/* Click a line to edit it (#20). One listener on the container rather than a
                  handler per leaf: the sheet renders hundreds of them, and the fit pass toggles
                  their visibility constantly. Keyboard users reach the same editor from the topic
                  rail, so this is an accelerator and not the only route. */}
              <div
                className={`animate-[cl-rise_400ms_var(--ease-pop)]${previewTopic ? " preview-on" : ""}`}
                onClick={onSheetClick}
              >
                {/*
                  Dim every topic EXCEPT the one being pointed at. Injected rather than expressed
                  in the stylesheet because CSS cannot compare a group's `data-topic` against a
                  value held on an ancestor, and the alternative — threading a prop through
                  TwoPageSheet into SheetPage into each group, or toggling classes imperatively
                  while the fit pass is also toggling display — is worse for a hover effect.
                */}
                {previewTopic && (
                  <style>{`@media screen{.preview-on .topic-group:not([data-topic="${previewTopic.replace(/["\\]/g, "\\$&")}"]){opacity:.25}}`}</style>
                )}
                {density === "max" ? (
                  <TwoPageSheet content={content} ctx={effectiveCtx} lockBack={!pro} onFit={(f) => { setBackFill(f.backFill); fitLinesRef.current = f.front + f.back; }} />
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
        {versionsOpen && (
          <VersionPanel
            versions={versions}
            loading={versionsLoading}
            saved={!!savedId}
            saving={saving}
            onSaveToLibrary={() => void saveToLibrary().then(() => void openVersions())}
            onClose={() => setVersionsOpen(false)}
            onRestore={(v) => {
              // Restoring is itself a change, so it goes through the same paths — they can undo it
              // and it appears in history, which is what makes it safe to try.
              const before = content;
              setUndoStack((u) => [...u.slice(-9), before]);
              replaceContent(v.content);
              rememberVersion(before, v.content);
              setVersionsOpen(false);
              toast("Restored · undo if that wasn't it", "check");
            }}
          />
        )}
        {editing && (
          <EditLine
            /* Remount per line. Clicking a second line while the editor is open replaces `editing`
               without unmounting, and useState(initial) only runs on mount — so the fields would
               keep the previous line's text and saving would write it to the new line's key. */
            key={editing.key}
            labels={editing.labels}
            initial={{ a: editing.a, b: editing.b }}
            wasVerified={editing.wasVerified}
            src={editing.src}
            mine={editing.mine}
            topic={editing.topic}
            topicIndex={editing.topicIndex}
            onCancel={() => setEditing(null)}
            onRemove={() => {
              const before = content;
              const after = removeLine(content as never, editing.key);
              setUndoStack((u) => [...u.slice(-9), before]);
              replaceContent(after);
              rememberVersion(before, after);
              setEditing(null);
              toast("Removed your line · kept in history", "check");
            }}
            onSave={(next) => {
              const before = content;
              const after = applyEdit(content as never, editing.key, next);
              setUndoStack((u) => [...u.slice(-9), before]);
              replaceContent(after);
              rememberVersion(before, after);
              setEditing(null);
              toast("Your version saved · the line is yours now", "check");
            }}
          />
        )}
        {viewOpen && (
          <ViewTray
            order={effectiveCtx.order ?? "course"}
            view={viewOf(effectiveCtx)}
            figures={
              content?.figures && content.figures.length > 0
                ? {
                    on: (viewOf(effectiveCtx).figures ?? defaultFigureIds(content)).length,
                    total: content.figures.length,
                    onOpen: () => { setViewOpen(false); setTrayOpen(true); },
                  }
                : undefined
            }
            onOrder={setOrder}
            onToggle={toggleView}
            onSources={(sources) => setView((current) => ({ ...current, sources }))}
            onClose={() => setViewOpen(false)}
          />
        )}
        {railOpen && content && content.topics.length > 0 && (
          <TopicRail
            content={content}
            modules={viewOf(effectiveCtx).modules ?? {}}
            onChange={(next) => setView((v) => ({ ...v, modules: Object.keys(next).length ? next : undefined }))}
            onContent={(patch) => {
              // The student's own block (#20). Undoable like any other content change, and
              // persisted the same way, because what they typed is the one part of the sheet we
              // cannot rebuild.
              const before = content;
              const after = patch(content);
              setUndoStack((u) => [...u.slice(-9), before]);
              replaceContent(after);
              rememberVersion(before, after);
            }}
            onPreview={setPreviewTopic}
            onClose={() => {
              setRailOpen(false);
              setPreviewTopic(null);
            }}
          />
        )}
        {trayOpen && content?.figures && content.figures.length > 0 && (
          <div className="pointer-events-auto w-full max-w-[720px] animate-[cl-rise_220ms_var(--ease-pop)] rounded-[14px] bg-[var(--band-2)] p-4 shadow-[0_20px_50px_rgba(17,17,20,.4)]">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-white">Diagrams from your files</span>
              <button
                type="button"
                onClick={() => setTrayOpen(false)}
                className="font-mono text-[11px] text-[var(--on-band-muted)] hover:text-[var(--on-band)]"
              >
                close
              </button>
            </div>
            <p className="mt-1 text-[12px] leading-[1.5] text-[var(--on-band-muted)]">
              Each diagram takes the room of roughly 10–18 lines; the lowest-ranked lines make way. Free and instant.
            </p>
            <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
              {content.figures.map((f) => {
                const on = (viewOf(effectiveCtx).figures ?? defaultFigureIds(content)).includes(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleFigure(f.id)}
                    className={
                      "tap w-[150px] shrink-0 rounded-[10px] border p-2 text-left transition-[border-color,background-color] duration-[160ms] " +
                      (on ? "border-white bg-white/10" : "border-[var(--band-line)] hover:border-[var(--ink-500)]")
                    }
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.image} alt={f.what || f.caption} className="h-[84px] w-full rounded-[6px] bg-white object-contain" />
                    <span className="mt-1.5 line-clamp-2 block text-[11.5px] font-medium leading-[1.3] text-white">{f.caption}</span>
                    <span className="mt-0.5 flex items-center justify-between font-mono text-[10px] text-[var(--on-band-muted)]">
                      <span className="truncate">{f.src.replace(/^.*\s(p\d+)$/, "$1")}</span>
                      <span className={on ? "text-white" : ""}>{on ? "on sheet ✓" : "add"}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {editorOpen && content && (
          <EditChat
            content={content}
            files={(effectiveCtx.files ?? []).map((f) => f.name)}
            pro={pro}
            examFormat={effectiveCtx.examFormat}
            canUndo={undoStack.length > 0}
            onFree={handleFree}
            onAccept={acceptEdit}
            onUndo={undoEdit}
            onUpsell={() => {
              setUpsellOpen(true);
              setEditorOpen(false);
            }}
            onClose={() => { setEditorOpen(false); setChatAutoSend(undefined); }}
            autoSend={chatAutoSend}
          />
        )}

        {/* §10.2 — a modal, because this is the one place in the editing flow that asks for
            money. The free path is named in the second tile and in the footer: the rules forbid
            hiding it. */}
        <Modal
          open={upsellOpen && !pro}
          onClose={() => setUpsellOpen(false)}
          tone="decision"
          eyebrow="PRO EDIT · REWRITES LINES"
          title="That one rewrites your sheet"
          footer={{ tint: "good", text: "topics, adding, and editing by hand stay free" }}
        >
          <p className="text-[14px] leading-[1.6] text-[var(--ink-700)]">
            It changes the words on your sheet, so Clutch checks each new line against your files
            first. You see every change before it lands.
          </p>
          <ModalOptions>
            <OptionTile
              primary
              label="Unlock this sheet · $4.99"
              sub="unlocks rewrites"
              onClick={() => { window.location.href = "/pricing"; }}
            />
            <OptionTile
              label="Stay free"
              sub="edit lines by hand"
              onClick={() => setUpsellOpen(false)}
            />
          </ModalOptions>
        </Modal>

        <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-[14px] bg-[var(--band)] p-[7px] shadow-[0_20px_44px_rgba(17,17,20,.28)]">
          {/* Density — the one control that changes how much is on the page, so it leads. */}
          <span className="flex shrink-0 items-center rounded-[10px] bg-[var(--band-2)] p-[3px]">
            {DENSITY_OPTS.map((d) => (
              <button
                key={d.value}
                type="button"
                aria-pressed={density === d.value}
                onClick={() => setDensity(d.value)}
                className={
                  "ctl tap inline-flex h-[30px] items-center rounded-[7px] px-3 text-[13px] font-semibold " +
                  (density === d.value ? "bg-white text-[var(--band)]" : "text-[#cbcbd4] hover:text-white")
                }
              >
                {d.label}
              </button>
            ))}
          </span>

          <DockDivider />

          {content && content.topics.length > 0 && (
            <DockButton
              open={railOpen}
              hideOnPhone={false}
              onClick={() => { const next = !railOpen; closeTrays(); setRailOpen(next); }}
              aria-expanded={railOpen}
            >
              Topics
              {/* Absent at rest: a badge that always reads 6/6 until you touch something carries
                  no information. It appears only once there is something to report. */}
              {changedTopics > 0 && (
                <span className="rounded-full bg-[var(--signal-500)] px-1.5 py-px font-mono text-[11px] text-white">
                  {changedTopics} changed
                </span>
              )}
            </DockButton>
          )}

          <DockButton
            open={viewOpen}
            phoneOpen={dockOpen}
            onClick={() => { const next = !viewOpen; closeTrays(); setViewOpen(next); }}
            aria-expanded={viewOpen}
          >
            View
            <span aria-hidden className="font-mono text-[10px] opacity-70">&#9662;</span>
          </DockButton>

          {/* Answers is a switch, not a tray row: it is the one display control a student flips
              constantly while revising, so it stays one click away. */}
          <button
            type="button"
            role="switch"
            aria-checked={viewOf(effectiveCtx).answers}
            onClick={() => toggleView("answers")}
            className={
              (dockOpen ? "inline-flex" : "hidden") +
              " ctl tap h-9 shrink-0 items-center gap-2 rounded-[9px] px-3 text-[13px] font-semibold text-white hover:shadow-[inset_0_0_0_1px_#3a3a45] sm:inline-flex"
            }
          >
            Answers
            <span
              aria-hidden
              className={
                "relative h-4 w-7 rounded-full transition-colors duration-[160ms] ease-[var(--ease-out)] " +
                (viewOf(effectiveCtx).answers ? "bg-[var(--signal-500)]" : "bg-[#3a3a45]")
              }
            >
              <span
                className="absolute top-[2px] h-3 w-3 rounded-full bg-white transition-[left] duration-[160ms] ease-[var(--ease-out)]"
                style={{ left: viewOf(effectiveCtx).answers ? 14 : 2 }}
              />
            </span>
          </button>

          <DockDivider />

          <DockButton
            open={editorOpen}
            hideOnPhone={false}
            onClick={() => {
              // Everyone gets the chat: show/hide/reorder are free. Pro gates content edits inside it.
              const next = !editorOpen;
              closeTrays();
              setEditorOpen(next);
              setUpsellOpen(false);
            }}
          >
            <span
              aria-hidden
              className={"h-[7px] w-[7px] rounded-full " + (editorOpen ? "bg-[var(--signal-500)]" : "bg-[var(--signal-300)]")}
            />
            Edit with Clutch
          </DockButton>

          <DockDivider />

          {/* The save state IS the opener for version history. Before the sheet is in the library
              it reads "Not saved" in amber — and the tray it opens is where that gets explained. */}
          <DockButton
            open={versionsOpen}
            phoneOpen={dockOpen}
            onClick={() => { if (versionsOpen) return setVersionsOpen(false); closeTrays(); void openVersions(); }}
            aria-expanded={versionsOpen}
          >
            <span
              aria-hidden
              className={"h-1.5 w-1.5 rounded-full " + (savedId ? "bg-[#5cc98d]" : "bg-[#e0a24d]")}
            />
            <span className="font-mono text-[11.5px] font-normal">
              {saving ? "Saving…" : savedId ? `Saved${lastSavedAt ? ` · ${ago(lastSavedAt, tick)}` : ""}` : "Not saved"}
            </span>
          </DockButton>

          <button
            type="button"
            onClick={onExportClick}
            disabled={exporting}
            className="ctl ctl-primary tap inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[9px] px-3 text-[13px] font-semibold disabled:opacity-60"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16" />
            </svg>
            {exporting ? "Exporting…" : "Export PDF"}
          </button>

          {/* Phone: Density, Topics, Edit and Export stay; everything else folds behind More. */}
          <button
            type="button"
            aria-expanded={dockOpen}
            onClick={() => setDockOpen((v) => !v)}
            className="ctl tap inline-flex h-9 shrink-0 items-center rounded-[9px] px-3 text-[13px] font-semibold text-white hover:shadow-[inset_0_0_0_1px_#3a3a45] sm:hidden"
          >
            {dockOpen ? "Less" : "More"}
          </button>
        </div>
        <div className="pointer-events-none font-mono text-[11px] text-[var(--ink-500)]">
          topics, view and editing by hand are free &amp; instant · rewrites come back as a preview you accept or reject
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
