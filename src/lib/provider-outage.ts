/**
 * provider-outage.ts — tell "the AI provider is refusing us" apart from "something broke".
 *
 * On 2026-09-17 the Gemini project hit its monthly spending cap mid-afternoon. Every request
 * got a 429 from Google and the app answered "something went wrong, please try again" — which
 * cannot work, and sends a student into a retry loop the night before an exam. A capacity
 * failure gets its own status (503), its own words, and an [ALERT] line that is easy to find
 * (and to wire to a pager later).
 */
const CAPACITY = /spending cap|exceeded its monthly|quota|RESOURCE_EXHAUSTED|\b429\b|Too Many Requests|billing/i;

export function isProviderCapacityError(err: unknown): boolean {
  const text = err instanceof Error ? `${err.message} ${String((err as { cause?: unknown }).cause ?? "")}` : String(err);
  return CAPACITY.test(text);
}

export function capacityResponse(route: string, err: unknown): Response {
  const detail = err instanceof Error ? err.message : String(err);
  console.error(`[ALERT] ${route}: AI provider is refusing requests (spend cap / quota). Every generation is failing. ${detail.slice(0, 300)}`);
  return new Response(
    "Clutch can't build sheets right now. The problem is on our side, not with your files, and trying again won't help yet. " +
      "Nothing was saved and no credit was used. Please come back in a little while.",
    { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "1800" } },
  );
}
