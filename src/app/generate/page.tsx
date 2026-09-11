"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { AppChrome } from "@/components/ui";
import type { Density } from "@/components/sheet";
import { GeneratingOverlay } from "./GeneratingOverlay";

/**
 * /generate — v2 handoff: build the pack, tag each file, see how strong
 * the pack is, spend one credit. File LEDGER (hairline table), stacked
 * per-file confidence bar, conditional salmon nudge, teaching empty
 * state, ink generating overlay with Cancel.
 */

type FileTag = "slides" | "review" | "past_exam" | "homework" | "notes" | "formula_sheet";

const TAG_WEIGHTS: Record<FileTag, number> = {
  past_exam: 30,
  review: 22,
  homework: 18,
  slides: 14,
  notes: 10,
  formula_sheet: 6,
};

/** authority-bar + segment tone per tag (the ranking contract, surfaced) */
const TAG_TONE: Record<FileTag, string> = {
  past_exam: "var(--conf-high)",
  review: "var(--signal-500)",
  homework: "var(--signal-500)",
  slides: "var(--signal-300)",
  notes: "var(--ink-300)",
  formula_sheet: "var(--ink-300)",
};

interface PendingFile {
  file: File;
  tag: FileTag;
}

function guessTag(name: string): FileTag {
  const n = name.toLowerCase();
  if (/exam|midterm|final|quiz/.test(n)) return "past_exam";
  if (/review/.test(n)) return "review";
  if (/\bhw\d?\b|homework/.test(n)) return "homework";
  if (/note/.test(n)) return "notes";
  if (/formula[-_ ]?sheet|formula/.test(n)) return "formula_sheet";
  return "slides";
}

function fileKind(name: string): string {
  const ext = name.split(".").pop()?.toUpperCase() ?? "FILE";
  return ext.length > 4 ? "FILE" : ext;
}

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function GeneratePage() {
  const router = useRouter();
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [examType, setExamType] = useState<"conceptual" | "problem-solving" | "mixed">("mixed");
  const [density, setDensity] = useState<Density>("max");
  const [priority, setPriority] = useState<"formulas" | "concepts" | "balanced">("balanced");
  const [courseCode, setCourseCode] = useState("");
  const [professor, setProfessor] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const n = files.length;
  const hasFiles = n > 0;
  const exams = files.filter((f) => f.tag === "past_exam").length;
  const total = files.reduce((s, f) => s + TAG_WEIGHTS[f.tag], 0);
  const conf = Math.min(100, total);
  const confColor =
    conf >= 80 ? "var(--conf-high)" : conf >= 50 ? "var(--conf-med)" : "var(--conf-low)";

  function addFiles(list: FileList | File[]) {
    const next: PendingFile[] = [];
    for (const f of Array.from(list)) next.push({ file: f, tag: guessTag(f.name) });
    setFiles((prev) => [...prev, ...next]);
    setDragging(false);
  }
  function updateTag(ix: number, tag: FileTag) {
    setFiles((prev) => prev.map((f, i) => (i === ix ? { ...f, tag } : f)));
  }
  function removeFile(ix: number) {
    setFiles((prev) => prev.filter((_, i) => i !== ix));
  }

  function cancelGeneration() {
    abortRef.current?.abort();
    abortRef.current = null;
    setSubmitting(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!hasFiles) return setError("Drop at least one file before generating.");

    setSubmitting(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const fd = new FormData();
      files.forEach((f, ix) => {
        fd.append(`file_${ix}`, f.file);
        fd.append(`tag_${ix}`, f.tag);
      });
      fd.append("examType", examType);
      fd.append("density", density);
      fd.append("priority", priority);
      if (courseCode) fd.append("courseCode", courseCode);
      if (professor) fd.append("professor", professor);

      const res = await fetch("/api/generate", { method: "POST", body: fd, signal: ctrl.signal });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      const payload = (await res.json()) as { content: unknown; meta: unknown; warnings?: string[] };
      sessionStorage.setItem(
        "clutch:last",
        JSON.stringify({
          content: payload.content,
          meta: payload.meta,
          warnings: payload.warnings ?? [],
          density,
          // Scoring context for Layer A (relevance.ts): file tags drive
          // source-authority, examType/priority drive the multipliers.
          ctx: {
            files: files.map((f) => ({ name: f.file.name, tag: f.tag })),
            examType,
            priority,
          },
          savedAt: new Date().toISOString(),
        }),
      );
      router.push("/results");
    } catch (e) {
      if ((e as Error).name === "AbortError") return; // user cancelled — form state intact
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  const nudge =
    exams === 0
      ? "No past exam in the pack. Without one, nothing on your sheet can be marked exam-verified — every line will carry a score, but none will carry the star."
      : exams === 1
        ? "One past exam in the pack. A second one is the single biggest lift available: it pushes confidence to 100% and roughly doubles how many lines can earn the star."
        : `${exams} past exams in the pack. That is enough to verify claims against what this professor actually asks.`;

  return (
    <AppChrome active="generate" credits={2} avatar="AD">
      {submitting && (
        <GeneratingOverlay fileCount={n} pastExamCount={exams} onCancel={cancelGeneration} />
      )}
      <form onSubmit={onSubmit} className="mx-auto max-w-[1180px] px-6 pb-24 pt-11 sm:px-8">
        {/* ── page head ─────────────────────────────────────────────── */}
        <header className="flex flex-col justify-between gap-4 border-b border-[var(--ink-900)] pb-5 sm:flex-row sm:items-end sm:gap-10">
          <div>
            <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-500)]">
              Step 1 of 2 · build the pack
            </div>
            <h1 className="mt-3.5 font-serif text-[clamp(2rem,4.5vw,2.875rem)] leading-[1.04] tracking-[-0.03em] text-[var(--ink-900)]">
              {hasFiles ? `${n} file${n === 1 ? "" : "s"} ready` : "Make a sheet"}
            </h1>
          </div>
          <p className="max-w-[34ch] text-[14px] leading-[1.6] text-[var(--ink-600)]" style={{ textWrap: "pretty" }}>
            {hasFiles
              ? "Tag each file so it gets weighted correctly. Past exams carry the most, and they are the only thing that can earn a line the star."
              : "One printable page, ranked by what is most likely to be tested. Drop the pack and we will read all of it."}
          </p>
        </header>

        <div className="mt-9 grid items-start gap-11 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* ── left: the pack ──────────────────────────────────────── */}
          <section>
            {/* drop zone */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (!dragging) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
                else setDragging(false);
              }}
              className={
                "block cursor-pointer rounded-[14px] border-2 border-dashed px-6 py-[26px] transition-[background-color,border-color] duration-[160ms] " +
                (dragging
                  ? "border-[var(--signal-500)] bg-[var(--signal-100)]"
                  : "border-[var(--border-input)] bg-[var(--surface)] hover:border-[var(--ink-300)]")
              }
            >
              <div className="flex items-center gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-[var(--band)]">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 16V4" />
                    <path d="m7 9 5-5 5 5" />
                    <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
                  </svg>
                </span>
                <div className="min-w-0">
                  <div className="text-[16px] font-semibold tracking-[-0.01em] text-[var(--ink-900)]">
                    Drop your course files
                  </div>
                  <div className="mt-0.5 text-[14px] leading-[1.5] text-[var(--ink-600)]">
                    PDF, PPTX, TXT or MD · up to 40 files · past exams count most
                  </div>
                </div>
                <span className="ml-auto hidden h-[38px] shrink-0 items-center rounded-[var(--r-md)] border border-[var(--border-input)] bg-white px-4 text-[14px] font-semibold text-[var(--ink-900)] sm:inline-flex">
                  Browse
                </span>
              </div>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept=".pdf,.pptx,.txt,.md"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>

            {hasFiles ? (
              <>
                {/* file ledger */}
                <div className="mt-8">
                  <div className="grid grid-cols-[minmax(0,1fr)_112px_34px] gap-3 border-b border-[var(--ink-900)] pb-[9px] font-mono text-[10px] font-semibold uppercase tracking-[0.09em] text-[var(--ink-500)] sm:grid-cols-[minmax(0,1fr)_132px_96px_34px] sm:gap-4">
                    <span>File</span>
                    <span>Tagged as</span>
                    <span className="hidden sm:block">Authority</span>
                    <span />
                  </div>
                  {files.map((f, ix) => {
                    const isExam = f.tag === "past_exam";
                    return (
                      <div
                        key={`${f.file.name}-${ix}`}
                        className="grid grid-cols-[minmax(0,1fr)_112px_34px] items-center gap-3 border-b border-[var(--ink-150)] py-[15px] sm:grid-cols-[minmax(0,1fr)_132px_96px_34px] sm:gap-4"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--r-md)] bg-[var(--field)] font-mono text-[10px] font-semibold text-[var(--ink-500)]">
                            {fileKind(f.file.name)}
                          </span>
                          <span className="min-w-0">
                            <span
                              className="block truncate text-[14px] font-medium text-[var(--ink-900)]"
                              title={f.file.name}
                            >
                              {f.file.name}
                            </span>
                            <span className="mt-0.5 block font-mono text-[11px] text-[var(--ink-500)]">
                              {fmtSize(f.file.size)}
                            </span>
                          </span>
                        </div>

                        <span className="relative block">
                          <select
                            value={f.tag}
                            onChange={(e) => updateTag(ix, e.target.value as FileTag)}
                            className="h-8 w-full cursor-pointer appearance-none rounded-[var(--r-md)] border border-[var(--ink-150)] pl-2.5 pr-6 text-[12.5px] font-semibold outline-none transition-colors duration-[160ms] focus:border-[var(--signal-500)]"
                            style={{
                              background: isExam ? "var(--conf-high-bg2)" : "#fff",
                              color: isExam ? "var(--conf-high)" : "var(--ink-900)",
                            }}
                          >
                            <option value="past_exam">★ Past exam</option>
                            <option value="review">Review guide</option>
                            <option value="homework">Homework</option>
                            <option value="slides">Slides</option>
                            <option value="notes">Notes</option>
                            <option value="formula_sheet">Formula sheet</option>
                          </select>
                          <span aria-hidden className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-[var(--ink-400)]">
                            ▼
                          </span>
                        </span>

                        <span className="hidden items-center gap-2 sm:flex">
                          <span className="relative h-1 flex-1 overflow-hidden rounded-[2px] bg-[var(--ink-150)]">
                            <span
                              className="absolute bottom-0 left-0 top-0 rounded-[2px] transition-[width,background-color] duration-200 ease-[var(--ease-out)]"
                              style={{
                                background: TAG_TONE[f.tag],
                                width: `${Math.round((TAG_WEIGHTS[f.tag] / 30) * 100)}%`,
                              }}
                            />
                          </span>
                          <span className="font-mono text-[11px] text-[var(--ink-600)]">
                            ×{TAG_WEIGHTS[f.tag]}
                          </span>
                        </span>

                        <button
                          type="button"
                          onClick={() => removeFile(ix)}
                          aria-label={`remove ${f.file.name}`}
                          className="h-7 w-7 justify-self-end rounded-[7px] text-[13px] text-[var(--ink-400)] transition-colors duration-[160ms] hover:bg-[var(--field)] hover:text-[var(--ink-900)]"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-between gap-6 pt-3.5 font-mono text-[11px] text-[var(--ink-500)]">
                    <span>
                      {n} {n === 1 ? "file" : "files"} · {exams}{" "}
                      {exams === 1 ? "past exam" : "past exams"} · authority total {total}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFiles([])}
                      className="text-[var(--signal-600)] hover:underline"
                    >
                      clear pack
                    </button>
                  </div>
                </div>

                {/* the nudge */}
                <div className="mt-7 flex gap-3 rounded-[10px] border border-[var(--salmon-line)] bg-[var(--salmon)] px-4 py-[15px]">
                  <span aria-hidden className="shrink-0 text-[var(--salmon-text)]">★</span>
                  <p className="text-[13.5px] leading-[1.6] text-[var(--ink-800)]" style={{ textWrap: "pretty" }}>
                    {nudge}
                  </p>
                </div>
              </>
            ) : (
              /* empty state — teach the weighting */
              <div className="mt-8 border-t border-[var(--ink-900)]">
                {(
                  [
                    [<span key="e">
                      <span className="text-[var(--verified)]">★</span> Past exams, midterms, quizzes
                    </span>, 30, "var(--conf-high)"],
                    ["Review guides and study outlines", 22, "var(--signal-500)"],
                    ["Lecture slides and decks", 14, "var(--signal-300)"],
                    ["Your own notes", 10, "var(--ink-300)"],
                  ] as const
                ).map(([label, w, tone], i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[minmax(0,1fr)_96px] items-center gap-5 border-b border-[var(--ink-150)] py-[15px]"
                  >
                    <span className="text-[14px] text-[var(--ink-600)]">{label}</span>
                    <span className="flex items-center gap-2">
                      <span className="relative h-1 flex-1 overflow-hidden rounded-[2px] bg-[var(--ink-150)]">
                        <span
                          className="absolute inset-y-0 left-0 rounded-[2px]"
                          style={{ background: tone, width: `${Math.round((w / 30) * 100)}%` }}
                        />
                      </span>
                      <span className="font-mono text-[11px] text-[var(--ink-600)]">×{w}</span>
                    </span>
                  </div>
                ))}
                <p className="mt-5 max-w-[52ch] text-[14px] leading-[1.65] text-[var(--ink-600)]" style={{ textWrap: "pretty" }}>
                  Everything gets read, but not everything counts the same. Past exams tell us what
                  this professor actually asks — that is what earns a line the star on your sheet.
                </p>
                <Link
                  href="/results?g=mis-final&tier=free"
                  className="tap group mt-5 inline-flex items-center gap-2 text-[14px] font-semibold text-[var(--ink-900)]"
                >
                  <span className="border-b border-[var(--ink-900)] pb-0.5">
                    See a sheet made from a sample pack
                  </span>
                  <span aria-hidden className="text-[var(--ink-400)] transition-transform duration-[160ms] group-hover:translate-x-1">→</span>
                </Link>
              </div>
            )}
          </section>

          {/* ── right: settings + confidence + CTA ──────────────────── */}
          <aside className="flex flex-col gap-[18px] lg:sticky lg:top-[88px]">
            <div className="rounded-[12px] border border-[var(--ink-150)] bg-[var(--surface)] px-5 pb-1.5 pt-5">
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.09em] text-[var(--ink-500)]">
                How to build it
              </div>

              <div className="mt-3.5">
                <div className="text-[12.5px] font-semibold text-[var(--ink-600)]">Exam type</div>
                <div className="mt-[7px] flex gap-1 rounded-[9px] bg-[var(--field)] p-[3px]">
                  {(
                    [
                      ["Conceptual", "conceptual"],
                      ["Problem-solving", "problem-solving"],
                      ["Mixed", "mixed"],
                    ] as const
                  ).map(([label, value]) => (
                    <SegPill
                      key={value}
                      label={label}
                      active={examType === value}
                      onClick={() => setExamType(value)}
                    />
                  ))}
                </div>
              </div>

              <div className="mt-[18px]">
                <div className="text-[12.5px] font-semibold text-[var(--ink-600)]">Density</div>
                {(
                  [
                    ["max", "MAX", "Fit everything that fits"],
                    ["balanced", "Balanced", "High-yield only, room to breathe"],
                    ["essentials", "Essentials", "Core definitions and formulas"],
                  ] as const
                ).map(([value, label, note]) => {
                  const on = density === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setDensity(value)}
                      className={
                        "mt-[7px] flex w-full items-center gap-[11px] rounded-[9px] border px-3 py-2.5 text-left transition-[border-color,background-color] duration-[160ms] " +
                        (on
                          ? "border-[var(--ink-900)] bg-[var(--paper)]"
                          : "border-[var(--ink-150)] bg-[var(--surface)] hover:border-[var(--ink-300)]")
                      }
                    >
                      <span
                        aria-hidden
                        className="box-border h-3.5 w-3.5 shrink-0 rounded-full bg-white transition-[border] duration-[160ms]"
                        style={{
                          border: on ? "4px solid var(--ink-900)" : "1.5px solid var(--ink-300)",
                        }}
                      />
                      <span className="min-w-0">
                        <span className="block text-[13.5px] font-semibold text-[var(--ink-900)]">
                          {label}
                        </span>
                        <span className="mt-px block text-[12px] text-[var(--ink-500)]">{note}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-[18px] border-t border-[var(--ink-150)] pt-4">
                <div className="text-[12.5px] font-semibold text-[var(--ink-600)]">Priority</div>
                <div className="mt-[7px] flex gap-1 rounded-[9px] bg-[var(--field)] p-[3px]">
                  {(
                    [
                      ["Balanced", "balanced"],
                      ["Formulas", "formulas"],
                      ["Concepts", "concepts"],
                    ] as const
                  ).map(([label, value]) => (
                    <SegPill
                      key={value}
                      label={label}
                      active={priority === value}
                      onClick={() => setPriority(value)}
                    />
                  ))}
                </div>
              </div>

              <div className="mt-[18px] grid grid-cols-2 gap-3 border-t border-[var(--ink-150)] py-4">
                <label className="block">
                  <span className="block text-[12.5px] font-semibold text-[var(--ink-600)]">
                    Course code
                  </span>
                  <input
                    type="text"
                    value={courseCode}
                    onChange={(e) => setCourseCode(e.target.value)}
                    placeholder="ITSS 3300"
                    className="tap mt-1.5 h-9 w-full rounded-[var(--r-md)] border border-[var(--border-input)] bg-[var(--surface)] px-2.5 text-[13px] text-[var(--ink-900)] outline-none transition-colors duration-[160ms] placeholder:text-[var(--ink-500)] focus:border-[var(--signal-500)] focus:ring-2 focus:ring-[var(--signal-100)]"
                  />
                </label>
                <label className="block">
                  <span className="block text-[12.5px] font-semibold text-[var(--ink-600)]">
                    Professor
                  </span>
                  <input
                    type="text"
                    value={professor}
                    onChange={(e) => setProfessor(e.target.value)}
                    placeholder="Ouyang"
                    className="tap mt-1.5 h-9 w-full rounded-[var(--r-md)] border border-[var(--border-input)] bg-[var(--surface)] px-2.5 text-[13px] text-[var(--ink-900)] outline-none transition-colors duration-[160ms] placeholder:text-[var(--ink-500)] focus:border-[var(--signal-500)] focus:ring-2 focus:ring-[var(--signal-100)]"
                  />
                </label>
              </div>
            </div>

            {/* confidence card */}
            <div className="rounded-[12px] border border-[var(--ink-150)] bg-[var(--surface)] p-5">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.09em] text-[var(--ink-500)]">
                  Confidence in result
                </span>
                <span
                  className="font-mono text-[20px] font-semibold"
                  style={{ color: hasFiles ? confColor : "var(--ink-300)" }}
                >
                  {hasFiles ? `${conf}%` : "—"}
                </span>
              </div>
              <div className="mt-3 flex h-2 gap-[2px] overflow-hidden rounded-[4px] bg-[var(--field)]">
                {files.map((f, i) => (
                  <span
                    key={i}
                    className="transition-[flex,background-color] duration-200 ease-[var(--ease-out)]"
                    style={{ flex: TAG_WEIGHTS[f.tag], background: TAG_TONE[f.tag] }}
                  />
                ))}
              </div>
              <p className="mt-3.5 text-[13px] leading-[1.6] text-[var(--ink-600)]" style={{ textWrap: "pretty" }}>
                {hasFiles
                  ? `Built from what you gave us, not from how the sheet looks. ${
                      conf >= 80
                        ? "This pack is strong enough to rank confidently."
                        : "Add a past exam or review guide to raise it."
                    }`
                  : "Drop files to see how strong the pack is before you spend a credit."}
              </p>
            </div>

            {/* CTA */}
            <div>
              {error && (
                <div role="alert" className="mb-3 rounded-[10px] border border-[var(--conf-low)]/25 bg-[var(--conf-low-bg)] px-4 py-3 text-[13px] leading-[1.55] text-[var(--conf-low-deep)]">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={!hasFiles}
                className={
                  "h-[52px] w-full rounded-[10px] text-[15px] font-semibold transition-[transform,background-color] duration-[160ms] ease-[var(--ease-out)] active:scale-[0.99] " +
                  (hasFiles
                    ? "bg-[var(--band)] text-white hover:bg-[var(--band-2)]"
                    : "cursor-not-allowed bg-[var(--ink-150)] text-[var(--ink-400)]")
                }
              >
                {hasFiles ? "Generate my sheet · 1 credit" : "Add files to generate"}
              </button>
              <div className="mt-2.5 text-center font-mono text-[11px] text-[var(--ink-500)]">
                {hasFiles
                  ? "free preview first · you see it before you pay"
                  : "2 credits left on your account"}
              </div>
            </div>
          </aside>
        </div>
      </form>
    </AppChrome>
  );
}

function SegPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "tap flex-1 rounded-[6px] px-1 py-[7px] text-center text-[12.5px] font-semibold transition-[background-color,color,box-shadow] duration-[160ms] " +
        (active
          ? "bg-[var(--surface)] text-[var(--ink-900)] shadow-[var(--sh-sm)]"
          : "text-[var(--ink-500)] hover:text-[var(--ink-800)]")
      }
    >
      {label}
    </button>
  );
}
