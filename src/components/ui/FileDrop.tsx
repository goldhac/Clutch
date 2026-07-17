"use client";

import { useRef, useState, type DragEvent } from "react";

/**
 * FileDrop — click or drag-and-drop area for picking files.
 *
 * Uncontrolled: hands the caller a plain FileList via `onFiles`.
 * Parent decides how to render the resulting list.
 */
export interface FileDropProps {
  onFiles: (files: FileList) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  hint?: string;
}

export function FileDrop({
  onFiles,
  accept,
  multiple = true,
  disabled = false,
  hint = "Click to add PDFs · or drag & drop",
}: FileDropProps) {
  const inputRef = useRef<HTMLInputElement>(null);
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
        "flex h-32 cursor-pointer items-center justify-center rounded",
        "border-2 border-dashed text-sm transition-colors",
        over
          ? "border-[color:var(--color-primary-indigo)] bg-indigo-50 text-[color:var(--color-primary-indigo)]"
          : "border-neutral-300 bg-neutral-50 text-neutral-600 hover:bg-neutral-100",
        disabled ? "cursor-not-allowed opacity-50" : "",
      ].join(" ")}
    >
      <input
        ref={inputRef}
        id="file-drop-input"
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="hidden"
        onChange={(e) => e.target.files && onFiles(e.target.files)}
      />
      <span className="font-medium">{hint}</span>
    </label>
  );
}
