"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AppChrome,
  Button,
  Callout,
  Card,
  FileDrop,
  Progress,
  Select,
  TextInput,
} from "@/components/ui";
import type { Density } from "@/components/sheet";
import { GeneratingOverlay } from "./GeneratingOverlay";

type FileTag =
  | "slides"
  | "review"
  | "past_exam"
  | "homework"
  | "notes"
  | "formula_sheet";

const TAG_LABELS: Record<FileTag, string> = {
  slides: "Slides",
  review: "Review guide",
  past_exam: "★ Past exam",
  homework: "Homework",
  notes: "Notes",
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

function fileKind(name: string): string {
  const ext = name.split(".").pop()?.toUpperCase() ?? "FILE";
  return ext.length > 4 ? "FILE" : ext;
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
  const [error, setError] = useState<string | null>(null);

  const confidence = Math.min(100, files.reduce((s, f) => s + TAG_WEIGHTS[f.tag], 0));
  const hasFiles = files.length > 0;
  const hasPastExam = files.some((f) => f.tag === "past_exam");

  function addFiles(list: FileList) {
    const next: PendingFile[] = [];
    for (let i = 0; i < list.length; i++) next.push({ file: list[i], tag: guessTag(list[i].name) });
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
    if (!hasFiles) return setError("Drop at least one file before generating.");

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
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      const payload = (await res.json()) as { content: unknown; meta: unknown; warnings?: string[] };
      sessionStorage.setItem(
        "cramsheet:last",
        JSON.stringify({
          content: payload.content,
          meta: payload.meta,
          warnings: payload.warnings ?? [],
          density,
          // Scoring context for Layer A (relevance.ts): file tags drive
          // source-authority, examType/priority drive the multipliers.
          // Without this the sheet scores by evidence only (R2 / spec §1).
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
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <AppChrome active="generate" credits={2} avatar="AD">
      {submitting && (
        <GeneratingOverlay
          fileCount={files.length}
          pastExamCount={files.filter((f) => f.tag === "past_exam").length}
        />
      )}
      <form onSubmit={onSubmit} className="mx-auto max-w-6xl px-5 py-8">
        <header className="mb-6">
          <h1 className="font-serif text-[clamp(1.8rem,4vw,2.4rem)] tracking-[-0.02em] text-[var(--ink-900)]">
            {hasFiles ? `${files.length} file${files.length === 1 ? "" : "s"} ready` : "Make a sheet"}
          </h1>
          <p className="mt-1 text-[15px] text-[var(--ink-500)]">
            {hasFiles
              ? "Tag each file so we weight it correctly — past exams count most."
              : "Drop your slides, review guides, past exams, and notes to begin."}
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* ── Left: files ─────────────────────────────────────────── */}
          <section className="space-y-4">
            <FileDrop onFiles={addFiles} accept=".pdf,.txt,.md" disabled={submitting} />

            {files.map((f, ix) => (
              <Card key={`${f.file.name}-${ix}`} className="flex items-center gap-3 !py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--r-sm)] bg-[var(--ink-100)] font-mono text-[10px] font-semibold text-[var(--ink-500)]">
                  {fileKind(f.file.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium text-[var(--ink-900)]" title={f.file.name}>
                    {f.file.name}
                  </div>
                  <div className="font-mono text-[11px] text-[var(--ink-400)]">
                    {Math.round(f.file.size / 1024)} KB
                  </div>
                </div>
                <Select
                  value={f.tag}
                  onChange={(e) => updateTag(ix, e.target.value as FileTag)}
                  className="!h-8 !w-auto !text-[12px]"
                >
                  {(Object.keys(TAG_LABELS) as FileTag[]).map((t) => (
                    <option key={t} value={t}>
                      {TAG_LABELS[t]}
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeFile(ix)}
                  aria-label={`remove ${f.file.name}`}
                >
                  ✕
                </Button>
              </Card>
            ))}
          </section>

          {/* ── Right: settings ─────────────────────────────────────── */}
          <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start">
            <Card className="space-y-4">
              <Setting label="Exam type">
                <Select value={examType} onChange={(e) => setExamType(e.target.value as typeof examType)} disabled={!hasFiles}>
                  <option value="conceptual">Conceptual</option>
                  <option value="problem-solving">Problem-solving</option>
                  <option value="mixed">Mixed</option>
                </Select>
              </Setting>
              <Setting label="Density">
                <Select value={density} onChange={(e) => setDensity(e.target.value as Density)} disabled={!hasFiles}>
                  <option value="max">MAX — fit everything</option>
                  <option value="balanced">Balanced — high-yield</option>
                  <option value="essentials">Essentials — core only</option>
                </Select>
              </Setting>
              <Setting label="Priority">
                <Select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)} disabled={!hasFiles}>
                  <option value="balanced">Balanced</option>
                  <option value="formulas">Formulas first</option>
                  <option value="concepts">Concepts first</option>
                </Select>
              </Setting>

              <div className="border-t border-[var(--ink-150)] pt-4">
                <Progress
                  value={hasFiles ? confidence : 0}
                  tone="confidence"
                  label="Confidence in result"
                  rightSide={hasFiles ? `${confidence}%` : "—"}
                />
                {hasFiles && !hasPastExam && (
                  <p className="mt-2 text-[12px] text-[var(--ink-500)]">
                    Add a past exam to push confidence past 85%.
                  </p>
                )}
              </div>
            </Card>

            <Card className="space-y-3">
              <Setting label="Course code (optional)">
                <TextInput value={courseCode} onChange={(e) => setCourseCode(e.target.value)} placeholder="e.g. CS 6320" />
              </Setting>
              <Setting label="Professor (optional)">
                <TextInput value={professor} onChange={(e) => setProfessor(e.target.value)} placeholder="e.g. Ouyang" />
              </Setting>
            </Card>

            {error && <Callout variant="danger">{error}</Callout>}

            <Button type="submit" size="lg" className="w-full" disabled={!hasFiles} loading={submitting}>
              {submitting ? "Generating…" : hasFiles ? "Generate my sheet · 1 credit" : "Add files to generate"}
            </Button>
            {submitting && (
              <p className="text-center text-[12px] text-[var(--ink-400)]">
                Don&apos;t close this tab — usually done in under a minute.
              </p>
            )}
          </aside>
        </div>
      </form>
    </AppChrome>
  );
}

function Setting({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] font-medium text-[var(--ink-600)]">{label}</span>
      {children}
    </label>
  );
}
