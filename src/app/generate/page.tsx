"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Button,
  Callout,
  Card,
  Field,
  FileDrop,
  Progress,
  Select,
  TextInput,
} from "@/components/ui";

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

  const confidence = Math.min(
    100,
    files.reduce((s, f) => s + TAG_WEIGHTS[f.tag], 0),
  );

  function addFiles(list: FileList) {
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

  const noPastExam = files.length > 0 && !files.some((f) => f.tag === "past_exam");

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
        <section>
          <FileDrop
            onFiles={addFiles}
            accept=".pdf,.txt,.md"
            disabled={submitting}
          />

          {files.length > 0 && (
            <ul className="mt-3 space-y-2">
              {files.map((f, ix) => (
                <li key={`${f.file.name}-${ix}`}>
                  <Card className="flex items-center gap-2 !p-2 text-sm" bare>
                    <div className="flex flex-1 items-center gap-2 pl-2">
                      <span className="flex-1 truncate" title={f.file.name}>
                        {f.file.name}
                        <span className="ml-2 text-xs text-neutral-400">
                          {Math.round(f.file.size / 1024)} kB
                        </span>
                      </span>
                    </div>
                    <Select
                      value={f.tag}
                      onChange={(e) => updateTag(ix, e.target.value as FileTag)}
                      className="!w-auto !py-1 !text-xs"
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
                </li>
              ))}
            </ul>
          )}

          {files.length > 0 && (
            <Progress
              className="mt-3"
              value={confidence}
              tone="confidence"
              label="Confidence in result"
              rightSide={`${confidence}%`}
            />
          )}
          {noPastExam && (
            <p className="mt-1 text-xs text-neutral-500">
              Tip: tagging a past exam boosts confidence the most.
            </p>
          )}
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <Field label="Exam type">
            <Select
              value={examType}
              onChange={(e) => setExamType(e.target.value as typeof examType)}
            >
              <option value="conceptual">Conceptual</option>
              <option value="problem-solving">Problem-solving</option>
              <option value="mixed">Mixed</option>
            </Select>
          </Field>
          <Field label="Density">
            <Select
              value={density}
              onChange={(e) => setDensity(e.target.value as typeof density)}
            >
              <option value="minimal">Minimal (readable)</option>
              <option value="standard">Standard</option>
              <option value="max">MAX (the hero)</option>
            </Select>
          </Field>
          <Field label="Priority">
            <Select
              value={priority}
              onChange={(e) => setPriority(e.target.value as typeof priority)}
            >
              <option value="balanced">Balanced</option>
              <option value="formulas">Formulas first</option>
              <option value="concepts">Concepts first</option>
            </Select>
          </Field>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <Field label="Course code (optional)">
            <TextInput
              value={courseCode}
              onChange={(e) => setCourseCode(e.target.value)}
              placeholder="e.g. CS 6320"
            />
          </Field>
          <Field label="Professor (optional)">
            <TextInput
              value={professor}
              onChange={(e) => setProfessor(e.target.value)}
              placeholder="e.g. Ouyang"
            />
          </Field>
        </section>

        {error && <Callout variant="danger">{error}</Callout>}

        <div className="space-y-1">
          <Button type="submit" size="lg" disabled={submitting || files.length === 0}>
            {submitting ? "Generating… (may take 30–90s on a big pack)" : "Generate"}
          </Button>
          {submitting && (
            <p className="text-xs text-neutral-500">
              Don&apos;t close this tab — the engine is reading every file.
            </p>
          )}
        </div>
      </form>
    </main>
  );
}
