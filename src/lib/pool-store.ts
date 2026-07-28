/**
 * pool-store.ts — a tiny in-process handoff for the PDF pipeline (R4).
 *
 * The /api/pdf route renders by driving Playwright to a real page URL, but
 * the user's pool lives in their browser (sessionStorage) — Playwright
 * can't see it. So the POST handler stashes the pool here under a
 * short-lived token, then navigates Playwright to /print?token=… which
 * reads it back out of THIS map. Same Node process (Railway single
 * container / dev server), so a module-level Map is enough — no DB, no
 * disk. Tokens self-expire so a crashed render can't leak memory.
 *
 * This is deliberately not a durable store: a pool only needs to survive
 * the few seconds between POST and the Playwright navigation.
 */
import type { SheetContent } from "@/contract/sheet-content";
import type { ScoreCtx } from "@/components/sheet/relevance";

export interface StoredPool {
  content: SheetContent;
  ctx?: ScoreCtx;
  expiresAt: number;
}

const TTL_MS = 60_000; // a render finishes in a few seconds; 60s is slack.
const store = new Map<string, StoredPool>();

function sweep(now: number) {
  for (const [token, v] of store) if (v.expiresAt <= now) store.delete(token);
}

export function putPool(content: SheetContent, ctx?: ScoreCtx): string {
  const now = Date.now();
  sweep(now);
  const token = globalThis.crypto?.randomUUID?.() ?? `t${now}-${store.size}`;
  store.set(token, { content, ctx, expiresAt: now + TTL_MS });
  return token;
}

export function takePool(token: string): StoredPool | null {
  const now = Date.now();
  sweep(now);
  const v = store.get(token);
  if (!v || v.expiresAt <= now) return null;
  return v;
}

/** Drop a token once its render is done (POST handler cleanup). */
export function dropPool(token: string): void {
  store.delete(token);
}
