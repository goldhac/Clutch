import type { Trap } from "@/contract/sheet-content";
import { Citation, InlineText } from "@/components/trust";

/**
 * TrapCallout — the named-falsity pattern (OutSpec §4 pattern 5).
 * The ⚠ TRAP prefix is added by semantics.css ::before; this
 * component owns the layout (text + trailing citation).
 */
export interface TrapCalloutProps {
  trap: Trap;
}

export function TrapCallout({ trap }: TrapCalloutProps) {
  return (
    <div className="trap-callout no-break">
      <InlineText text={trap.text} /> <Citation src={trap.src} />
    </div>
  );
}

/** Batched — the whole Traps section with h2. */
export function TrapsSection({ traps }: { traps: Trap[] }) {
  if (traps.length === 0) return null;
  return (
    <section className="traps no-break">
      <h2>Traps</h2>
      {traps.map((t, i) => (
        <TrapCallout key={i} trap={t} />
      ))}
    </section>
  );
}
