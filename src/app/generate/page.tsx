"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type FileTag =
  | "slides"
  | "review"
  | "past_exam"
  | "homework"
  | "notes"
  | "formula_sheet";

const TAG_LABELS: Record<FileTag, string> = {
  slides: "Lecture slides",
  review: "Review guide",
  past_exam: "★ Past exam (highest weight)",
  homework: "Homework",
  notes: "Class notes",
  formula_sheet: "Formula sheet",
};

const TAG_WEIGHTS: Record<FileTag, number> = {
  past_exam: 30,
  review: 22,
  homework: 18,
  slides: 14,
  notes: 10,
  formula_sheet: 6,
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
  if (/formula[-_ ]?sheet/.test(n)) return "formula_sheet";
  return "slides";
}

export default function GeneratePage() {
  const router = useRouter();
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [examType, setExamType] = useState<"conceptual" | "problem-solving" | "mixed">("mixed");
  const [density, setDensity] = useState<"minimal" | "standard" | "max">("max");
  const [priority, setPriority] = useState<"formulas" | "concepts" | "balanced">("balanced");
  const [courseCode, setCourseCode] = useState("");
  const [professor, setProfessor] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Confidence meter — sum of tag weights, capped at 100.
  const confidence = Math.min(
    100,
    files.reduce((s, f) => s + TAG_WEIGHTS[f.tag], 0),
  );

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next: PendingFile[] = [];
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      next.push({ file: f, tag: guessTag(f.name) });
    }
    setFiles((prev) => [...prev, ...next]);
  }

  function updateTag(ix: number, tag: FileTag) {
    setFiles((prev) => prev.map((f, i) => (i === ix ? { ...f, tag } : f)));
  }

  function removeFile(ix: number) {
    setFiles((prev) => prev.filter((_, i) => i !== ix));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (files.length === 0) {
      setError("Drop at least one file before generating.");
      return;
    }

    setSubmitting(true);
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

      const res = await fetch("/api/generate", { method: "POST", body: fd });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const payload = (await res.json()) as {
        content: unknown;
        meta: unknown;
        warnings?: string[];
      };
      // Stash in sessionStorage; the /results page reads + renders it.
      // (Step 9 swaps this for Supabase persistence.)
      const stash = {
        content: payload.content,
        meta: payload.meta,
        warnings: payload.warnings ?? [],
        density,
        savedAt: new Date().toISOString(),
      };
      sessionStorage.setItem("cramsheet:last", JSON.stringify(stash));
      router.push("/results");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-[color:var(--color-primary-indigo)]">
          Generate your Exam Reference Sheet
        </h1>
        <p className="mt-2 text-sm text-neutral-600">
          Drop your slides, review guide, past exams, notes. Tag each file —
          the engine weights past exams highest. Pick density, hit generate.
        </p>
      </header>

      <form onSubmit={onSubmit} className="space-y-6">
        {/* ── File drop ─────────────────────────────────────────────── */}
        <section>
          <label
            htmlFor="file-input"
            className="flex h-32 cursor-pointer items-center justify-center rounded border-2 border-dashed border-neutral-300 bg-neutral-50 text-sm text-neutral-600 hover:bg-neutral-100"
          >
            <input
              id="file-input"
              type="file"
              multiple
              accept=".pdf,.txt,.md"
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
              onDragOver={(e) => e.preventDefault()}
            />
            <span className="font-medium">
              Click to add PDFs · or drag & drop
            </span>
          </label>

          {files.length > 0 && (
            <ul className="mt-3 space-y-2">
              {files.map((f, ix) => (
                <li
                  key={`${f.file.name}-${ix}`}
                  className="flex items-center gap-2 rounded border border-neutral-200 bg-white p-2 text-sm"
                >
                  <span className="flex-1 truncate" title={f.file.name}>
                    {f.file.name}
                    <span className="ml-2 text-xs text-neutral-400">
                      {Math.round(f.file.size / 1024)} kB
                    </span>
                  </span>
                  <select
                    value={f.tag}
                    onChange={(e) => updateTag(ix, e.target.value as FileTag)}
                    className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs"
                  >
                    {(Object.keys(TAG_LABELS) as FileTag[]).map((t) => (
                      <option key={t} value={t}>
                        {TAG_LABELS[t]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeFile(ix)}
                    className="rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100"
                    aria-label="remove file"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Confidence meter — climbs with higher-weight files. */}
          {files.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-xs text-neutral-500">
                <span>Confidence in result</span>
                <span>{confidence}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded bg-neutral-200">
                <div
                  className="h-full rounded bg-[color:var(--color-correct-green)] transition-all"
                  style={{ width: `${confidence}%` }}
                />
              </div>
              {!files.some((f) => f.tag === "past_exam") && (
                <p className="mt-1 text-xs text-neutral-500">
                  Tip: tagging a past exam boosts confidence the most.
                </p>
              )}
            </div>
          )}
        </section>

        {/* ── Three controls only (PRD §12) ─────────────────────────── */}
        <section className="grid gap-4 sm:grid-cols-3">
          <Field label="Exam type">
            <select
              value={examType}
              onChange={(e) =>
                setExamType(e.target.value as typeof examType)
              }
              className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm"
            >
              <option value="conceptual">Conceptual</option>
              <option value="problem-solving">Problem-solving</option>
              <option value="mixed">Mixed</option>
            </select>
          </Field>
          <Field label="Density">
            <select
              value={density}
              onChange={(e) => setDensity(e.target.value as typeof density)}
              className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm"
            >
              <option value="minimal">Minimal (readable)</option>
              <option value="standard">Standard</option>
              <option value="max">MAX (the hero)</option>
            </select>
          </Field>
          <Field label="Priority">
            <select
              value={priority}
              onChange={(e) =>
                setPriority(e.target.value as typeof priority)
              }
              className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm"
            >
              <option value="balanced">Balanced</option>
              <option value="formulas">Formulas first</option>
              <option value="concepts">Concepts first</option>
            </select>
          </Field>
        </section>

        {/* ── Optional course context ──────────────────────────────── */}
        <section className="grid gap-4 sm:grid-cols-2">
          <Field label="Course code (optional)">
            <input
              type="text"
              value={courseCode}
              onChange={(e) => setCourseCode(e.target.value)}
              placeholder="e.g. CS 6320"
              className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm"
            />
          </Field>
          <Field label="Professor (optional)">
            <input
              type="text"
              value={professor}
              onChange={(e) => setProfessor(e.target.value)}
              placeholder="e.g. Ouyang"
              className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm"
            />
          </Field>
        </section>

        {error && (
          <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || files.length === 0}
          className="rounded bg-[color:var(--color-primary-indigo)] px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Generating… (may take 30–90s on a big pack)" : "Generate"}
        </button>
        {submitting && (
          <p className="text-xs text-neutral-500">
            Don&apos;t close this tab — the engine is reading every file.
          </p>
        )}
      </form>
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-neutral-700">{label}</span>
      {children}
    </label>
  );
}
