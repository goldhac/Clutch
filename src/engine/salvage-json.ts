/**
 * salvage-json.ts — keep the sheet that arrived when the model was cut off (#10).
 *
 * A sheet is one large JSON object. When the model hits its output ceiling the response stops
 * mid-token — mid-string, mid-item, anywhere — and `JSON.parse` rejects the whole thing. The
 * student waited ~185 s for a pack that was read correctly, ranked correctly, and written correctly
 * right up to the character where it stopped, and got nothing.
 *
 * That is the same failure the engine already refuses to accept elsewhere: an item that breaks a
 * rule is dropped, never loosened, so the sheet still ships. This applies that rule to truncation.
 * We do NOT invent the missing part or relax the contract — we cut back to the last COMPLETE
 * element, close the structures that were left open, and hand the result to the same validator as
 * always. Anything salvaged has to pass every rule a normal sheet passes.
 *
 * What this deliberately does not do: repair malformed JSON. A model writing genuinely broken
 * output is a different problem with a different answer (retry), and quietly "fixing" it would hide
 * a real defect. This only ever truncates and closes.
 */

/** Where a scan is when it stops: inside a string, escaped, or in open containers. */
interface ScanState {
  /** Depth stack of the containers we are inside, outermost first. */
  stack: ("{" | "[")[];
  inString: boolean;
  escaped: boolean;
  /** Index just past the last container that CLOSED — the end of the last whole element. */
  lastCompleteEnd: number;
  /** Stack depth immediately after that close. */
  lastCompleteDepth: number;
}

/**
 * Walk the text once, tracking JSON structure, and remember the last position at which a container
 * CLOSED. That — not the last comma — is the furthest point we can cut back to and still have only
 * whole elements.
 *
 * Cutting at a comma was the first attempt and it was wrong: a comma inside an object means one of
 * that object's FIELDS ended, so closing there produces a half-filled item — `{"topic":"t2"}` with
 * no question and no answer. It parses, which is exactly what makes it dangerous; the contract
 * would then drop it as invalid and the salvage would look lossier than it is. A closed container
 * is the only boundary that guarantees the element itself is finished.
 */
function scan(text: string): ScanState {
  const st: ScanState = { stack: [], inString: false, escaped: false, lastCompleteEnd: -1, lastCompleteDepth: 0 };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (st.escaped) { st.escaped = false; continue; }
    if (ch === "\\" && st.inString) { st.escaped = true; continue; }
    if (ch === '"') { st.inString = !st.inString; continue; }
    if (st.inString) continue;

    if (ch === "{" || ch === "[") {
      st.stack.push(ch);
    } else if (ch === "}" || ch === "]") {
      st.stack.pop();
      // A whole element just finished. This is the only safe place to cut.
      st.lastCompleteEnd = i + 1;
      st.lastCompleteDepth = st.stack.length;
    }
  }
  return st;
}

export interface SalvageResult {
  /** JSON text that parses, or null when nothing whole could be recovered. */
  text: string | null;
  /** How many characters were discarded — the size of the incomplete tail. */
  discarded: number;
}

/**
 * Cut a truncated JSON document back to its last complete element and close it.
 *
 * Returns `text: null` when the input is not merely truncated — already valid, or broken in a way
 * truncation cannot explain (nothing complete to keep, or brackets that never opened).
 */
export function salvageTruncatedJson(raw: string): SalvageResult {
  const text = raw.trim();
  if (!text) return { text: null, discarded: 0 };

  // Already valid: nothing to salvage, and we must not touch it.
  try {
    JSON.parse(text);
    return { text: null, discarded: 0 };
  } catch {
    // expected — carry on
  }

  const st = scan(text);
  // Balanced or over-closed brackets mean this is not a truncation.
  if (!st.stack.length) return { text: null, discarded: 0 };
  if (st.lastCompleteEnd < 0) return { text: null, discarded: 0 };

  // Cut back to the last complete element, then close every container still open there.
  const head = text.slice(0, st.lastCompleteEnd);
  const openAtCut = st.lastCompleteDepth;
  // The scan's stack is the state at the END of the text; the containers open at the cut point are
  // its first `openAtCut` entries, closed innermost-first.
  const closers = st.stack
    .slice(0, openAtCut)
    .reverse()
    .map((b) => (b === "{" ? "}" : "]"))
    .join("");

  const candidate = `${head}${closers}`;
  try {
    JSON.parse(candidate);
    return { text: candidate, discarded: raw.length - candidate.length };
  } catch {
    return { text: null, discarded: 0 };
  }
}

/** Did the provider say it ran out of room? Tolerant of provider wording. */
export const wasTruncated = (finishReason?: string): boolean =>
  !!finishReason && /max.?tokens|length/i.test(finishReason);
