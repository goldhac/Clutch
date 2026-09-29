"use client";

/**
 * TopicRail — the sheet's topics as a list you can control (#20).
 *
 * Deliberately beside the sheet, not on it. The sheet is what prints: putting checkboxes into a
 * dense 7-column layout would clutter the one thing the product is selling and create hover targets
 * inside the print artifact. A list is also stable — it never reflows when the sheet does — and it
 * is keyboard-navigable without any extra work.
 *
 * Every control here is free and instant. Nothing in this file calls an API.
 *
 * Plain on purpose: the visual pass is Gold's (2026-09-29). Structure, states and accessibility are
 * finished; the styling is the dock's existing tray idiom and nothing more.
 */
import { useMemo, useState } from "react";
import type { SheetContent } from "@/contract/sheet-content";
import { AddBlock } from "./AddBlock";
import {
  MODULE_SECTIONS,
  MIN_TOPIC_LINES,
  trimRoom,
  type ModuleSection,
  type ModuleState,
} from "@/components/sheet/modules";

const SECTION_LABEL: Record<ModuleSection, string> = {
  formulas: "Formulas",
  tables: "Tables",
  concepts: "Definitions",
  traps: "Traps",
  questions: "Questions",
};

export interface TopicRailProps {
  content: SheetContent;
  modules: ModuleState;
  onChange: (next: ModuleState) => void;
  /** Apply a change to the sheet's content — adding the student's own block (#20). */
  onContent: (patch: (content: SheetContent) => SheetContent) => void;
  onClose: () => void;
}

/** How many lines each topic contributes, by section — what the rail counts and what "less" eats. */
function linesByTopic(content: SheetContent): Map<string, Record<ModuleSection, number>> {
  const out = new Map<string, Record<ModuleSection, number>>();
  const zero = (): Record<ModuleSection, number> =>
    ({ formulas: 0, tables: 0, concepts: 0, traps: 0, questions: 0 });
  for (const t of content.topics) out.set(t.name, zero());

  const count = (section: ModuleSection, items: { topic?: string }[] | undefined) => {
    for (const it of items ?? []) {
      if (!it.topic) continue;
      const row = out.get(it.topic);
      if (row) row[section]++;
    }
  };
  count("formulas", content.formulas);
  count("concepts", content.concepts);
  count("traps", content.traps);
  count("questions", content.questions);
  count("tables", content.tables);
  return out;
}

export function TopicRail({ content, modules, onChange, onContent, onClose }: TopicRailProps) {
  /** Which topic's add form is open — `""` for the loose-note one. */
  const [adding, setAdding] = useState<string | null>(null);
  const counts = useMemo(() => linesByTopic(content), [content]);
  const noteCount = (content.notes ?? []).length;
  const looseNotes = (content.notes ?? []).filter((n) => !n.topic).length;

  const set = (name: string, patch: Partial<ModuleState[string]>) => {
    const next: ModuleState = { ...modules, [name]: { ...modules[name], ...patch } };
    // Keep the state small and readable: an untouched topic has no entry at all.
    const m = next[name];
    if (!m.off && !m.trim && !m.sections) delete next[name];
    onChange(next);
  };

  const shown = content.topics.filter((t) => !modules[t.name]?.off).length;

  return (
    <div className="pointer-events-auto w-full max-w-[720px] animate-[cl-rise_220ms_var(--ease-pop)] rounded-[14px] bg-[var(--band-2)] p-4 shadow-[0_20px_50px_rgba(17,17,20,.4)]">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-white">
          Topics on this sheet
          <span className="ml-2 font-mono text-[11px] font-normal text-[var(--on-band-muted)]">
            {shown}/{content.topics.length}
          </span>
        </span>
        <button
          type="button"
          onClick={onClose}
          className="font-mono text-[11px] text-[var(--on-band-muted)] hover:text-[var(--on-band)]"
        >
          close
        </button>
      </div>
      <p className="mt-1 text-[12px] leading-[1.5] text-[var(--on-band-muted)]">
        Remove a topic and its space goes to the rest. All of this is free and instant &mdash; nothing
        here rebuilds your sheet.
      </p>

      <ul className="mt-3 flex max-h-[46vh] flex-col gap-1.5 overflow-y-auto pr-1">
        {content.topics.map((t) => {
          const mod = modules[t.name] ?? {};
          const row = counts.get(t.name) ?? { formulas: 0, tables: 0, concepts: 0, traps: 0, questions: 0 };
          const total = MODULE_SECTIONS.reduce((n, s) => n + row[s], 0);
          const on = !mod.off;
          const trimmed = mod.trim ?? 0;
          const room = trimRoom(total, trimmed);
          const mix = mod.sections ?? [...MODULE_SECTIONS];

          return (
            <li key={t.name} className={`rounded-[10px] bg-white/[0.04] px-3 py-2.5 ${on ? "" : "opacity-55"}`}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <label className="tap flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => set(t.name, { off: on ? true : undefined })}
                    className="h-[15px] w-[15px] shrink-0 cursor-pointer accent-[var(--signal-500)]"
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white">{t.name}</span>
                </label>

                <span className="shrink-0 font-mono text-[11px] text-[var(--on-band-muted)]">
                  {trimmed ? `${total - trimmed}/${total}` : total} {total === 1 ? "line" : "lines"}
                </span>

                {/* Less / more. At the floor, "less" becomes "remove" rather than pretending. */}
                <span className="flex shrink-0 items-center gap-1" role="group" aria-label={`How much of ${t.name}`}>
                  <button
                    type="button"
                    disabled={!on || trimmed === 0}
                    onClick={() => set(t.name, { trim: trimmed - 1 || undefined })}
                    title="Put a line back"
                    aria-label={`Put a line back into ${t.name}`}
                    className="tap rounded-[7px] bg-white/10 px-2 py-1 text-[12px] font-semibold text-white hover:bg-white/20 disabled:opacity-30"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdding(adding === t.name ? null : t.name)}
                    aria-expanded={adding === t.name}
                    title={`Add your own line to ${t.name}`}
                    className="tap rounded-[7px] bg-white/10 px-2 py-1 text-[11.5px] font-semibold text-white hover:bg-white/20"
                  >
                    add
                  </button>
                  {room > 0 ? (
                    <button
                      type="button"
                      disabled={!on}
                      onClick={() => set(t.name, { trim: trimmed + 1 })}
                      title="Trim this topic's weakest line"
                      aria-label={`Trim a line from ${t.name}`}
                      className="tap rounded-[7px] bg-white/10 px-2 py-1 text-[12px] font-semibold text-white hover:bg-white/20 disabled:opacity-30"
                    >
                      &minus;
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={!on}
                      onClick={() => set(t.name, { off: true })}
                      title={`Only ${MIN_TOPIC_LINES} lines left — remove the topic instead`}
                      className="tap rounded-[7px] bg-white/10 px-2 py-1 text-[11.5px] font-semibold text-white hover:bg-white/20 disabled:opacity-30"
                    >
                      remove
                    </button>
                  )}
                </span>
              </div>

              {/* Section mix. Only the sections this topic actually has. */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {MODULE_SECTIONS.filter((s) => row[s] > 0).map((s) => {
                  const shownSection = mix.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      disabled={!on}
                      aria-pressed={shownSection}
                      onClick={() =>
                        set(t.name, {
                          sections: shownSection ? mix.filter((x) => x !== s) : [...mix, s],
                        })
                      }
                      className={
                        "tap rounded-[6px] px-2 py-[3px] font-mono text-[10.5px] uppercase tracking-[0.05em] transition-colors duration-[160ms] disabled:opacity-30 " +
                        (shownSection
                          ? "bg-white/15 text-white"
                          : "bg-transparent text-[var(--on-band-muted)] line-through hover:text-white")
                      }
                    >
                      {SECTION_LABEL[s]} {row[s]}
                    </button>
                  );
                })}
              </div>

              {adding === t.name && (
                <AddBlock
                  topic={t.name}
                  onAdd={(patch) => {
                    onContent(patch);
                    // FR-14: a line added to a hidden topic must not vanish. Re-tick it.
                    if (!on) set(t.name, { off: undefined });
                  }}
                  onClose={() => setAdding(null)}
                />
              )}
            </li>
          );
        })}

        <li className="rounded-[10px] bg-white/[0.04] px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] font-semibold text-white">Your notes</span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="font-mono text-[11px] text-[var(--on-band-muted)]">
                {noteCount} {noteCount === 1 ? "note" : "notes"}
                {looseNotes ? ` · ${looseNotes} loose` : ""}
              </span>
              <button
                type="button"
                onClick={() => setAdding(adding === "" ? null : "")}
                aria-expanded={adding === ""}
                className="tap rounded-[7px] bg-white/10 px-2 py-1 text-[11.5px] font-semibold text-white hover:bg-white/20"
              >
                add
              </button>
            </span>
          </div>
          <p className="mt-1 text-[11.5px] leading-[1.45] text-[var(--on-band-muted)]">
            Yours, so they stay put &mdash; the sheet never trims them to make room.
          </p>
          {adding === "" && (
            <AddBlock onAdd={(patch) => onContent(patch)} onClose={() => setAdding(null)} />
          )}
        </li>
      </ul>

      {Object.keys(modules).length > 0 && (
        <button
          type="button"
          onClick={() => onChange({})}
          className="tap mt-3 rounded-[7px] px-2 py-1 text-[12px] font-semibold text-[var(--on-band-muted)] underline decoration-white/25 underline-offset-2 hover:text-white"
        >
          Put everything back
        </button>
      )}
    </div>
  );
}
