/**
 * provider-outage.ts — tell "the AI provider is refusing us" apart from "something broke".
 *
 * On 2026-09-17 the Gemini project hit its monthly spending cap mid-afternoon. Every request
 * got a 429 from Google and the app answered "something went wrong, please try again" — which
 * cannot work, and sends a student into a retry loop the night before an exam. A capacity
 * failure gets its own status (503), its own words, and an [ALERT] line that is easy to find
 * (and to wire to a pager later).
 */
/**
 * `402` and "prepayment credits are depleted" were added on 2026-09-24: a live episode died at the
 * voicing stage and the logs said only "couldn't reach the voice service", which reads as a
 * transient outage. It was not transient — the prepaid balance was empty, and nothing would have
 * worked until someone topped it up. A wall we cannot retry past must not be described as weather.
 */
const CAPACITY = /spending cap|exceeded its monthly|quota|RESOURCE_EXHAUSTED|\b429\b|\b402\b|Too Many Requests|prepayment credits|credits are depleted|billing/i;

/**
 * The provider is up but overloaded — `503 This model is currently experiencing high demand`.
 *
 * Distinct from a capacity WALL on purpose. A spend cap means come back tomorrow; a spike means
 * come back in five minutes, and telling a student the wrong one of those is the difference
 * between a short wait and giving up on the product. Seen in production 2026-09-29, where it
 * surfaced as a generic 500 blaming us.
 */
const BUSY = /\b503\b|UNAVAILABLE|high demand|overloaded|Service Unavailable/i;

export function isProviderBusyError(err: unknown): boolean {
  const text = err instanceof Error ? `${err.message} ${String((err as { cause?: unknown }).cause ?? "")}` : String(err);
  // A wall that happens to mention 503 is still a wall.
  return !isProviderCapacityError(err) && BUSY.test(text);
}

/** 503 + Retry-After, and wording that says the true thing: wait a few minutes, not a day. */
export function busyResponse(route: string, err: unknown, what = "sheets"): Response {
  const detail = err instanceof Error ? err.message : String(err);
  console.warn(`[${route}] provider busy (transient): ${detail.slice(0, 200)}`);
  return new Response(
    `Our AI provider is busy right now, so we couldn't finish building your ${what.replace(/s$/, "")}. ` +
      `This one usually clears in a few minutes — your files are still here, so please try again shortly. ` +
      `Nothing was saved and no credit was used.`,
    { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "300" } },
  );
}

export function isProviderCapacityError(err: unknown): boolean {
  const text = err instanceof Error ? `${err.message} ${String((err as { cause?: unknown }).cause ?? "")}` : String(err);
  return CAPACITY.test(text);
}

export function capacityResponse(route: string, err: unknown, what = "sheets"): Response {
  const detail = err instanceof Error ? err.message : String(err);
  console.error(`[ALERT] ${route}: AI provider is refusing requests (spend cap / quota). Every generation is failing. ${detail.slice(0, 300)}`);
  return new Response(
    `Clutch can't build ${what} right now. The problem is on our side, not with your files, and trying again won't help yet. ` +
      "Nothing was saved and no credit was used. Please come back in a little while.",
    { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "1800" } },
  );
}
