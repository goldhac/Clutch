"use client";

/**
 * VersionPanel — what the sheet used to be (#20).
 *
 * Exists for one reason: a student's own lines cannot be regenerated. Everything else on the sheet
 * can be rebuilt from the same pack, so losing it costs a wait; losing what they typed at 2am costs
 * the thing itself.
 *
 * Plain on purpose; the visual pass is Gold's.
 */
import { ago, type SheetVersion } from "@/lib/sheet-versions";

export interface VersionPanelProps {
  versions: SheetVersion[];
  loading: boolean;
  onRestore: (v: SheetVersion) => void;
  onClose: () => void;
}

export function VersionPanel({ versions, loading, onRestore, onClose }: VersionPanelProps) {
  return (
    <div className="tray pointer-events-auto w-full max-w-[720px] animate-[cl-rise_220ms_var(--ease-pop)] rounded-[14px] bg-[var(--band-2)] p-4 shadow-[0_20px_50px_rgba(17,17,20,.4)]">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-white">
          Earlier versions
          {versions.length > 0 && (
            <span className="ml-2 font-mono text-[11px] font-normal text-[var(--on-band-muted)]">
              {versions.length}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="font-mono text-[11px] text-[var(--on-band-muted)] hover:text-[var(--on-band)]"
        >
          close
        </button>
      </div>
      <p className="mt-1 text-[12px] leading-[1.5] text-[var(--on-band-muted)]">
        The last 20 saves of this sheet. Restoring is itself a change, so you can always come back.
      </p>

      {loading ? (
        <p className="mt-3 font-mono text-[11.5px] text-[var(--on-band-muted)]">loading…</p>
      ) : versions.length === 0 ? (
        <p className="mt-3 text-[12.5px] leading-[1.5] text-[var(--on-band-muted)]">
          Nothing yet. Versions start once you change something &mdash; save this sheet to your
          library first, so there is somewhere to keep them.
        </p>
      ) : (
        <ul className="mt-3 flex max-h-[42vh] flex-col gap-1.5 overflow-y-auto pr-1">
          {versions.map((v) => (
            <li key={v.id} className="flex items-center gap-3 rounded-[10px] bg-white/[0.04] px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-[13px] text-white">{v.label ?? "edited"}</span>
              <span className="shrink-0 font-mono text-[11px] text-[var(--on-band-muted)]">{ago(v.createdAt)}</span>
              <button
                type="button"
                onClick={() => onRestore(v)}
                className="tap shrink-0 rounded-[7px] bg-white/10 px-2.5 py-1 text-[11.5px] font-semibold text-white hover:bg-white/20"
              >
                restore
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
