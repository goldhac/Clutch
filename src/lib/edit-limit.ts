/**
 * edit-limit.ts — how many content edits one student may ask for (issue #14).
 *
 * /api/edit is the most abusable endpoint in the app: every call is a model call. Display
 * changes never reach it (the chat routes them locally), so a limit here only ever touches
 * real content edits. Generous for studying, tight for a script.
 */
export const EDIT_LIMITS = { perHour: 20, perDay: 60 } as const;

export interface LimitVerdict {
  ok: boolean;
  /** Seconds until the student may try again (for Retry-After). */
  retryAfterS?: number;
  message?: string;
}

/**
 * @param lastHour  timestamps (ms) of counted requests in the last hour
 * @param lastDay   count of requests in the last 24 hours
 */
export function judgeEditLimit(lastHour: number[], lastDay: number, now = Date.now()): LimitVerdict {
  if (lastDay >= EDIT_LIMITS.perDay) {
    return {
      ok: false,
      retryAfterS: 3600,
      message: `That's ${EDIT_LIMITS.perDay} content edits in a day, which is the limit. Showing, hiding and reordering are still free and instant; content edits come back tomorrow.`,
    };
  }
  if (lastHour.length >= EDIT_LIMITS.perHour) {
    // The oldest request in the window decides when a slot frees up.
    const oldest = Math.min(...lastHour);
    const retryAfterS = Math.max(60, Math.ceil((oldest + 3_600_000 - now) / 1000));
    const mins = Math.ceil(retryAfterS / 60);
    return {
      ok: false,
      retryAfterS,
      message: `That's ${EDIT_LIMITS.perHour} content edits in an hour, which is the limit. Showing, hiding and reordering are still free and instant; content edits are back in about ${mins} minute${mins === 1 ? "" : "s"}.`,
    };
  }
  return { ok: true };
}

/** Local/dev fallback when there is no signed-in user to count against: per-process, by key. */
const memory = new Map<string, number[]>();
export function judgeInMemory(key: string, now = Date.now()): LimitVerdict {
  const day = (memory.get(key) ?? []).filter((t) => now - t < 86_400_000);
  const verdict = judgeEditLimit(day.filter((t) => now - t < 3_600_000), day.length, now);
  if (verdict.ok) day.push(now);
  memory.set(key, day);
  return verdict;
}
