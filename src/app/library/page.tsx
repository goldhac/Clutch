"use client";

import { useEffect, useState } from "react";
import { AppChrome, Button, LinkButton, TextInput, Card } from "@/components/ui";
import type { Density } from "@/components/sheet";

/**
 * /library — My Sheets. Local-first: reads a lightweight index from
 * localStorage (Supabase persistence lands later). Until a real sheet
 * is saved, shows the design's grid with representative demo cards so
 * the surface is never blank.
 */
interface LibItem {
  id: string;
  title: string;
  course: string;
  date: string;
  density: Density;
  topicColor: string;
}

const DEMO: LibItem[] = [
  { id: "1", title: "Intro Statistics", course: "STAT 200 · Final", date: "Mar 14", density: "max", topicColor: "var(--topic-1)" },
  { id: "2", title: "Organic Chemistry", course: "CHEM 210 · MT2", date: "Mar 11", density: "max", topicColor: "var(--topic-3)" },
  { id: "3", title: "Microeconomics", course: "ECON 101 · Final", date: "Mar 9", density: "balanced", topicColor: "var(--topic-2)" },
  { id: "4", title: "Cell Biology", course: "BIOL 220 · MT1", date: "Feb 28", density: "max", topicColor: "var(--topic-4)" },
  { id: "5", title: "Linear Algebra", course: "MATH 240 · Final", date: "Feb 22", density: "essentials", topicColor: "var(--topic-5)" },
  { id: "6", title: "US History", course: "HIST 108 · MT2", date: "Feb 15", density: "balanced", topicColor: "var(--topic-6)" },
];

function Thumb({ density }: { density: Density }) {
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
  const [items, setItems] = useState<LibItem[]>(DEMO);

  useEffect(() => {
    // Local-first: if a real sheet was generated this session, surface it
    // at the front. (Full history persistence lands with Supabase.)
    try {
      const raw = sessionStorage.getItem("cramsheet:last");
      if (raw) {
        const s = JSON.parse(raw) as { content?: { title?: string }; density?: Density };
        if (s.content?.title) {
          setItems((prev) => [
            {
              id: "current",
              title: s.content!.title!.replace(/ — .*$/, ""),
              course: "This session",
              date: "Just now",
              density: (s.density ?? "max") as Density,
              topicColor: "var(--signal-500)",
            },
            ...prev,
          ]);
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  const filtered = items.filter(
    (i) =>
      i.title.toLowerCase().includes(q.toLowerCase()) ||
      i.course.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <AppChrome active="library" credits={2} avatar="AD">
      <div className="mx-auto max-w-6xl px-5 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-[clamp(1.9rem,4vw,2.6rem)] tracking-[-0.02em] text-[var(--ink-900)]">
              My Sheets
            </h1>
            <p className="mt-1 text-[14px] text-[var(--ink-500)]">
              {filtered.length} sheet{filtered.length === 1 ? "" : "s"} · sorted by most recent
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-48">
              <TextInput
                type="search"
                placeholder="Search sheets"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                leading={
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" strokeLinecap="round" />
                  </svg>
                }
              />
            </div>
            <LinkButton href="/generate">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
              New sheet
            </LinkButton>
          </div>
        </div>

        {filtered.length === 0 ? (
          <Card className="mt-10 flex flex-col items-center py-16 text-center">
            <p className="font-serif text-[22px] text-[var(--ink-900)]">No sheets match that search.</p>
            <Button variant="ghost" className="mt-3" onClick={() => setQ("")}>
              Clear search
            </Button>
          </Card>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {filtered.map((it) => (
              <Card key={it.id} interactive as="article" className="!p-3">
                <Thumb density={it.density} />
                <div className="mt-3 flex items-start gap-2">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: it.topicColor }} aria-hidden />
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-semibold text-[var(--ink-900)]">{it.title}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-[var(--ink-400)]">
                      {it.course} · {it.date}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppChrome>
  );
}
