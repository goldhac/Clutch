/**
 * credits — what a student has, and what it buys.
 *
 * A credit unlocks ONE SHEET, which is what the pricing page sells: "Unlock this sheet · $4.99",
 * "one credit · never expires". The app used to gate on `profiles.tier` account-wide, so a 3-Pack
 * would have bought three accounts rather than three sheets.
 *
 * Every rule lives in the database (supabase/migrations/20260930_credit_ledger.sql), not here:
 * the balance is the sum of an append-only ledger, spending happens inside one locked transaction,
 * and no client can insert a row into either table. This file is the typed way to ask.
 *
 * Nothing here grants credits. Granting is service-role only, because the caller of that function
 * decides how many credits exist — Stripe will call it from a webhook (#14).
 */
import { supabaseBrowser } from "@/lib/supabase/client";

/** How a sheet came to be open. Only `credit` moved the ledger. */
export type UnlockVia = "credit" | "pass" | "pro";

export interface SpendResult {
  unlocked: boolean;
  /** True when the sheet was already open — this call charged nothing. */
  already?: boolean;
  via?: UnlockVia;
  balance?: number;
  /** `no_credits` is the one a student sees; the rest mean a bug or a forged request. */
  error?: "not_signed_in" | "no_such_sheet" | "not_your_sheet" | "no_credits";
}

/** Credits in hand. 0 for a signed-out student, and for anyone who has not bought any. */
export async function creditBalance(): Promise<number> {
  const { data, error } = await supabaseBrowser().rpc("credit_balance");
  if (error) return 0;
  return typeof data === "number" ? data : 0;
}

/** Is this one open? Cheap enough to ask on every results load; the row is tiny and indexed. */
export async function sheetUnlock(sheetId: string): Promise<UnlockVia | null> {
  const { data } = await supabaseBrowser()
    .from("sheet_unlocks")
    .select("via")
    .eq("sheet_id", sheetId)
    .maybeSingle();
  return (data?.via as UnlockVia | undefined) ?? null;
}

/**
 * Spend a credit on this sheet.
 *
 * Safe to call twice: the second call reports `already` and charges nothing, so a double-click, a
 * retried fetch and two open tabs all cost one credit. A Pro account or a live Sprint Pass unlocks
 * without touching the balance.
 */
export async function unlockSheet(sheetId: string): Promise<SpendResult> {
  const { data, error } = await supabaseBrowser().rpc("spend_credit_for_sheet", { p_sheet: sheetId });
  if (error) return { unlocked: false, error: "not_signed_in" };
  return (data ?? { unlocked: false }) as SpendResult;
}
