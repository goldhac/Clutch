"use client";

import { useState, type DragEvent } from "react";

/**
 * FileDrop — click or drag-drop zone. Dashed border that turns signal
 * on drag-over, upload glyph in a rounded tile, primary + sub copy.
 * Uncontrolled: hands the caller a FileList via onFiles.
 */
export interface FileDropProps {
  onFiles: (files: FileList) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  title?: string;
  hint?: string;
}

export function FileDrop({
  onFiles,
  accept,
  multiple = true,
  disabled = false,
  title = "Drop your files",
  hint = "Drag files here, or browse · PDF, TXT, MD up to 40 MB each",
}: FileDropProps) {
  const [over, setOver] = useState(false);

  function handleDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setOver(false);
    if (disabled) return;
    if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files);
  }

  return (
    <label
      htmlFor="file-drop-input"
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
      className={[
        "flex cursor-pointer flex-col items-center justify-center gap-3",
        "rounded-[var(--r-lg)] border-2 border-dashed px-6 py-10 text-center",
        "transition-colors duration-[var(--dur-fast)]",
        over
          ? "border-[var(--signal-500)] bg-[var(--signal-50)]"
          : "border-[var(--ink-200)] bg-[var(--ink-50)] hover:border-[var(--ink-300)] hover:bg-[var(--ink-100)]",
        disabled ? "cursor-not-allowed opacity-50" : "",
      ].join(" ")}
    >
      <input
        id="file-drop-input"
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="hidden"
        onChange={(e) => e.target.files && onFiles(e.target.files)}
      />
      <span
        className={`flex h-11 w-11 items-center justify-center rounded-[var(--r-md)] transition-colors ${
          over ? "bg-[var(--signal-100)] text-[var(--signal-600)]" : "bg-white text-[var(--ink-500)] shadow-[var(--sh-xs)]"
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <path d="M12 3v13M7 8l5-5 5 5" />
        </svg>
      </span>
      <div>
        <div className="font-serif text-[19px] text-[var(--ink-900)]">{title}</div>
        <div className="mt-1 text-[13px] text-[var(--ink-500)]">{hint}</div>
      </div>
    </label>
  );
}
