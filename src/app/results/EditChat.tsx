"use client";

/**
 * EditChat — "Edit with Clutch" (issue #14).
 *
 * One box, two kinds of request:
 *   - display changes ("hide the traps", "chapter order") are routed locally: free, instant;
 *   - content edits go to /api/edit and come back as a PROPOSAL — the exact lines that would
 *     be added, removed or reworded. Nothing changes until the student accepts, and every
 *     accepted edit can be undone.
 */
import { useEffect, useRef, useState } from "react";
import type { SheetContent } from "@/contract/sheet-content";
import { routeInstruction, type FreeAction } from "@/lib/edit-router";

interface ProposalOp {
  op: "add" | "remove" | "edit";
  section: string;
  before?: string;
  after?: string;
}

interface Proposal {
  ops: ProposalOp[];
  dropped: string[];
  proposed: SheetContent;
  status: "pending" | "accepted" | "rejected";
}

interface Message {
  role: "you" | "clutch";
  text: string;
  proposal?: Proposal;
  tone?: "error" | "upsell";
}

/** "fill the back", "fill both pages", "add more content" → top the pool up from the pack. */
const FILL_INTENT = /\bfill\b[^.]*\b(back|page|pages|sheet|sides?|both)\b|\b(add|need|want)\s+more\s+(content|lines|material)\b|\bmore\s+content\b/i;

const CHIPS: { label: string; text: string; send: boolean }[] = [
  { label: "Fill the back page", text: "fill the back page", send: true },
  { label: "Hide traps", text: "hide the traps", send: true },
  { label: "Compact sources", text: "compact sources", send: true },
  { label: "Chapter order", text: "put it in chapter order", send: true },
  { label: "Quiz me", text: "quiz me", send: true },
  { label: "Shorter definitions", text: "make the definitions shorter", send: true },
  { label: "Remove a topic…", text: "remove everything about ", send: false },
  { label: "Add a question about…", text: "add a question about ", send: false },
];

const SECTION_NAME: Record<string, string> = {
  topics: "topic", formulas: "formula", concepts: "definition", tables: "table", traps: "trap", questions: "question",
};

export interface EditChatProps {
  content: SheetContent;
  /** Filenames of the student's pack — new lines must cite one of them. */
  files: string[];
  pro: boolean;
  /** The exam format the sheet was built for; new lines follow it. */
  examFormat?: string;
  canUndo: boolean;
  onFree: (actions: FreeAction[]) => void;
  onAccept: (next: SheetContent) => void;
  onUndo: () => void;
  onUpsell: () => void;
  onClose: () => void;
  /** Sent once when the chat opens (the "fill the back page" nudge). */
  autoSend?: string;
}

export function EditChat({ content, files, pro, examFormat, canUndo, onFree, onAccept, onUndo, onUpsell, onClose, autoSend }: EditChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "clutch",
      text: "Tell me what to change. Showing, hiding and reordering are free and instant. Rewording, adding or removing lines comes back as a preview you accept or reject.",
    },
  ]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const say = (m: Message) => setMessages((prev) => [...prev, m]);

  async function send(raw: string) {
    const instruction = raw.trim();
    if (!instruction || busy) return;
    setText("");
    say({ role: "you", text: instruction });

    const route = routeInstruction(instruction, (content.figures ?? []).map((f) => ({ id: f.id, caption: f.caption })));
    if (route.kind === "free") {
      onFree(route.actions);
      say({ role: "clutch", text: route.reply });
      return;
    }
    if (!pro) {
      say({ role: "clutch", tone: "upsell", text: "That one changes the words on your sheet, which is a Pro edit. Showing, hiding and reordering stay free." });
      return;
    }

    setBusy(true);
    try {
      let packText: string | undefined;
      try {
        packText = sessionStorage.getItem("clutch:pack") ?? undefined;
      } catch {
        packText = undefined;
      }
      const res = await fetch("/api/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Diagrams are images the engine never sees.
        body: JSON.stringify({
          content: { ...content, figures: undefined }, instruction, packText, files,
          ...(FILL_INTENT.test(instruction) ? { mode: "fill", examFormat } : {}),
        }),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      const p = (await res.json()) as { reply: string; ops: ProposalOp[]; dropped: string[]; proposed: SheetContent };
      say({
        role: "clutch",
        text: p.reply + (packText || p.ops.every((o) => o.op !== "add") ? "" : " (Your files aren't loaded in this session, so I can only reword or remove.)"),
        proposal: p.ops.length
          ? { ops: p.ops, dropped: p.dropped, proposed: { ...p.proposed, figures: content.figures }, status: "pending" }
          : undefined,
      });
    } catch (e) {
      say({ role: "clutch", tone: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  // The nudge on Results opens the chat with the request already made.
  const autoSent = useRef(false);
  useEffect(() => {
    if (autoSend && !autoSent.current) {
      autoSent.current = true;
      void send(autoSend);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSend]);

  function decide(index: number, accept: boolean) {
    const proposal = messages[index]?.proposal;
    if (!proposal || proposal.status !== "pending") return;
    // The parent update happens here, not inside the state updater (React forbids that).
    if (accept) onAccept(proposal.proposed);
    setMessages((prev) =>
      prev.map((m, i) => (i === index && m.proposal ? { ...m, proposal: { ...m.proposal, status: accept ? "accepted" : "rejected" } } : m)),
    );
  }

  // A proposal is built against the sheet as it was; once another edit lands it is stale.
  const lastPending = messages.map((m, i) => (m.proposal?.status === "pending" ? i : -1)).filter((i) => i >= 0).pop();

  return (
    <div className="pointer-events-auto flex max-h-[min(70vh,560px)] w-full max-w-[640px] animate-[cl-rise_220ms_var(--ease-pop)] flex-col rounded-[14px] bg-[var(--band-2)] shadow-[0_20px_50px_rgba(17,17,20,.4)]">
      <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
        <span className="text-[13px] font-semibold text-white">Edit with Clutch</span>
        <span className="flex items-center gap-3">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className="font-mono text-[11px] text-[var(--on-band-muted)] enabled:hover:text-[var(--on-band)] disabled:opacity-40"
          >
            undo last edit
          </button>
          <button type="button" onClick={onClose} className="font-mono text-[11px] text-[var(--on-band-muted)] hover:text-[var(--on-band)]">
            close
          </button>
        </span>
      </div>

      <div ref={threadRef} className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 pb-2" aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "you" ? "self-end" : "self-start"} style={{ maxWidth: "92%" }}>
            <div
              className={
                "rounded-[12px] px-3 py-2 text-[13px] leading-[1.5] " +
                (m.role === "you"
                  ? "bg-white text-[var(--band)]"
                  : m.tone === "error"
                    ? "bg-[var(--conf-low-bg)] text-[var(--conf-low-deep)]"
                    : "bg-white/[0.08] text-[var(--on-band)]")
              }
            >
              {m.text}
              {m.tone === "upsell" && (
                <button type="button" onClick={onUpsell} className="mt-1.5 block font-semibold text-white underline underline-offset-2">
                  See what Pro unlocks
                </button>
              )}
            </div>

            {m.proposal && (
              <div className="mt-1.5 rounded-[12px] border border-[var(--band-line)] px-3 py-2.5">
                <div className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-[var(--on-band-muted)]">
                  {summarise(m.proposal.ops)}
                </div>
                <ul className="mt-1.5 flex max-h-[180px] flex-col gap-1 overflow-y-auto text-[12.5px] leading-[1.45]">
                  {m.proposal.ops.map((o, k) => (
                    <li key={k} className="flex gap-2">
                      <span
                        aria-hidden
                        className={
                          "mt-[1px] w-3 shrink-0 text-center font-mono font-bold " +
                          (o.op === "add" ? "text-[var(--conf-high)]" : o.op === "remove" ? "text-[var(--conf-low)]" : "text-[var(--verified)]")
                        }
                      >
                        {o.op === "add" ? "+" : o.op === "remove" ? "−" : "~"}
                      </span>
                      <span className="text-[var(--on-band)]">
                        <span className="text-[var(--on-band-muted)]">{SECTION_NAME[o.section] ?? o.section}: </span>
                        {o.op === "remove" ? <s className="opacity-80">{o.before}</s> : o.after}
                      </span>
                    </li>
                  ))}
                </ul>
                {m.proposal.dropped.length > 0 && (
                  <div className="mt-1.5 text-[11.5px] leading-[1.45] text-[var(--on-band-muted)]">
                    {m.proposal.dropped.length} change{m.proposal.dropped.length === 1 ? "" : "s"} left out because {m.proposal.dropped.length === 1 ? "it" : "they"} didn&rsquo;t meet the citation rules.
                  </div>
                )}
                <div className="mt-2.5 flex items-center gap-2">
                  {m.proposal.status === "pending" && i === lastPending ? (
                    <>
                      <button
                        type="button"
                        onClick={() => decide(i, true)}
                        className="tap rounded-[8px] bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[var(--band)]"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => decide(i, false)}
                        className="tap rounded-[8px] border border-[var(--band-line)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--on-band)]"
                      >
                        Reject
                      </button>
                      <span className="font-mono text-[10.5px] text-[var(--on-band-muted)]">nothing changes until you accept</span>
                    </>
                  ) : (
                    <span className="font-mono text-[11px] text-[var(--on-band-muted)]">
                      {m.proposal.status === "accepted" ? "accepted ✓ — undo is at the top" : m.proposal.status === "rejected" ? "rejected — sheet unchanged" : "superseded by a newer proposal"}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        {busy && <div className="self-start rounded-[12px] bg-white/[0.08] px-3 py-2 text-[13px] text-[var(--on-band-muted)]">Working out the edit…</div>}
      </div>

      <div className="flex gap-1.5 overflow-x-auto px-4 pb-2 pt-1">
        {CHIPS.map((c) => (
          <button
            key={c.label}
            type="button"
            disabled={busy}
            onClick={() => {
              if (c.send) void send(c.text);
              else {
                setText(c.text);
                inputRef.current?.focus();
              }
            }}
            className="tap shrink-0 rounded-full border border-[var(--band-line)] px-2.5 py-1 text-[12px] font-medium text-[var(--on-band-muted)] transition-colors duration-[160ms] hover:border-[var(--ink-500)] hover:text-[var(--on-band)] disabled:opacity-50"
          >
            {c.label}
          </button>
        ))}
      </div>

      <form
        className="flex items-end gap-2 border-t border-[var(--band-line)] px-3 py-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <textarea
          id="edit-chat-input"
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 500))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(text);
            }
          }}
          rows={1}
          placeholder="e.g. remove everything about ELMo"
          aria-label="What should change on the sheet?"
          className="min-h-[38px] flex-1 resize-none rounded-[9px] bg-white/[0.08] px-3 py-2 text-[13.5px] text-white placeholder:text-[var(--on-band-muted)] focus:outline-none focus:ring-1 focus:ring-white/40"
        />
        <button
          type="submit"
          disabled={!text.trim() || busy}
          className="tap h-[38px] shrink-0 rounded-[9px] bg-white px-3.5 text-[13px] font-semibold text-[var(--band)] disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}

function summarise(ops: ProposalOp[]): string {
  const n = (k: string) => ops.filter((o) => o.op === k).length;
  const parts = [
    n("add") ? `${n("add")} added` : "",
    n("edit") ? `${n("edit")} reworded` : "",
    n("remove") ? `${n("remove")} removed` : "",
  ].filter(Boolean);
  return `Proposed · ${parts.join(" · ")}`;
}
