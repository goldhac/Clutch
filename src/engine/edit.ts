/**
 * edit.ts — "Edit with Clutch" (issue #14): a student's instruction becomes a PATCH.
 *
 * The old tweak pass asked the model to re-emit the whole pool, which is slow (a 90 s
 * Pro call), costs a full sheet of tokens, and can silently change lines the student
 * never mentioned. Here the model returns item-level operations — add / remove / edit —
 * and the app applies them. Every new or edited item passes the same contract as a
 * generated one; an operation that fails is dropped and reported, never loosened.
 *
 * (Same lesson as the audio script, FINDINGS §9: full rewrites fixed one thing and broke
 * another; patches converged.)
 */
import { z } from "zod";
import {
  ConceptSchema,
  FormulaSchema,
  QuestionSchema,
  TableSchema,
  TopicSchema,
  TrapSchema,
  safeParseSheetContent,
  type SheetContent,
} from "@/contract/sheet-content";
import { defaultGeminiClient, GEMINI_FLASH } from "./gemini-client";
import type { LLMClient } from "./llm-client";
import { normalizeDraft } from "./normalize";

export const EDIT_SECTIONS = ["topics", "formulas", "concepts", "tables", "traps", "questions"] as const;
export type EditSection = (typeof EDIT_SECTIONS)[number];

const ITEM_SCHEMA = {
  topics: TopicSchema,
  formulas: FormulaSchema,
  concepts: ConceptSchema,
  tables: TableSchema,
  traps: TrapSchema,
  questions: QuestionSchema,
} as const;

const RawOpSchema = z.object({
  op: z.enum(["add", "remove", "edit"]),
  section: z.enum(EDIT_SECTIONS),
  index: z.number().int().optional(),
  item: z.unknown().optional(),
});
const RawEditSchema = z.object({ reply: z.string(), ops: z.array(RawOpSchema).max(60) });

export interface EditOp {
  op: "add" | "remove" | "edit";
  section: EditSection;
  /** Index in the CURRENT pool (remove / edit). */
  index?: number;
  /** The validated new item (add / edit). */
  item?: unknown;
  /** Short human labels for the preview. */
  before?: string;
  after?: string;
}

export interface EditProposal {
  reply: string;
  ops: EditOp[];
  /** Operations the model asked for that failed the contract or pointed nowhere. */
  dropped: string[];
  /** The pool with `ops` applied — what the sheet becomes on Accept. */
  proposed: SheetContent;
  meta: { model: string; inputTokens?: number; outputTokens?: number; seconds: number };
}

const labelOf = (section: EditSection, item: unknown): string => {
  const it = (item ?? {}) as Record<string, unknown>;
  const text = String(it.name ?? it.term ?? it.title ?? it.q ?? it.text ?? "");
  return `${text.slice(0, 90)}${text.length > 90 ? "…" : ""}`;
};

const EDIT_SYSTEM = `
You edit an exam reference sheet for a student. You are given the CURRENT POOL (every item
numbered by section and index), the student's INSTRUCTION, and — when available — the PACK
TEXT the sheet was built from.

Answer with a PATCH: the smallest set of operations that carries out the instruction.
- {"op":"remove","section":S,"index":N}          delete item N of section S
- {"op":"edit","section":S,"index":N,"item":{…}}  replace item N with the FULL new item
- {"op":"add","section":S,"item":{…}}             append a new item to section S
Sections: topics, formulas, concepts, tables, traps, questions. Indexes refer to the CURRENT
pool. Touch only what the instruction implies; never re-emit items you are not changing.

ITEM SHAPES (same contract as the sheet — no extra keys):
- topics:    {"name","why","src","conf","verified"?}
- formulas:  {"topic","name","formula","vars","when","trap"?,"ex"?,"src","conf","verified"?}
- concepts:  {"topic","term","def","src","conf","verified"?}
- tables:    {"topic","title","cols":[…],"rows":[[…]],"src"}   (every row as long as cols)
- traps:     {"topic","text","src"}   text must name the falsity: "X is FALSE because Y"
- questions: {"topic","q","a","kind":"MCQ|short|problem|T/F","src","conf","verified"?}   "a" is required
"topic" must be an exact topics[].name. "conf" is "high" | "med" | "low"; use "high" only with
verified:true, an exam-grade src, or a multi-source src containing ";".

GROUNDING — this sheet goes into an exam room:
- Every added or edited FACT must come from the PACK TEXT or from items already in the pool.
  Cite it the way the pool does ("<file> p12", "<file> Slide 4"). Never invent a citation.
- If the instruction asks for something the pack does not cover, do not add it: say so in
  "reply" and return no operation for that part.
- "shorter" / "simpler" = edit the wording, keep the fact, the answer and the citation.
- "remove everything about X" = remove the topic X AND every item whose topic is X.
- If the instruction is unrelated to the sheet, unsafe, or unclear, return no operations and
  ask one short clarifying question in "reply".

"reply": one or two plain sentences to the student saying what you did (or why not).
Return JSON exactly: {"reply":"","ops":[{"op":"remove","section":"traps","index":0}]}
`.trim();

function numberedPool(c: SheetContent): string {
  const out: string[] = [];
  for (const s of EDIT_SECTIONS) {
    const arr = (c[s] ?? []) as unknown[];
    out.push(`## ${s} (${arr.length})`);
    arr.forEach((item, i) => out.push(`${s}[${i}] ${JSON.stringify(item)}`));
  }
  return out.join("\n");
}

export async function proposeEdit(
  existing: SheetContent,
  instruction: string,
  opts: { client?: LLMClient; packText?: string; files?: string[]; model?: string } = {},
): Promise<EditProposal> {
  const client = opts.client ?? defaultGeminiClient();
  const t0 = Date.now();
  // Images never go to the model.
  const pool: SheetContent = { ...existing, figures: undefined };
  const user = [
    `INSTRUCTION FROM THE STUDENT:\n"${instruction.replace(/"/g, "'").slice(0, 500)}"`,
    `CURRENT POOL:\n${numberedPool(pool)}`,
    opts.packText
      ? `PACK TEXT (the student's own files — the only source for new facts):\n${opts.packText}`
      : `PACK TEXT: not available. Do not add new facts; you may only remove, reword or restructure what the pool already says.`,
  ].join("\n\n──────\n\n");

  // Flash, not Pro: measured on the BERT sheet (4 instructions), both produced the same valid,
  // grounded patches — Flash in 7–13 s, Pro in 23–45 s. A chat has to answer in chat time.
  const res = await client.generate({ system: EDIT_SYSTEM, user, model: opts.model ?? GEMINI_FLASH, temperature: 0.2, maxOutputTokens: 16384 });
  const cleaned = res.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const raw = RawEditSchema.safeParse(JSON.parse(cleaned));
  if (!raw.success) throw new Error(`edit proposal was not a valid patch: ${raw.error.issues[0]?.message}`);

  const ops: EditOp[] = [];
  const dropped: string[] = [];
  const knownFiles = (opts.files ?? []).map((f) => f.toLowerCase().replace(/\.[a-z0-9]{1,5}$/, ""));
  const topicNames = new Set(pool.topics.map((t) => t.name));
  // Topics the patch itself adds are valid homes for the items it adds.
  for (const o of raw.data.ops) {
    if (o.op === "add" && o.section === "topics") {
      const name = (o.item as { name?: unknown } | undefined)?.name;
      if (typeof name === "string") topicNames.add(name);
    }
  }

  for (const o of raw.data.ops) {
    const arr = (pool[o.section] ?? []) as unknown[];
    if (o.op !== "add") {
      if (o.index === undefined || o.index < 0 || o.index >= arr.length) {
        dropped.push(`${o.op} ${o.section}[${o.index}] — no such item`);
        continue;
      }
    }
    if (o.op === "remove") {
      ops.push({ op: "remove", section: o.section, index: o.index, before: labelOf(o.section, arr[o.index!]) });
      continue;
    }
    // add / edit: the item must pass the same contract as a generated one.
    const holder = { [o.section]: [o.item] } as Record<string, unknown[]>;
    normalizeDraft(holder);
    const parsed = ITEM_SCHEMA[o.section].safeParse(holder[o.section][0]);
    if (!parsed.success) {
      dropped.push(`${o.op} ${o.section}: ${parsed.error.issues[0]?.message ?? "invalid"} — "${labelOf(o.section, o.item)}"`);
      continue;
    }
    const item = parsed.data as { topic?: string; src: string };
    if (o.section !== "topics" && item.topic && !topicNames.has(item.topic)) {
      dropped.push(`${o.op} ${o.section}: unknown topic "${item.topic}" — "${labelOf(o.section, item)}"`);
      continue;
    }
    // A new line must cite the student's own files, not a source the model made up.
    if (o.op === "add" && knownFiles.length && !knownFiles.some((f) => item.src.toLowerCase().includes(f))) {
      dropped.push(`add ${o.section}: cites "${item.src.slice(0, 50)}", which is not one of your files — "${labelOf(o.section, item)}"`);
      continue;
    }
    ops.push({
      op: o.op, section: o.section, index: o.index, item,
      before: o.op === "edit" ? labelOf(o.section, arr[o.index!]) : undefined,
      after: labelOf(o.section, item),
    });
  }

  const proposed = applyOps(pool, ops);
  const whole = safeParseSheetContent(proposed);
  if (!whole.success) throw new Error(`the edited sheet failed the contract: ${whole.error.issues[0]?.message}`);
  return {
    reply: raw.data.reply,
    ops,
    dropped,
    proposed: { ...whole.data, figures: existing.figures },
    meta: { model: res.model, inputTokens: res.usage.inputTokens, outputTokens: res.usage.outputTokens, seconds: (Date.now() - t0) / 1000 },
  };
}

/** Edits in place, then removes from the highest index down, then appends adds. */
export function applyOps(content: SheetContent, ops: EditOp[]): SheetContent {
  const next: Record<string, unknown> = { ...content };
  for (const s of EDIT_SECTIONS) {
    const mine = ops.filter((o) => o.section === s);
    if (!mine.length) continue;
    const arr = [...(((content as Record<string, unknown>)[s] as unknown[] | undefined) ?? [])];
    for (const o of mine) if (o.op === "edit") arr[o.index!] = o.item;
    const removals = [...new Set(mine.filter((o) => o.op === "remove").map((o) => o.index!))].sort((a, b) => b - a);
    for (const i of removals) arr.splice(i, 1);
    for (const o of mine) if (o.op === "add") arr.push(o.item);
    next[s] = arr;
  }
  return next as SheetContent;
}
