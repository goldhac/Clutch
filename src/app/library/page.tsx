"use client";

import { useEffect, useRef, useState } from "react";
import { AppChrome, LinkButton, Button, toast } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * /library — v2 handoff: hairline LIST (not cards) under an ink-ruled
 * page head with search + sort + New sheet. Each row: mini sheet
 * thumbnail (topic color bars + line texture), title, mono meta, open +
 * delete actions. Delete is immediate and undoable — the row goes at
 * once and the toast carries Undo for UNDO_GRACE — rather than passing
 * through a confirmation modal. Signed-out state is the editorial
 * two-column pitch.
 *
 * Supabase logic unchanged: RLS-owned rows, open seeds clutch:last.
 * The row-level delete is held for the undo window and flushed on
 * unmount, so leaving the page still resolves it.
 */
interface SheetRow {
  id: string;
  title: string;
  content: unknown;
  ctx: unknown;
  created_at: string;
}

type Sort = "recent" | "az";

function itemCount(content: unknown): number | null {
  if (!content || typeof content !== "object") return null;
  const c = content as Record<string, unknown>;
  const arrays = ["formulas", "concepts", "tables", "traps", "questions"];
  let total = 0;
  let found = false;
  for (const k of arrays) {
    if (Array.isArray(c[k])) {
      total += (c[k] as unknown[]).length;
      found = true;
    }
  }
  return found ? total : null;
}

/** mini sheet thumbnail — topic color-key bars, ink title rule, 4-col text texture */
function SheetThumb() {
  const topicBars = [
    "var(--topic-indigo)",
    "var(--topic-teal)",
    "var(--topic-maroon)",
    "var(--topic-green)",
    "var(--topic-purple)",
    "var(--topic-orange)",
    "var(--topic-blue)",
  ];
  const widths = [
    [100, 78, 100, 60, 100],
    [85, 100, 70, 100, 88],
    [100, 64, 100, 82, 50],
    [72, 100, 100, 56, 100],
  ];
  return (
    <span className="block w-[72px] shrink-0 overflow-hidden rounded-[6px] border border-[var(--ink-150)] bg-white shadow-[var(--sh-sm)]">
      <span className="flex gap-px px-1 pt-1">
        {topicBars.map((c) => (
          <span key={c} className="h-[3px] flex-1 rounded-[1px]" style={{ background: c }} />
        ))}
      </span>
      <span className="mx-1 mt-1 block h-1 rounded-[1px] bg-[var(--band)]" />
      <span className="mx-1 mb-1.5 mt-[3px] flex gap-[2px]">
        {widths.map((col, ci) => (
          <span key={ci} className="flex flex-1 flex-col gap-[1.5px]">
            {col.map((w, ri) => (
              <span key={ri} className="h-[1.5px] bg-[var(--ink-200)]" style={{ width: `${w}%` }} />
            ))}
          </span>
        ))}
      </span>
    </span>
  );
}

/** Held delete window. Outlasts the actionable toast (7s) so Undo is
 *  always reachable for as long as the control is on screen. */
const UNDO_GRACE = 7400;

export default function LibraryPage() {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [rows, setRows] = useState<SheetRow[] | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingUndo = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const supabase = supabaseBrowser();
    supabase.auth
      .getUser()
      .then(async ({ data }) => {
        if (!data.user) {
          setSignedIn(false);
          return;
        }
        setSignedIn(true);
        setEmail(data.user.email ?? null);
        const { data: sheets, error: qErr } = await supabase
          .from("sheets")
          .select("id, title, content, ctx, created_at")
          .order("created_at", { ascending: false });
        if (qErr) setError(qErr.message);
        else setRows(sheets ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  function openSheet(row: SheetRow) {
    sessionStorage.setItem(
      "clutch:last",
      JSON.stringify({
        content: row.content,
        ctx: row.ctx ?? undefined,
        warnings: [],
        density: "max",
        savedAt: row.created_at,
      }),
    );
    window.location.href = "/results";
  }

  /**
   * Delete is optimistic with a real undo window rather than a
   * confirmation dialog: the row leaves the list at once, the row-level
   * delete is held for UNDO_GRACE, and the toast's Undo cancels it. A
   * dialog interrupts everyone to guard against a rare mistake; undo
   * guards without interrupting.
   *
   * Anything still pending is committed on unmount, so navigating away
   * (or closing the tab) resolves the delete instead of silently
   * abandoning it.
   */
  async function commitDelete(row: SheetRow) {
    pendingUndo.current.delete(row.id);
    const { error: delErr } = await supabaseBrowser().from("sheets").delete().eq("id", row.id);
    if (delErr) {
      setError(delErr.message);
      setRows((r) => (r ? [row, ...r.filter((x) => x.id !== row.id)] : r));
    }
  }

  function deleteSheet(row: SheetRow) {
    setRows((r) => (r ? r.filter((x) => x.id !== row.id) : r));

    const timer = window.setTimeout(() => void commitDelete(row), UNDO_GRACE);
    pendingUndo.current.set(row.id, timer);

    toast("Sheet deleted", "check", {
      label: "Undo",
      onAction: () => {
        const t = pendingUndo.current.get(row.id);
        if (t !== undefined) {
          clearTimeout(t);
          pendingUndo.current.delete(row.id);
        }
        setRows((r) => (r ? [row, ...r.filter((x) => x.id !== row.id)] : [row]));
      },
    });
  }

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    window.location.reload();
  }

  useEffect(() => {
    const pending = pendingUndo.current;
    return () => {
      // Commit anything still held so leaving the page resolves the
      // delete rather than abandoning it.
      pending.forEach((timer, id) => {
        clearTimeout(timer);
        void supabaseBrowser().from("sheets").delete().eq("id", id);
      });
      pending.clear();
    };
  }, []);

  const filtered = (rows ?? [])
    .filter((i) => i.title.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) =>
      sort === "az"
        ? a.title.localeCompare(b.title)
        : b.created_at.localeCompare(a.created_at),
    );

  const countLine =
    rows === null
      ? "loading…"
      : `${rows.length} ${rows.length === 1 ? "sheet" : "sheets"} saved${email ? ` · ${email}` : ""}`;

  return (
    <AppChrome active="library" credits={2} avatar={(email ?? "?").slice(0, 2).toUpperCase()}>
      <div className="mx-auto max-w-[1180px] px-6 pb-24 pt-11 sm:px-8">
        {/* ── page head ─────────────────────────────────────────────── */}
        <header className="flex flex-wrap items-end justify-between gap-6 border-b border-[var(--ink-900)] pb-5">
          <div>
            <h1 className="font-serif text-[clamp(2rem,4vw,2.75rem)] leading-[1.04] tracking-[-0.03em] text-[var(--ink-900)]">
              My Sheets
            </h1>
            <div className="mt-2.5 font-mono text-[11px] text-[var(--ink-500)]">
              {signedIn === false ? "sign in to see your saved sheets" : countLine}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {signedIn && (
              <>
                <span className="relative inline-flex shrink-0 items-center">
                  <span aria-hidden className="pointer-events-none absolute left-[11px] flex text-[var(--ink-400)]">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <circle cx="11" cy="11" r="7" />
                      <path d="m20 20-3.5-3.5" />
                    </svg>
                  </span>
                  <input
                    type="text"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search sheets"
                    className="h-9 w-[190px] rounded-[9px] border border-[var(--border-input)] bg-[var(--surface)] pl-8 pr-3 text-[13px] text-[var(--ink-900)] outline-none transition-colors duration-[160ms] placeholder:text-[var(--ink-500)] focus:border-[var(--signal-500)] focus:ring-2 focus:ring-[var(--signal-100)]"
                  />
                </span>
                <span className="flex shrink-0 items-center rounded-[9px] bg-[var(--field)] p-[3px]">
                  {(
                    [
                      ["Recent", "recent"],
                      ["A–Z", "az"],
                    ] as const
                  ).map(([label, value]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setSort(value)}
                      className={
                        "rounded-[6px] px-3 py-1.5 text-[12.5px] font-semibold transition-[background-color,color,box-shadow] duration-[160ms] " +
                        (sort === value
                          ? "bg-[var(--surface)] text-[var(--ink-900)] shadow-[var(--sh-sm)]"
                          : "text-[var(--ink-500)] hover:text-[var(--ink-800)]")
                      }
                    >
                      {label}
                    </button>
                  ))}
                </span>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="px-2 text-[13px] text-[var(--ink-500)] transition-colors duration-[160ms] hover:text-[var(--ink-900)]"
                >
                  Sign out
                </button>
              </>
            )}
            <LinkButton href="/generate" size="md" className="!rounded-[9px]">
              <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
              New sheet
            </LinkButton>
          </div>
        </header>

        {error && (
          <div role="alert" className="mt-5 rounded-[10px] border border-[var(--conf-low)]/25 bg-[var(--conf-low-bg)] px-4 py-3 text-[13px] text-[var(--conf-low-deep)]">
            {error}
          </div>
        )}

        {/* ── signed out ────────────────────────────────────────────── */}
        {signedIn === false ? (
          <div className="mt-12 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] lg:gap-14">
            <div>
              <h2 className="max-w-[22ch] font-serif text-[clamp(1.9rem,4vw,2.375rem)] leading-[1.06] tracking-[-0.03em] text-[var(--ink-900)]">
                Your library lives with your account.
              </h2>
              <p className="mt-4 max-w-[50ch] text-[15px] leading-[1.65] text-[var(--ink-600)]" style={{ textWrap: "pretty" }}>
                Sign in with a magic link and every sheet you save shows up here, on any device —
                the pack you built it from, the density you chose, and the credits you already
                spent.
              </p>
              <div className="mt-[26px] flex items-center gap-4">
                <LinkButton href="/auth?next=/library" size="md" className="!h-11 !rounded-[9px] !px-5">
                  Sign in
                </LinkButton>
                <span className="font-mono text-[11px] text-[var(--ink-500)]">
                  no password · link in your inbox
                </span>
              </div>
            </div>
            <div className="rounded-[12px] border border-[var(--ink-150)] bg-[var(--surface)] p-5">
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.09em] text-[var(--ink-500)]">
                Kept with the sheet
              </div>
              <div className="mt-3 border-t border-[var(--ink-900)]">
                {[
                  "The exact pool it was built from",
                  "Density, priority and preset mix",
                  "Which lines were exam-verified",
                  "Unlocks you already paid for",
                ].map((line, i, arr) => (
                  <div
                    key={line}
                    className={`py-[11px] text-[13.5px] text-[var(--ink-600)] ${i < arr.length - 1 ? "border-b border-[var(--ink-150)]" : ""}`}
                  >
                    {line}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : rows !== null && filtered.length === 0 ? (
          /* ── empty / no-match ────────────────────────────────────── */
          <div className="mt-12 border-t border-[var(--ink-150)] pt-4">
            <h2 className="max-w-[24ch] font-serif text-[34px] leading-[1.08] tracking-[-0.025em] text-[var(--ink-900)]">
              {q ? "No sheets match that search." : "Nothing saved yet."}
            </h2>
            <p className="mt-3.5 max-w-[50ch] text-[15px] leading-[1.65] text-[var(--ink-600)]" style={{ textWrap: "pretty" }}>
              {q
                ? "Try a shorter search — titles only, for now."
                : "Generate a sheet, then hit Save to library on the results page. It keeps the whole pool, so you can re-render or adjust it later."}
            </p>
            <div className="mt-6">
              {q ? (
                <Button variant="secondary" size="md" onClick={() => setQ("")}>
                  Clear search
                </Button>
              ) : (
                <LinkButton href="/generate" size="md">
                  Make your first sheet
                </LinkButton>
              )}
            </div>
          </div>
        ) : (
          /* ── the list ────────────────────────────────────────────── */
          <div className="mt-8">
            <div className="flex items-baseline justify-between gap-5 border-b border-[var(--ink-150)] pb-2.5">
              <span className="font-mono text-[12px] font-semibold tracking-[0.04em] text-[var(--ink-900)]">
                ALL SHEETS
              </span>
              <span className="shrink-0 font-mono text-[11px] text-[var(--ink-500)]">
                {filtered.length} shown
              </span>
            </div>
            {rows === null
              ? [0, 1, 2].map((i) => (
                  <div key={i} className="flex animate-pulse items-center gap-4 border-b border-[var(--ink-150)] py-4">
                    <span className="h-[52px] w-[72px] rounded-[6px] bg-[var(--ink-100)]" />
                    <span className="h-4 w-1/3 rounded bg-[var(--ink-100)]" />
                  </div>
                ))
              : filtered.map((row) => {
                  const items = itemCount(row.content);
                  const made = new Date(row.created_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  });
                  return (
                    <div
                      key={row.id}
                      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 border-b border-[var(--ink-150)] py-4 sm:gap-5"
                    >
                      <button type="button" onClick={() => openSheet(row)} aria-label={`open ${row.title}`}>
                        <SheetThumb />
                      </button>
                      <button type="button" onClick={() => openSheet(row)} className="min-w-0 text-left">
                        <span className="block truncate text-[15px] font-semibold tracking-[-0.01em] text-[var(--ink-900)]">
                          {row.title}
                        </span>
                        <span className="mt-1 block font-mono text-[11px] text-[var(--ink-500)]">
                          saved {made}
                          {items !== null ? ` · ${items} items` : ""} · MAX
                        </span>
                      </button>
                      <span className="flex items-center gap-[7px]">
                        <button
                          type="button"
                          onClick={() => openSheet(row)}
                          className="inline-flex h-8 items-center rounded-[var(--r-md)] border border-[var(--border-input)] bg-[var(--surface)] px-3.5 text-[13px] font-semibold text-[var(--ink-900)] transition-[background-color,border-color] duration-[160ms] hover:bg-[var(--ink-50)]"
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteSheet(row)}
                          aria-label={`delete ${row.title}`}
                          className="tap inline-flex h-8 w-8 items-center justify-center rounded-[var(--r-md)] border border-[var(--ink-150)] bg-[var(--surface)] text-[var(--ink-500)] transition-[color,border-color] duration-[160ms] hover:border-[var(--conf-low)]/40 hover:text-[var(--conf-low)]"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14" />
                          </svg>
                        </button>
                      </span>
                    </div>
                  );
                })}
          </div>
        )}
      </div>

    </AppChrome>
  );
}
