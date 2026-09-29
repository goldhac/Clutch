/**
 * sheet-versions.ts — history for an edited sheet (#20).
 *
 * `sheets.content` is updated in place on every change, which is fine for the engine's own edits:
 * they can always be regenerated from the same pack. It stops being fine once a student can rewrite
 * lines and add their own, because what they typed is the one part of the sheet that cannot be
 * reproduced — and an in-place update is a silent overwrite of it.
 *
 * So a meaningful change also appends a version, and the last 20 are restorable. The cap is a
 * database trigger, not something this file remembers to do: a table that stores a whole sheet per
 * row is the biggest row-size risk in the schema, and a cap the browser applies stops working the
 * moment anything else writes.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface SheetVersion {
  id: string;
  label: string | null;
  createdAt: string;
  content: unknown;
}

/**
 * Don't write a version for every keystroke. Edits arrive in bursts — a student fixes a word, then
 * another, then adds a note — and 20 slots filled by one minute's typing is a history that cannot
 * reach back to anything worth restoring.
 */
export const VERSION_DEBOUNCE_MS = 4_000;

/** Save a snapshot of what the sheet was. Never throws: history must not break editing. */
export async function saveVersion(
  db: SupabaseClient,
  sheetId: string,
  userId: string,
  content: unknown,
  label: string,
): Promise<boolean> {
  const { error } = await db
    .from("sheet_versions")
    .insert({ sheet_id: sheetId, user_id: userId, content: content as never, label: label.slice(0, 120) });
  if (error) {
    // A lost version is bad; a lost edit is worse. The edit has already been applied and saved.
    console.error(`[versions] could not save "${label}": ${error.message}`);
    return false;
  }
  return true;
}

/** The newest first — `seq` is insertion order, which `created_at` alone cannot promise. */
export async function listVersions(db: SupabaseClient, sheetId: string): Promise<SheetVersion[]> {
  const { data, error } = await db
    .from("sheet_versions")
    .select("id, label, created_at, content")
    .eq("sheet_id", sheetId)
    .order("seq", { ascending: false })
    .limit(20);
  if (error) {
    console.error(`[versions] could not list: ${error.message}`);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    label: (r.label as string | null) ?? null,
    createdAt: r.created_at as string,
    content: r.content,
  }));
}

/** "just now" · "4 min ago" · "2 hours ago" — a timestamp is not what a student is looking for. */
export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

/**
 * What changed, in the student's words. Compared against the previous content so the label says
 * something true rather than a generic "edited".
 */
export function describeChange(before: unknown, after: unknown): string {
  const count = (c: unknown, key: string) => {
    const v = (c as Record<string, unknown> | undefined)?.[key];
    return Array.isArray(v) ? v.length : 0;
  };
  const mine = (c: unknown) => {
    const o = (c ?? {}) as Record<string, unknown[]>;
    return ["concepts", "questions", "formulas", "tables"].reduce(
      (n, k) => n + (Array.isArray(o[k]) ? o[k].filter((x) => (x as { mine?: true })?.mine).length : 0),
      0,
    );
  };
  if (count(after, "notes") > count(before, "notes")) return "added a note";
  if (mine(after) > mine(before)) return "added your own line";
  const total = (c: unknown) =>
    ["concepts", "questions", "formulas", "tables", "traps"].reduce((n, k) => n + count(c, k), 0);
  if (total(after) > total(before)) return "added lines";
  if (total(after) < total(before)) return "removed lines";
  return "edited a line";
}
