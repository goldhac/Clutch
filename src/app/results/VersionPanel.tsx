"use client";

/**
 * VersionPanel — what the sheet used to be (editing-flow handoff §7).
 *
 * Exists for one reason: a student's own lines cannot be regenerated. Everything else on the sheet
 * can be rebuilt from the same pack, so losing it costs a wait; losing what they typed at 2am costs
 * the thing itself.
 *
 * The tray is reachable whether or not the sheet is saved, which is the fix for the audit's "version
 * history is invisible until a sheet is saved, with no explanation of why". The behaviour was
 * correct and the silence was not: an unsaved sheet has nowhere to keep versions, so the tray says
 * that and offers the one button that changes it.
 *
 * The list leads with where the student is now, so restoring reads as moving along a line they can
 * see both ends of rather than as leaving the present.
 */
import { Tray } from "@/components/ui";
import { ago, type SheetVersion } from "@/lib/sheet-versions";

export interface VersionPanelProps {
  versions: SheetVersion[];
  loading: boolean;
  /** False before the sheet reaches the library — there is nowhere to keep versions yet. */
  saved: boolean;
  saving?: boolean;
  onSaveToLibrary: () => void;
  onRestore: (v: SheetVersion) => void;
  onClose: () => void;
}

export function VersionPanel({
  versions,
  loading,
  saved,
  saving,
  onSaveToLibrary,
  onRestore,
  onClose,
}: VersionPanelProps) {
  return (
    <Tray
      title="Earlier versions"
      count={saved && versions.length > 0 ? `${versions.length} save${versions.length === 1 ? "" : "s"}` : undefined}
      description={
        saved
          ? "Every change saves. Restoring is a change too, so you can always come back."
          : undefined
      }
      width={380}
      onClose={onClose}
      footer={saved ? "last 20 saves · your lines are kept in every one" : "dock reads: ● Not saved"}
    >
      {!saved ? (
        <div className="flex flex-col items-start gap-2.5 px-[10px] pb-2 pt-1">
          <p className="text-[12.5px] leading-[1.5] text-[var(--on-band-muted)]">
            This sheet isn&rsquo;t in your library yet, so there&rsquo;s nowhere to keep versions. Save
            it and every change after that is kept.
          </p>
          <p className="font-mono text-[11px] text-[#6b6b76]">
            Until then, undo still works for this session.
          </p>
          <button
            type="button"
            disabled={saving}
            onClick={onSaveToLibrary}
            className="ctl ctl-primary tap inline-flex h-8 items-center rounded-[8px] px-3 text-[12px] font-semibold"
          >
            {saving ? "Saving…" : "Save to library"}
          </button>
        </div>
      ) : loading ? (
        <p className="px-[10px] py-2 font-mono text-[11.5px] text-[var(--on-band-muted)]">loading&hellip;</p>
      ) : (
        <>
          {/* Where they are now, as a row rather than a heading: restoring is a move along this
              list, and a list whose present is missing reads like leaving rather than moving. */}
          <div className="flex h-10 items-center gap-2.5 rounded-[10px] bg-[rgba(92,201,141,.08)] px-2.5">
            <span aria-hidden className="h-[7px] w-[7px] shrink-0 rounded-full bg-[#5cc98d]" />
            <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--on-band)]">On the sheet now</span>
            <span className="shrink-0 font-mono text-[10.5px] text-[#5cc98d]">current</span>
          </div>

          {versions.length === 0 ? (
            <p className="px-[10px] py-2 text-[12.5px] leading-[1.5] text-[var(--on-band-muted)]">
              Nothing earlier yet. The first save lands here as soon as you change something.
            </p>
          ) : (
            versions.map((v) => (
              <div
                key={v.id}
                className="flex h-10 items-center gap-2.5 rounded-[10px] px-2.5 transition-colors duration-[140ms] hover:bg-white/[0.05]"
              >
                <span aria-hidden className="h-[7px] w-[7px] shrink-0 rounded-full border-[1.3px] border-[#6b6b76]" />
                <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--on-band)]">{v.label ?? "edited"}</span>
                <span className="shrink-0 font-mono text-[11px] text-[var(--on-band-muted)]">{ago(v.createdAt)}</span>
                <button
                  type="button"
                  onClick={() => onRestore(v)}
                  className="ctl ctl-neutral tap inline-flex h-[26px] w-14 shrink-0 items-center justify-center rounded-[7px] text-[11.5px] font-semibold"
                >
                  Restore
                </button>
              </div>
            ))
          )}
        </>
      )}
    </Tray>
  );
}
