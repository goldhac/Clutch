"use client";

/**
 * AddBlock — put your own writing on the sheet (#20).
 *
 * Three shapes, because that is what students actually write down: a definition, a question they
 * keep getting wrong, or a loose note ("he said this WILL be on the final"). Anything longer than
 * a note belongs in a notes app, not on a sheet whose whole point is density.
 *
 * Everything made here is theirs: it reads `you` instead of a citation, it can never carry the
 * verified star, and the fitter may never trim it. That is enforced in the contract and in the
 * fitter, not here — this only has to mark it correctly.
 *
 * Plain on purpose; the visual pass is Gold's.
 */
import { useState } from "react";
import type { SheetContent, SheetNote } from "@/contract/sheet-content";

type Shape = "note" | "concept" | "question" | "table";

export interface AddBlockProps {
  /** The topic this is being added to, or undefined for a loose note. */
  topic?: string;
  onAdd: (patch: (content: SheetContent) => SheetContent) => void;
  onClose: () => void;
}

const MAX_NOTE = 400;

export function AddBlock({ topic, onAdd, onClose }: AddBlockProps) {
  const [shape, setShape] = useState<Shape>("note");
  const [a, setA] = useState("");
  const [b, setB] = useState("");

  const labels: Record<Shape, [string, string]> = {
    note: ["Your note, e.g. \u201Che said this WILL be on the final\u201D", ""],
    concept: ["Term", "What it means"],
    question: ["Question", "Answer"],
    // Plain text rather than a grid editor: a student comparing two things types two columns and
    // a few rows far faster than they click cells, and it degrades to a textarea on any screen.
    table: ["Title, then columns: Test | When to use", "One row per line, cells split by |"],
  };
  const [labelA, labelB] = labels[shape];

  /**
   * A table has a shape the contract enforces: at least two columns, at least one row, and every
   * row exactly as wide as the header. Checked HERE so a student sees what is wrong while they are
   * typing, instead of building something the sheet would refuse after the fact.
   */
  const tableParse = (() => {
    if (shape !== "table") return null;
    const cols = a.split("|").map((x) => x.trim());
    const rows = b.split("\n").map((line) => line.split("|").map((x) => x.trim())).filter((r) => r.some(Boolean));
    if (cols.length < 2) return { error: "Two columns at least — separate them with |" };
    if (cols.slice(1).some((c) => !c)) return { error: "Only the first column header may be blank" };
    if (!rows.length) return { error: "Add at least one row" };
    const bad = rows.findIndex((r) => r.length !== cols.length);
    if (bad >= 0) return { error: `Row ${bad + 1} has ${rows[bad].length} cells; the header has ${cols.length}` };
    return { cols, rows };
  })();

  const ready =
    shape === "note"
      ? a.trim().length > 0
      : shape === "table"
        ? !!tableParse && !("error" in tableParse)
        : a.trim().length > 0 && b.trim().length > 0;

  function submit() {
    if (!ready) return;
    const text = a.trim();
    const second = b.trim();

    onAdd((content) => {
      // Adding to a topic that is currently off would put a line somewhere the student cannot see
      // it. The caller re-ticks; here we only build the content (FR-14).
      if (shape === "note") {
        const note: SheetNote = {
          id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          ...(topic ? { topic } : {}),
          text: text.slice(0, MAX_NOTE),
          createdAt: new Date().toISOString(),
        };
        return { ...content, notes: [...(content.notes ?? []), note] };
      }
      // `src: "you"` is the honest citation and also what keeps conf out of "high": the contract's
      // trust rule only allows high on exam-grade or multi-source citations.
      const shared = { src: "you", conf: "med" as const, mine: true as const, ...(topic ? { topic } : {}) };
      if (shape === "table" && tableParse && !("error" in tableParse)) {
        return {
          ...content,
          tables: [
            ...(content.tables ?? []),
            { title: tableParse.cols[0] || "Comparison", cols: tableParse.cols, rows: tableParse.rows, src: "you", mine: true as const, ...(topic ? { topic } : {}) },
          ],
        };
      }
      if (shape === "concept") {
        return { ...content, concepts: [...content.concepts, { term: text, def: second, ...shared }] };
      }
      return {
        ...content,
        questions: [...content.questions, { q: text, a: second, kind: "short" as const, ...shared }],
      };
    });
    onClose();
  }

  return (
    <div className="tray mb-0.5 ml-[28px] mt-2.5 rounded-[10px] bg-[#15151a] p-3 shadow-[inset_0_0_0_1px_var(--band-line)]">
      <div className="flex flex-wrap items-center gap-1.5">
        {(["note", "concept", "question", "table"] as Shape[]).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={shape === s}
            onClick={() => setShape(s)}
            className={
              "ctl tap inline-flex h-[22px] items-center rounded-[6px] px-[7px] font-mono text-[10.5px] uppercase tracking-[0.04em] " +
              (shape === s ? "bg-white/[0.14] text-white" : "text-[#6b6b76] hover:text-[#9a9aa6]")
            }
          >
            {s === "concept" ? "definition" : s}
          </button>
        ))}
        <span className="ml-auto font-mono text-[10.5px] text-[var(--on-band-muted)]">
          {topic ? `into ${topic}` : "no topic"}
        </span>
      </div>

      <label className="mt-2 block">
        <span className="sr-only">{labelA}</span>
        <input
          autoFocus
          value={a}
          maxLength={shape === "note" ? MAX_NOTE : 160}
          onChange={(e) => setA(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && ready && shape === "note") submit(); }}
          placeholder={labelA}
          className="ctl-input h-[34px] w-full rounded-[8px] px-2.5 text-[13px]"
        />
      </label>

      {labelB && (
        <label className="mt-1.5 block">
          <span className="sr-only">{labelB}</span>
          {shape === "table" ? (
            <textarea
              value={b}
              rows={3}
              maxLength={800}
              onChange={(e) => setB(e.target.value)}
              placeholder={labelB}
              className={`ctl-input w-full resize-y rounded-[8px] px-2.5 py-1.5 font-mono text-[12px]${tableParse && "error" in tableParse && b.trim() ? " is-invalid" : ""}`}
            />
          ) : (
            <input
              value={b}
              maxLength={280}
              onChange={(e) => setB(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && ready) submit(); }}
              placeholder={labelB}
              className="ctl-input h-[34px] w-full rounded-[8px] px-2.5 text-[13px]"
            />
          )}
        </label>
      )}
      {tableParse && "error" in tableParse && a.trim() && (
        <p className="mt-1 text-[11.5px] text-[var(--warn,#c8862a)]">{tableParse.error}</p>
      )}

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          disabled={!ready}
          onClick={submit}
          className="ctl ctl-primary tap inline-flex h-8 items-center rounded-[8px] px-3 text-[12px] font-semibold"
        >
          Add to sheet
        </button>
        <button
          type="button"
          onClick={onClose}
          className="ctl tap inline-flex h-8 items-center rounded-[8px] px-2 text-[12px] font-semibold text-[var(--on-band-muted)] hover:text-white"
        >
          Cancel
        </button>
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[10.5px] text-[var(--on-band-muted)]">
          <span aria-hidden className="inline-block h-[7px] w-[7px] rounded-full border-[1.3px] border-[#b3b0f4]" />
          reads <span className="text-[#b3b0f4]">you</span> · never trimmed
        </span>
      </div>
    </div>
  );
}
