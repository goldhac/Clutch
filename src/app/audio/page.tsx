"use client";

/**
 * /audio — turn the same pack into a series of episodes (#6).
 *
 * Two steps, and the line between them is the point: step one costs nothing, step two spends.
 *
 *   1. Build the pack and prepare it. /api/audio/analyze reads the files and proposes a split.
 *      Nothing is debited, nothing is queued.
 *   2. Correct the split — drop a topic, rename it, join it to the one above — then make only the
 *      episodes ticked. A fourteen-lecture course should not cost fourteen credits because the
 *      default was "everything".
 *
 * A student arriving here has usually already made a sheet from these files. The ingest cache is
 * keyed on the bytes and the same options /api/generate uses, so preparing the pack a second time
 * costs nothing and takes seconds.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AppChrome, Button } from "@/components/ui";
import { TopicList, type UITopic } from "./TopicList";

type FileTag = "slides" | "review" | "past_exam" | "homework" | "notes" | "formula_sheet";

const TAG_LABEL: Record<FileTag, string> = {
  slides: "Lecture",
  review: "Review sheet",
  past_exam: "Past exam",
  homework: "Homework",
  notes: "Notes",
  formula_sheet: "Formula sheet",
};
/** Which tags become episodes. The others shape the order without being spoken. */
const TEACHING: FileTag[] = ["slides", "notes", "homework", "formula_sheet"];

function guessTag(name: string): FileTag {
  const n = name.toLowerCase();
  if (/exam|midterm|final|quiz/.test(n)) return "past_exam";
  if (/review/.test(n)) return "review";
  if (/\bhw\d?\b|homework/.test(n)) return "homework";
  if (/note/.test(n)) return "notes";
  if (/formula[-_ ]?sheet|formula/.test(n)) return "formula_sheet";
  return "slides";
}

interface Prepared {
  seriesId: string;
  title: string;
  topics: UITopic[];
  notes: string[];
  warnings: string[];
}

interface QueuedEpisode {
  topicIndex: number;
  topic: string;
  podcastId: string | null;
  alreadyQueued: boolean;
}

/** ~1,100 characters of source is a minute of audio — the same constant the splitter uses. */
const CHARS_PER_MINUTE = 1_100;
const MIN_MINUTES = 5;
const MAX_MINUTES = 24;
const MAX_PER_REQUEST = 12;

export default function AudioPage() {
  const [files, setFiles] = useState<{ file: File; tag: FileTag }[]>([]);
  const [dragging, setDragging] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [making, setMaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [proposed, setProposed] = useState<UITopic[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [queued, setQueued] = useState<QueuedEpisode[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!error) return;
    alertRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    alertRef.current?.focus({ preventScroll: true });
  }, [error]);

  const topics = prepared?.topics ?? [];
  const chosen = topics.filter((t) => selected.has(t.index));
  const teachingCount = files.filter((f) => TEACHING.includes(f.tag)).length;
  const dirty =
    !!proposed &&
    (proposed.length !== topics.length ||
      topics.some((t, i) => t.title !== proposed[i]?.title || t.files.join("|") !== proposed[i]?.files.join("|")));

  function addFiles(list: FileList | File[]) {
    setFiles((prev) => [...prev, ...Array.from(list).map((f) => ({ file: f, tag: guessTag(f.name) }))]);
    setDragging(false);
    // The split belongs to the pack that made it.
    setPrepared(null);
    setProposed(null);
    setQueued(null);
  }

  async function prepare(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setQueued(null);
    if (!files.length) return setError("Drop at least one file first.");
    if (!teachingCount) {
      return setError(
        "These are all review or exam files. Add the lectures or notes you want taught — " +
          "a review sheet tells us what matters, but there's nothing in it to teach from.",
      );
    }
    setPreparing(true);
    try {
      const fd = new FormData();
      files.forEach((f, ix) => {
        fd.append(`file_${ix}`, f.file);
        fd.append(`tag_${ix}`, f.tag);
      });
      const res = await fetch("/api/audio/analyze", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      const p = (await res.json()) as Prepared;
      setPrepared(p);
      setProposed(p.topics.map((t) => ({ ...t })));
      // Default to the ones their own exam material says to listen to first, never to everything.
      const first = p.topics.filter((t) => t.priority === "T1").map((t) => t.index);
      setSelected(new Set(first.length ? first : p.topics.slice(0, 1).map((t) => t.index)));
    } catch (e) {
      setError(friendly(e, "We couldn't read these files. Your files are still here, so please try again."));
    } finally {
      setPreparing(false);
    }
  }

  function toggle(index: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function rename(index: number, title: string) {
    setPrepared((p) => (p ? { ...p, topics: p.topics.map((t) => (t.index === index ? { ...t, title } : t)) } : p));
  }

  /**
   * Join a topic into the one above it. The student is telling us two things are one lecture, so
   * the episode has to be recomputed, not just relabelled: it covers both sets of files and runs
   * as long as the combined material supports, inside the range an episode can be.
   */
  function mergeUp(index: number) {
    if (!prepared) return;
    const row = prepared.topics.findIndex((t) => t.index === index);
    if (row < 1) return;
    const above = prepared.topics[row - 1];
    const t = prepared.topics[row];
    const chars = above.chars + t.chars;
    const material = Math.round((chars / CHARS_PER_MINUTE) * 10) / 10;
    const joined: UITopic = {
      ...above,
      title: above.title === t.title ? above.title : `${above.title} + ${t.title}`,
      files: [...above.files, ...t.files],
      chars,
      materialMinutes: material,
      episodeMinutes: Math.round(Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, material))),
      // The stronger claim on the student's attention survives. T1 < T2 < T3 as strings, which is
      // the order of urgency, so the smaller one wins.
      priority: above.priority <= t.priority ? above.priority : t.priority,
      examMentions: above.examMentions + t.examMentions,
      // Their reason, not the splitter's: saying "too thin" here explained two 24-minute chapters
      // as having under five minutes of material between them.
      merged: "joined by hand",
    };
    setPrepared({ ...prepared, topics: [...prepared.topics.slice(0, row - 1), joined, ...prepared.topics.slice(row + 1)] });
    // The joined episode inherits the selection if either half had it. Computed out here rather
    // than inside the updater above: a state updater must be pure, and under StrictMode React
    // runs it twice, which would apply this twice.
    setSelected((s) => {
      const keep = new Set(s);
      if (keep.has(t.index) || keep.has(above.index)) keep.add(joined.index);
      keep.delete(t.index);
      return keep;
    });
  }

  function reset() {
    if (!proposed) return;
    setPrepared((p) => (p ? { ...p, topics: proposed.map((t) => ({ ...t })) } : p));
    const first = proposed.filter((t) => t.priority === "T1").map((t) => t.index);
    setSelected(new Set(first.length ? first : proposed.slice(0, 1).map((t) => t.index)));
  }

  async function makeEpisodes() {
    if (!prepared || !chosen.length) return;
    setError(null);
    setMaking(true);
    try {
      const res = await fetch("/api/audio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seriesId: prepared.seriesId,
          topicIndexes: chosen.map((t) => t.index),
          // Send the split as edited — the worker reads it to know what each episode covers.
          topics: prepared.topics,
        }),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      const payload = (await res.json()) as { episodes: QueuedEpisode[] };
      setQueued(payload.episodes);
    } catch (e) {
      setError(friendly(e, "We couldn't start those episodes. Nothing was charged. Please try again."));
    } finally {
      setMaking(false);
    }
  }

  const tooMany = chosen.length > MAX_PER_REQUEST;

  return (
    <AppChrome active="audio" credits={2} avatar="AD">
      <div className="mx-auto max-w-[1180px] px-6 pb-24 pt-11 sm:px-8">
        <header className="flex flex-col justify-between gap-4 border-b border-[var(--ink-900)] pb-5 sm:flex-row sm:items-end sm:gap-10">
          <div>
            <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-500)]">
              {prepared ? "Step 2 of 2 · choose your episodes" : "Step 1 of 2 · build the pack"}
            </div>
            <h1 className="mt-3.5 font-serif text-[clamp(2rem,4.5vw,2.875rem)] leading-[1.04] tracking-[-0.03em] text-[var(--ink-900)]">
              {prepared ? `${topics.length} topic${topics.length === 1 ? "" : "s"} in this course` : "Listen to your notes"}
            </h1>
          </div>
          <p className="max-w-[34ch] text-[14px] leading-[1.6] text-[var(--ink-600)]" style={{ textWrap: "pretty" }}>
            {prepared
              ? "Two hosts teach one topic per episode. Check the split before you spend anything — join anything we split wrongly, and untick what you already know."
              : "Two hosts talking through your own lectures, one topic at a time. Drop the pack and we'll show you the episodes before making any."}
          </p>
        </header>

        {error && (
          <div
            ref={alertRef}
            role="alert"
            tabIndex={-1}
            className="mt-6 flex items-start gap-3 rounded-[12px] border border-[var(--conf-low)]/30 bg-[var(--conf-low-bg)] px-5 py-4 text-[14px] leading-[1.55] text-[var(--conf-low-deep)] outline-none"
          >
            <span aria-hidden className="mt-[3px] inline-block h-2 w-2 shrink-0 rounded-full bg-[var(--conf-low)]" />
            <div>
              <div className="font-semibold">Nothing was charged</div>
              <div className="mt-0.5">{error}</div>
            </div>
          </div>
        )}

        {/* ── what was queued ───────────────────────────────────────── */}
        {queued && (
          <section className="mt-7 rounded-[14px] border border-[var(--conf-high)]/30 bg-[var(--conf-high-bg)] px-5 py-4">
            <h2 className="text-[15px] font-semibold text-[var(--conf-high)]">
              {queued.filter((q) => q.podcastId).length} episode
              {queued.filter((q) => q.podcastId).length === 1 ? "" : "s"} recording
            </h2>
            <ul className="mt-2 flex flex-col gap-1 text-[13.5px] leading-[1.5] text-[var(--ink-700)]">
              {queued.map((q) => (
                <li key={q.topicIndex}>
                  <span className="font-semibold">{q.topic}</span>
                  {q.alreadyQueued
                    ? " — already on its way from before, so you weren't charged again."
                    : q.podcastId
                      ? " — queued."
                      : " — couldn't be started, and wasn't charged."}
                </li>
              ))}
            </ul>
            <p className="mt-2.5 text-[13px] leading-[1.5] text-[var(--ink-600)]">
              Two record at a time; the rest wait their turn. You can close this page — they keep going.
            </p>
          </section>
        )}

        <div className="mt-9 grid items-start gap-11 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* min-w-0: a grid item's automatic minimum is its min-content, so without this the
              column grows past the phone and the whole page scrolls sideways. */}
          <section className="min-w-0">
            {!prepared ? (
              <>
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
                        <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                        <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
                        <path d="M12 18v4" />
                      </svg>
                    </span>
                    <div className="min-w-0">
                      <div className="text-[16px] font-semibold tracking-[-0.01em] text-[var(--ink-900)]">
                        Drop your course files
                      </div>
                      <div className="mt-0.5 text-[14px] leading-[1.5] text-[var(--ink-600)]">
                        PDF, PPTX, TXT or MD · lectures become episodes · review sheets set the order
                      </div>
                    </div>
                    <span className="ml-auto hidden h-[38px] shrink-0 items-center rounded-[var(--r-md)] border border-[var(--border-input)] bg-[var(--surface)] px-4 text-[14px] font-semibold text-[var(--ink-900)] sm:inline-flex">
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

                {files.length > 0 && (
                  <ul className="mt-5 flex flex-col divide-y divide-[var(--ink-150)] border-y border-[var(--ink-150)]">
                    {files.map((f, ix) => (
                      <li key={`${f.file.name}-${ix}`} className="flex items-center gap-3 py-2.5">
                        <span className="min-w-0 flex-1 truncate text-[14px] text-[var(--ink-800)]">{f.file.name}</span>
                        <select
                          value={f.tag}
                          aria-label={`What kind of file is ${f.file.name}?`}
                          onChange={(e) => {
                            const tag = e.target.value as FileTag;
                            setFiles((prev) => prev.map((x, i) => (i === ix ? { ...x, tag } : x)));
                          }}
                          className="tap shrink-0 rounded-[7px] border border-[var(--border-input)] bg-[var(--surface)] px-2 py-1 text-[13px] text-[var(--ink-800)]"
                        >
                          {(Object.keys(TAG_LABEL) as FileTag[]).map((t) => (
                            <option key={t} value={t}>{TAG_LABEL[t]}</option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setFiles((prev) => prev.filter((_, i) => i !== ix))}
                          aria-label={`Remove ${f.file.name}`}
                          className="shrink-0"
                        >
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <>
                {prepared.notes.length > 0 && (
                  <section className="rounded-[12px] border border-[var(--ink-150)] bg-[var(--paper-2)] px-4 py-3.5">
                    <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-500)]">
                      How we split it
                    </h2>
                    <ul className="mt-2 flex flex-col gap-1.5 text-[13.5px] leading-[1.5] text-[var(--ink-700)]">
                      {prepared.notes.map((note, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span aria-hidden className="mt-[7px] inline-block h-1 w-1 shrink-0 rounded-full bg-[var(--ink-400)]" />
                          <span>{note}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <TopicList
                  topics={topics}
                  selected={selected}
                  onToggle={toggle}
                  onRename={rename}
                  onMergeUp={mergeUp}
                  disabled={making}
                />

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button type="button" variant="secondary" size="sm" onClick={() => setSelected(new Set(topics.map((t) => t.index)))}>
                    Select all
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => setSelected(new Set())}>
                    Clear
                  </Button>
                  {dirty && (
                    <Button type="button" variant="ghost" size="sm" onClick={reset}>
                      Undo my changes
                    </Button>
                  )}
                </div>
              </>
            )}
          </section>

          {/* ── right: what this costs ─────────────────────────────── */}
          <aside className="min-w-0 lg:sticky lg:top-[84px]">
            <div className="rounded-[14px] border border-[var(--ink-150)] bg-[var(--surface)] p-5 shadow-[var(--sh-xs)]">
              {!prepared ? (
                <>
                  <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--ink-900)]">
                    Reading the pack is free
                  </h2>
                  <p className="mt-1.5 text-[13.5px] leading-[1.55] text-[var(--ink-600)]">
                    We&rsquo;ll show you the episodes we&rsquo;d make and what each one covers. You only spend
                    when you pick them.
                  </p>
                  <dl className="mt-4 flex flex-col gap-2 border-t border-[var(--ink-150)] pt-3.5 text-[13.5px]">
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-[var(--ink-600)]">Files</dt>
                      <dd className="font-mono tabular-nums text-[var(--ink-900)]">{files.length}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-[var(--ink-600)]">Will become episodes</dt>
                      <dd className="font-mono tabular-nums text-[var(--ink-900)]">{teachingCount}</dd>
                    </div>
                  </dl>
                  <Button
                    type="button"
                    onClick={prepare}
                    disabled={!files.length}
                    loading={preparing}
                    className="mt-4 w-full"
                  >
                    {preparing ? "Reading your files…" : "Prepare my episodes"}
                  </Button>
                  <p className="mt-2.5 text-center text-[12px] text-[var(--ink-500)]">
                    No credits yet. Nothing is recorded until you choose.
                  </p>
                </>
              ) : (
                <>
                  <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--ink-900)]">
                    {chosen.length === 0
                      ? "Nothing selected"
                      : `${chosen.length} episode${chosen.length === 1 ? "" : "s"}`}
                  </h2>
                  <dl className="mt-3 flex flex-col gap-2 border-t border-[var(--ink-150)] pt-3.5 text-[13.5px]">
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-[var(--ink-600)]">Listening time</dt>
                      <dd className="font-mono tabular-nums text-[var(--ink-900)]">
                        {chosen.reduce((s, t) => s + t.episodeMinutes, 0)} min
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-[var(--ink-600)]">Credits</dt>
                      <dd className="font-mono tabular-nums text-[var(--ink-900)]">{chosen.length}</dd>
                    </div>
                  </dl>
                  {tooMany && (
                    <p className="mt-3 rounded-[8px] bg-[var(--warn-bg)] px-3 py-2 text-[12.5px] leading-[1.45] text-[var(--warn)]">
                      That&rsquo;s more than {MAX_PER_REQUEST} at once. Untick a few — you can come back for
                      the rest.
                    </p>
                  )}
                  <Button
                    type="button"
                    onClick={makeEpisodes}
                    disabled={!chosen.length || tooMany}
                    loading={making}
                    className="mt-4 w-full"
                  >
                    {making
                      ? "Starting…"
                      : chosen.length === 0
                        ? "Pick a topic"
                        : `Make ${chosen.length} episode${chosen.length === 1 ? "" : "s"}`}
                  </Button>
                  <p className="mt-2.5 text-center text-[12px] leading-[1.45] text-[var(--ink-500)]">
                    One credit each. If an episode fails, its credit comes back.
                  </p>
                  <p className="mt-4 border-t border-[var(--ink-150)] pt-3.5 text-[13px] leading-[1.5] text-[var(--ink-600)]">
                    Revising by eye instead?{" "}
                    <Link href="/generate" className="font-semibold text-[var(--signal-600)] underline decoration-[var(--signal-500)]/40 underline-offset-2 hover:decoration-[var(--signal-500)]">
                      Make a one-page sheet
                    </Link>{" "}
                    from the same files.
                  </p>
                </>
              )}
            </div>

            {prepared && prepared.warnings.length > 0 && (
              <div className="mt-4 rounded-[12px] border border-[var(--warn)]/25 bg-[var(--warn-bg)] px-4 py-3 text-[12.5px] leading-[1.5] text-[var(--warn)]">
                <div className="font-semibold">While reading your files</div>
                <ul className="mt-1 flex flex-col gap-1">
                  {prepared.warnings.slice(0, 4).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      </div>
    </AppChrome>
  );
}

/** A dropped connection is not a failed upload, and a 500-word message is not an explanation. */
function friendly(e: unknown, fallback: string): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (e instanceof TypeError || /failed to fetch|load failed|networkerror/i.test(msg)) {
    return "The connection dropped. Your files are still here, so please try again.";
  }
  return msg && msg.length <= 400 ? msg : fallback;
}
