"use client";

import { useEffect, useState } from "react";
import { AppChrome, Button, LinkButton, TextInput, Card, Callout } from "@/components/ui";
import type { Density } from "@/components/sheet";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * /library — My Sheets, backed by Supabase (RLS-owned rows).
 * Signed out → sign-in prompt. Signed in → the user's saved sheets;
 * opening one seeds the session stash and routes to /results.
 */
interface SheetRow {
  id: string;
  title: string;
  content: unknown;
  ctx: unknown;
  created_at: string;
}

function Thumb({ density = "max" as Density }: { density?: Density }) {
  const cols = density === "max" ? 5 : density === "balanced" ? 3 : 2;
  return (
    <div className="relative aspect-[1.414/1] overflow-hidden rounded-[var(--r-sm)] border border-[var(--ink-150)] bg-white p-1.5">
      <div className="mb-1 h-1 w-2/3 rounded-full bg-[var(--ink-800)]" />
      <div className="grid h-[calc(100%-8px)] gap-0.5" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {Array.from({ length: cols }).map((_, c) => (
          <div key={c} className="space-y-0.5">
            {Array.from({ length: 6 }).map((_, r) => (
              <div key={r} className="h-0.5 rounded-full bg-[var(--ink-150)]" style={{ width: `${60 + ((r * 13 + c * 7) % 40)}%` }} />
            ))}
          </div>
        ))}
      </div>
      <span className="absolute right-1 top-1 rounded-[var(--r-xs)] bg-white/90 px-1 py-0.5 font-mono text-[8px] font-semibold uppercase text-[var(--ink-500)] shadow-[var(--sh-xs)]">
        {density}
      </span>
    </div>
  );
}

export default function LibraryPage() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<SheetRow[] | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  async function deleteSheet(id: string) {
    const prev = rows;
    setRows((r) => (r ? r.filter((x) => x.id !== id) : r));
    const { error: delErr } = await supabaseBrowser().from("sheets").delete().eq("id", id);
    if (delErr) {
      setError(delErr.message);
      setRows(prev ?? null);
    }
  }

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    window.location.reload();
  }

  const filtered = (rows ?? []).filter((i) => i.title.toLowerCase().includes(q.toLowerCase()));

  return (
    <AppChrome active="library" credits={2} avatar={(email ?? "?").slice(0, 2).toUpperCase()}>
      <div className="mx-auto max-w-6xl px-5 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-[clamp(1.9rem,4vw,2.6rem)] tracking-[-0.02em] text-[var(--ink-900)]">
              My Sheets
            </h1>
            <p className="mt-1 text-[14px] text-[var(--ink-500)]">
              {signedIn === false
                ? "Sign in to see your saved sheets"
                : rows === null
                  ? "Loading…"
                  : `${filtered.length} sheet${filtered.length === 1 ? "" : "s"} · sorted by most recent`}
              {email && <span className="ml-2 font-mono text-[12px] text-[var(--ink-400)]">{email}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {signedIn && (
              <div className="w-48">
                <TextInput
                  type="search"
                  placeholder="Search sheets"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
            )}
            {signedIn && (
              <Button variant="ghost" size="sm" onClick={signOut}>
                Sign out
              </Button>
            )}
            <LinkButton href="/generate">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
              New sheet
            </LinkButton>
          </div>
        </div>

        {error && (
          <div className="mt-4">
            <Callout variant="danger">{error}</Callout>
          </div>
        )}

        {signedIn === false ? (
          <Card className="mt-10 flex flex-col items-center py-16 text-center">
            <p className="font-serif text-[22px] text-[var(--ink-900)]">Your library lives with your account.</p>
            <p className="mt-2 max-w-sm text-[14px] text-[var(--ink-600)]">
              Sign in with a magic link — every sheet you save shows up here, on any device.
            </p>
            <LinkButton href="/auth?next=/library" className="mt-5">
              Sign in
            </LinkButton>
          </Card>
        ) : rows !== null && filtered.length === 0 ? (
          <Card className="mt-10 flex flex-col items-center py-16 text-center">
            <p className="font-serif text-[22px] text-[var(--ink-900)]">
              {q ? "No sheets match that search." : "No saved sheets yet."}
            </p>
            {q ? (
              <Button variant="ghost" className="mt-3" onClick={() => setQ("")}>
                Clear search
              </Button>
            ) : (
              <p className="mt-2 max-w-sm text-[14px] text-[var(--ink-600)]">
                Generate a sheet, then hit <strong>Save to library</strong> on the results page.
              </p>
            )}
          </Card>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {filtered.map((it) => (
              <Card key={it.id} interactive as="article" className="group relative !p-3">
                <button type="button" className="block w-full text-left" onClick={() => openSheet(it)}>
                  <Thumb />
                  <div className="mt-3 flex items-start gap-2">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--signal-500)]" aria-hidden />
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-semibold text-[var(--ink-900)]">{it.title}</div>
                      <div className="mt-0.5 font-mono text-[11px] text-[var(--ink-400)]">
                        {new Date(it.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </div>
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  aria-label={`delete ${it.title}`}
                  onClick={() => void deleteSheet(it.id)}
                  className="absolute right-2 top-2 hidden rounded bg-white/95 px-1.5 py-0.5 text-[11px] text-[var(--ink-500)] shadow-[var(--sh-xs)] hover:text-[var(--color-strong-red)] group-hover:block"
                >
                  ✕
                </button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppChrome>
  );
}
