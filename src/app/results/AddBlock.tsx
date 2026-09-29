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

type Shape = "note" | "concept" | "question";

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
    note: ["Your note", ""],
    concept: ["Term", "What it means"],
    question: ["Question", "Answer"],
  };
  const [labelA, labelB] = labels[shape];
  const ready = shape === "note" ? a.trim().length > 0 : a.trim().length > 0 && b.trim().length > 0;

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
    <div className="mt-2 rounded-[10px] bg-white/[0.06] p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {(["note", "concept", "question"] as Shape[]).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={shape === s}
            onClick={() => setShape(s)}
            className={
              "tap rounded-[6px] px-2 py-[3px] font-mono text-[10.5px] uppercase tracking-[0.05em] " +
              (shape === s ? "bg-white/20 text-white" : "text-[var(--on-band-muted)] hover:text-white")
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
          className="w-full rounded-[7px] bg-black/30 px-2.5 py-1.5 text-[13px] text-white placeholder:text-white/35 focus:outline-none focus:ring-1 focus:ring-[var(--signal-500)]"
        />
      </label>

      {labelB && (
        <label className="mt-1.5 block">
          <span className="sr-only">{labelB}</span>
          <input
            value={b}
            maxLength={280}
            onChange={(e) => setB(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && ready) submit(); }}
            placeholder={labelB}
            className="w-full rounded-[7px] bg-black/30 px-2.5 py-1.5 text-[13px] text-white placeholder:text-white/35 focus:outline-none focus:ring-1 focus:ring-[var(--signal-500)]"
          />
        </label>
      )}

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          disabled={!ready}
          onClick={submit}
          className="tap rounded-[7px] bg-white/15 px-3 py-1 text-[12px] font-semibold text-white hover:bg-white/25 disabled:opacity-35"
        >
          Add to sheet
        </button>
        <button
          type="button"
          onClick={onClose}
          className="tap rounded-[7px] px-2 py-1 text-[12px] font-semibold text-[var(--on-band-muted)] hover:text-white"
        >
          Cancel
        </button>
        <span className="ml-auto font-mono text-[10.5px] text-[var(--on-band-muted)]">
          marked <span className="text-white">you</span> · never trimmed
        </span>
      </div>
    </div>
  );
}
