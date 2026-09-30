/**
 * NoteBlock — the student's own words on the sheet (#20).
 *
 * The thing that fits none of the item shapes: a mnemonic, what the professor said out loud, the
 * step they always get wrong. It renders as its own block rather than impersonating a definition,
 * because a note is not a claim we checked and should not wear the shape of one.
 *
 * Marked `you` like every other line of theirs, and pinned — the fitter never trims it.
 */
import type { SheetNote } from "@/contract/sheet-content";
import { Citation } from "@/components/trust";
import { editKey } from "./modules";

export function NoteBlock({ note }: { note: SheetNote }) {
  return (
    // Editable in place like any other line — by its own id, which is stable across edits, so a
    // note the student rewrites twice is still the same note to version history.
    <div className="note-block" data-edit-key={editKey(note, "notes")}>
      <span className="note-text">{note.text}</span> <Citation src="you" mine />
    </div>
  );
}
