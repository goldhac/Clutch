"use client";

/**
 * TopicRail — the sheet's topics as a list you control (editing-flow handoff §5).
 *
 * Beside the sheet, never on it: the sheet is what prints, and putting checkboxes inside a dense
 * 7-column print layout would clutter the one thing the product sells. A list is also stable — it
 * never reflows when the sheet does — and it is keyboard-navigable without extra work.
 *
 * Every control here is free and instant. Nothing in this file calls an API, which is why the
 * footer says so: a panel full of buttons should state what it costs before it is used.
 *
 * Each row wears its topic's own colour — the tick, the hover bar — so a row and its block on the
 * page are obviously the same object. The hover preview makes that same connection from the sheet
 * end.
 */
import { useMemo, useState } from "react";
import { Tray } from "@/components/ui";
import type { SheetContent } from "@/contract/sheet-content";
import { topicColorClass } from "@/components/sheet/topics-color";
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
  onContent: (patch: (content: SheetContent) => SheetContent) => void;
  /** Point at a topic to find it on the sheet. Fires on hover AND keyboard focus. */
  onPreview: (topic: string | null) => void;
  onClose: () => void;
}

type Counts = Record<ModuleSection, number>;
const zero = (): Counts => ({ formulas: 0, tables: 0, concepts: 0, traps: 0, questions: 0 });

/** Lines per topic per section, and how many of them the student wrote. */
function measure(content: SheetContent) {
  const lines = new Map<string, Counts>();
  const mine = new Map<string, number>();
  for (const t of content.topics) {
    lines.set(t.name, zero());
    mine.set(t.name, 0);
  }
  const count = (section: ModuleSection, items: { topic?: string; mine?: true }[] | undefined) => {
    for (const it of items ?? []) {
      if (!it.topic) continue;
      const row = lines.get(it.topic);
      if (!row) continue;
      row[section]++;
      if (it.mine) mine.set(it.topic, (mine.get(it.topic) ?? 0) + 1);
    }
  };
  count("formulas", content.formulas);
  count("concepts", content.concepts);
  count("traps", content.traps);
  count("questions", content.questions);
  count("tables", content.tables);
  for (const n of content.notes ?? []) {
    if (n.topic && mine.has(n.topic)) mine.set(n.topic, (mine.get(n.topic) ?? 0) + 1);
  }
  return { lines, mine };
}

export function TopicRail({ content, modules, onChange, onContent, onPreview, onClose }: TopicRailProps) {
  const { lines, mine } = useMemo(() => measure(content), [content]);
  const [adding, setAdding] = useState<string | null>(null);

  const set = (name: string, patch: Partial<ModuleState[string]>) => {
    const next: ModuleState = { ...modules, [name]: { ...modules[name], ...patch } };
    const m = next[name];
    // Keep the state small and readable: an untouched topic has no entry at all.
    if (!m.off && !m.trim && !m.sections) delete next[name];
    onChange(next);
  };

  const on = content.topics.filter((t) => !modules[t.name]?.off).length;
  const touched = Object.keys(modules).length > 0;

  return (
    <Tray
      title="Topics on this sheet"
      count={`${on} of ${content.topics.length} on`}
      description="Point at a topic to find it on the sheet. Remove one and its space goes to the rest."
      width={580}
      onClose={() => {
        onPreview(null);
        onClose();
      }}
      footer={
        <span className="flex items-center justify-between gap-4">
          <span>free · instant · nothing here rebuilds your sheet</span>
          {touched && (
            <button
              type="button"
              onClick={() => onChange({})}
              className="ctl tap shrink-0 rounded-[6px] px-1 text-[12px] font-semibold text-[var(--on-band-muted)] underline decoration-white/25 underline-offset-2 hover:text-white"
            >
              Put everything back
            </button>
          )}
        </span>
      }
    >
      {content.topics.map((t, i) => {
        const mod = modules[t.name] ?? {};
        const row = lines.get(t.name) ?? zero();
        const total = MODULE_SECTIONS.reduce((n, s) => n + row[s], 0);
        const isOn = !mod.off;
        const trimmed = mod.trim ?? 0;
        const room = trimRoom(total, trimmed);
        const mix = mod.sections ?? [...MODULE_SECTIONS];
        const yours = mine.get(t.name) ?? 0;
        const tk = topicColorClass(i);

        return (
          <div
            key={t.name}
            className={`${tk} group relative rounded-[10px] py-[9px] pl-[14px] pr-[10px] transition-colors duration-[140ms] hover:bg-white/[0.07] focus-within:bg-white/[0.07] ${isOn ? "" : "opacity-55"}`}
            onMouseEnter={() => isOn && onPreview(t.name)}
            onMouseLeave={() => onPreview(null)}
            onFocusCapture={() => isOn && onPreview(t.name)}
            onBlurCapture={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onPreview(null);
            }}
          >
            {/* Hover bar in the topic's own colour, so the row and its block read as one object.
                Transparent at rest — the list should be quiet until pointed at. */}
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-[10px] left-[3px] top-[10px] w-[3px] rounded-[2px] bg-transparent transition-colors duration-[140ms] group-hover:bg-[var(--tk)] group-focus-within:bg-[var(--tk)]"
            />

            <div className="flex items-center gap-2.5">
              {/* A button with aria-pressed rather than a checkbox: it has to carry the topic
                  colour when on, which a native control cannot. */}
              <button
                type="button"
                aria-pressed={isOn}
                aria-label={`${isOn ? "Remove" : "Put back"} ${t.name}`}
                onClick={() => set(t.name, { off: isOn ? true : undefined })}
                className="ctl ctl-square tap inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] active:scale-[0.92]"
                style={
                  isOn
                    ? { background: "var(--tk)", border: "1px solid var(--tk)" }
                    : { background: "transparent", border: "1.5px solid #4a4a53" }
                }
              >
                {isOn && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m5 13 4 4L19 7" />
                  </svg>
                )}
              </button>

              <span className={`min-w-0 flex-1 truncate text-[13.5px] font-semibold text-[var(--on-band)] ${isOn ? "" : "line-through"}`}>
                {t.name}
              </span>

              {yours > 0 && (
                <span
                  className="flex shrink-0 items-center gap-1 font-mono text-[11px] text-[#b3b0f4]"
                  title={`${yours} line${yours === 1 ? "" : "s"} you wrote`}
                >
                  <span aria-hidden className="inline-block h-[7px] w-[7px] rounded-full border-[1.3px] border-[#b3b0f4]" />
                  {yours} you
                </span>
              )}

              <span className="w-[62px] shrink-0 text-right font-mono text-[11px] text-[var(--on-band-muted)]">
                {!isOn ? "off" : trimmed ? `${total - trimmed} of ${total}` : `${total} lines`}
              </span>

              <span className="flex shrink-0 items-center gap-1" role="group" aria-label={`How much of ${t.name}`}>
                {/* At the floor, "less" becomes "remove" rather than pretending it can keep going. */}
                {room > 0 ? (
                  <button
                    type="button"
                    disabled={!isOn}
                    onClick={() => set(t.name, { trim: trimmed + 1 })}
                    aria-label={`Trim a line from ${t.name}`}
                    title="Trim this topic's weakest line"
                    className="ctl ctl-neutral ctl-square tap inline-flex h-7 w-7 items-center justify-center rounded-[7px] text-[13px] font-semibold"
                  >
                    &minus;
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!isOn}
                    onClick={() => set(t.name, { off: true })}
                    title={`Only ${MIN_TOPIC_LINES} lines left — remove the topic instead`}
                    className="ctl ctl-destructive tap inline-flex h-7 items-center rounded-[7px] px-2 text-[11.5px] font-semibold"
                  >
                    Remove
                  </button>
                )}
                <button
                  type="button"
                  disabled={!isOn || trimmed === 0}
                  onClick={() => set(t.name, { trim: trimmed - 1 || undefined })}
                  aria-label={`Put a line back into ${t.name}`}
                  title="Put a line back"
                  className="ctl ctl-neutral ctl-square tap inline-flex h-7 w-7 items-center justify-center rounded-[7px] text-[13px] font-semibold"
                >
                  +
                </button>
                <span aria-hidden className="mx-0.5 h-[18px] w-px bg-[var(--band-line)]" />
                <button
                  type="button"
                  onClick={() => setAdding(adding === t.name ? null : t.name)}
                  aria-expanded={adding === t.name}
                  className="ctl ctl-additive tap inline-flex h-7 items-center rounded-[7px] px-2.5 text-[11.5px] font-semibold"
                >
                  Add yours
                </button>
              </span>
            </div>

            {/* Section mix — only the kinds this topic actually has. */}
            <div className="ml-[28px] mt-1.5 flex flex-wrap items-center gap-1">
              {MODULE_SECTIONS.filter((s) => row[s] > 0).map((s) => {
                const shown = mix.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={!isOn}
                    aria-pressed={shown}
                    onClick={() => set(t.name, { sections: shown ? mix.filter((x) => x !== s) : [...mix, s] })}
                    className={
                      "ctl tap inline-flex h-[22px] items-center rounded-[6px] px-[7px] font-mono text-[10.5px] uppercase tracking-[0.04em] " +
                      (shown
                        ? "bg-white/10 text-[#e2e2e8]"
                        : "bg-transparent text-[#6b6b76] line-through hover:text-[#9a9aa6]")
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
                  if (!isOn) set(t.name, { off: undefined });
                }}
                onClose={() => setAdding(null)}
              />
            )}
          </div>
        );
      })}
    </Tray>
  );
}
