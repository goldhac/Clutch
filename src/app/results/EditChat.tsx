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
import { Tray, Modal, ModalActions, Button } from "@/components/ui";
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

/**
 * Each chip says what it costs before it is pressed. `free` ones are routed locally by
 * edit-router and never reach a model; `Pro` ones go to /api/edit and spend.
 */
const CHIPS: { label: string; text: string; send: boolean; pro?: true }[] = [
  { label: "Hide traps", text: "hide the traps", send: true },
  { label: "Compact sources", text: "compact sources", send: true },
  { label: "Chapter order", text: "put it in chapter order", send: true },
  { label: "Quiz me", text: "quiz me", send: true },
  { label: "Fill the back page", text: "fill the back page", send: true, pro: true },
  { label: "Shorter definitions", text: "make the definitions shorter", send: true, pro: true },
  { label: "Remove a topic…", text: "remove everything about ", send: false, pro: true },
  { label: "Add a question about…", text: "add a question about ", send: false, pro: true },
];

/** A failure the student did not cause and was not charged for — §10.3 shows it as a modal. */
const TIMED_OUT = /timeout|timed out|abort|504|502|ETIMEDOUT|network|fetch failed/i;

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
  /** The instruction that came back with nothing, kept so "Try again" can resend it (§10.3). */
  const [failed, setFailed] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // The Tray owns the scroll container now, so the thread scrolls its parent, not itself.
    const box = threadRef.current?.parentElement;
    box?.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
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
      const msg = e instanceof Error ? e.message : String(e);
      // A timeout is not the student's fault and costs nothing, so it gets a modal that says so
      // and hands the request back. Anything else is a real answer from the server — it belongs
      // in the thread where the student can read it against what they asked for.
      if (TIMED_OUT.test(msg)) {
        setFailed(instruction);
        setText(instruction);
      } else {
        say({ role: "clutch", tone: "error", text: msg });
      }
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
    <>
      <Tray
        title="Edit with Clutch"
        width={500}
        onClose={onClose}
        headerAction={
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className="ctl tap shrink-0 rounded-[6px] px-1.5 py-1 font-mono text-[11px] text-[var(--on-band-muted)] enabled:hover:text-[var(--on-band)] disabled:opacity-40"
          >
            undo last edit
          </button>
        }
        below={
          <>
            {/* Chips wrap rather than scroll sideways: a control the student cannot see is a
                control they do not have, and the Pro ones are exactly the ones worth seeing. */}
            <div className="flex flex-wrap gap-1.5 px-[18px] pb-2 pt-1">
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
                  className="ctl tap inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-[#3a3a45] px-2.5 text-[12px] font-medium text-[#cbcbd4] hover:border-[var(--ink-500)] hover:text-white disabled:opacity-50"
                >
                  {c.label}
                  <span
                    className={
                      "font-mono text-[10px] " +
                      (c.pro
                        ? "rounded-[4px] border border-[rgba(219,180,94,.4)] px-1 text-[#dbb45e]"
                        : "text-[#6b6b76]")
                    }
                  >
                    {c.pro ? "Pro" : "free"}
                  </span>
                </button>
              ))}
            </div>

            <form
              className="flex items-end gap-2 px-[18px] pb-2.5"
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
                className="ctl-input min-h-[38px] flex-1 resize-none rounded-[9px] !bg-white/[0.07] px-3 py-2 text-[13.5px]"
              />
              <button
                type="submit"
                disabled={!text.trim() || busy}
                className="ctl ctl-primary tap h-[38px] shrink-0 rounded-[9px] px-3.5 text-[13px] font-semibold"
              >
                Send
              </button>
            </form>
          </>
        }
        footer="show · hide · reorder are free · rewrites come back as a preview"
      >
        <div ref={threadRef} className="flex flex-col gap-2.5 px-2 py-1" aria-live="polite">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "you" ? "self-end" : "self-start"} style={{ maxWidth: "90%" }}>
              <div
                className={
                  "rounded-[12px] px-3 py-2 text-[13px] leading-[1.5] " +
                  (m.role === "you"
                    ? "bg-white text-[var(--band)]"
                    : m.tone === "error"
                      ? "bg-[var(--conf-low-bg)] text-[var(--conf-low-deep)]"
                      : "bg-white/[0.07] text-[#e2e2e8]")
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
                <div className="mt-1.5 rounded-[12px] shadow-[inset_0_0_0_1px_var(--band-line)]">
                  <div className="px-3 pb-2 pt-2.5">
                    <div className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--on-band-muted)]">
                      {summarise(m.proposal.ops)}
                    </div>
                    <ul className="mt-1.5 flex max-h-[180px] flex-col gap-1 overflow-y-auto text-[12.5px] leading-[1.45]">
                      {m.proposal.ops.map((o, k) => (
                        <li key={k} className="flex gap-2">
                          <span
                            aria-hidden
                            className={
                              "mt-[1px] w-3 shrink-0 text-center font-mono font-bold " +
                              (o.op === "remove" ? "text-[#f08a75]" : "text-[#5cc98d]")
                            }
                          >
                            {o.op === "remove" ? "−" : "+"}
                          </span>
                          <span className="min-w-0 text-[var(--on-band)]">
                            <span className="text-[var(--on-band-muted)]">{SECTION_NAME[o.section] ?? o.section}: </span>
                            {o.op === "remove" ? (
                              <s className="text-[var(--on-band-muted)]">{o.before}</s>
                            ) : (
                              <>
                                {o.op === "edit" && o.before && (
                                  <s className="mr-1.5 text-[var(--on-band-muted)]">{o.before}</s>
                                )}
                                {o.after}
                              </>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {/* A reworded line keeps its citation and stays ours — the student did not write
                        it, so it must not arrive wearing the marker that means they did. */}
                    {m.proposal.ops.some((o) => o.op === "edit") && (
                      <div className="mt-1.5 font-mono text-[10.5px] text-[var(--on-band-muted)]">
                        keeps its citation · stays ours
                      </div>
                    )}
                    {m.proposal.dropped.length > 0 && (
                      <div className="mt-1.5 text-[11.5px] leading-[1.45] text-[var(--on-band-muted)]">
                        {m.proposal.dropped.length} change{m.proposal.dropped.length === 1 ? "" : "s"} left out because {m.proposal.dropped.length === 1 ? "it" : "they"} didn&rsquo;t meet the citation rules.
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 rounded-b-[12px] border-t border-[var(--band-line)] bg-[#17171c] px-3 py-2">
                    {m.proposal.status === "pending" && i === lastPending ? (
                      <>
                        <button
                          type="button"
                          onClick={() => decide(i, true)}
                          className="ctl ctl-primary tap inline-flex h-8 items-center rounded-[8px] px-3 text-[12.5px] font-semibold"
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          onClick={() => decide(i, false)}
                          className="ctl tap inline-flex h-8 items-center rounded-[8px] border border-[#3a3a45] px-3 text-[12.5px] font-semibold text-[var(--on-band)] hover:bg-white/[0.06]"
                        >
                          Reject
                        </button>
                        {/* Said before it spends, not after. */}
                        <span className="ml-auto shrink-0 font-mono text-[10.5px] text-[#dbb45e]">
                          1 Pro edit on accept
                        </span>
                      </>
                    ) : (
                      <span className="font-mono text-[11px] text-[var(--on-band-muted)]">
                        {m.proposal.status === "accepted" ? "accepted ✓ · undo is at the top" : m.proposal.status === "rejected" ? "rejected · sheet unchanged" : "superseded by a newer proposal"}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          {busy && <div className="self-start rounded-[12px] bg-white/[0.07] px-3 py-2 text-[13px] text-[var(--on-band-muted)]">Working out the edit…</div>}
        </div>
      </Tray>

      {/* §10.3 — failure the student did not cause. It says the sheet is untouched and that
          nothing was charged, because both are the questions they will actually have. */}
      <Modal
        open={failed !== null}
        onClose={() => setFailed(null)}
        tone="caveat"
        eyebrow="EDIT FAILED · NOTHING CHANGED"
        title="That edit didn't come back"
        footer={{ tint: "plain", text: "not charged · your request is kept in the box" }}
      >
        <p className="text-[14px] leading-[1.6] text-[var(--ink-700)]">
          The model timed out before it finished. Your sheet is exactly as it was, and no edit was
          used.
        </p>
        <ModalActions>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              const again = failed;
              setFailed(null);
              if (again) void send(again);
            }}
          >
            Try again
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setFailed(null)}>Close</Button>
        </ModalActions>
      </Modal>
    </>
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
