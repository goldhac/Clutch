"use client";

/**
 * TopicList — the split, before anything is spent (#6).
 *
 * This screen exists because of one number: a wrong topic costs a whole episode's credits on
 * something that was never a topic. So it does not present the split as a result. It presents it
 * as a proposal, says why each merge happened, and makes the three corrections a student actually
 * needs — drop it, rename it, join it to the one above — with the cost of the current selection
 * visible at all times.
 *
 * Priority is shown but not editable: it is read off the student's OWN review sheets and past
 * exams, so it is information about their course, not a preference. Length is not editable either,
 * because it follows the material — a six-minute topic cannot be stretched to twenty without the
 * padding that makes generated audio unlistenable.
 */
import { Button, Chip } from "@/components/ui";

export interface UITopic {
  index: number;
  title: string;
  files: string[];
  chars: number;
  materialMinutes: number;
  episodeMinutes: number;
  priority: "T1" | "T2" | "T3";
  examMentions: number;
  merged?: "same subject" | "too thin" | "joined by hand";
}

const PRIORITY_LABEL: Record<UITopic["priority"], string> = {
  T1: "Listen first",
  T2: "Then these",
  T3: "If there's time",
};
const PRIORITY_TONE: Record<UITopic["priority"], "exam" | "signal" | "neutral"> = {
  T1: "exam",
  T2: "signal",
  T3: "neutral",
};

export interface TopicListProps {
  topics: UITopic[];
  selected: Set<number>;
  onToggle: (index: number) => void;
  onRename: (index: number, title: string) => void;
  onMergeUp: (index: number) => void;
  disabled?: boolean;
}

export function TopicList({ topics, selected, onToggle, onRename, onMergeUp, disabled }: TopicListProps) {
  return (
    <ol className="mt-5 flex flex-col gap-2.5">
      {topics.map((t, row) => {
        const on = selected.has(t.index);
        return (
          <li
            key={t.index}
            className={
              "rounded-[12px] border bg-[var(--surface)] transition-[border-color,opacity] duration-[160ms] " +
              (on
                ? "border-[var(--ink-300)] shadow-[var(--sh-xs)]"
                : "border-[var(--ink-150)] opacity-60")
            }
          >
            <div className="flex items-start gap-3.5 px-4 py-3.5">
              <label className="tap mt-[2px] flex shrink-0 cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={on}
                  disabled={disabled}
                  onChange={() => onToggle(t.index)}
                  className="h-[18px] w-[18px] cursor-pointer accent-[var(--signal-600)]"
                  aria-label={`Make an episode about ${t.title}`}
                />
              </label>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                  <input
                    value={t.title}
                    disabled={disabled}
                    onChange={(e) => onRename(t.index, e.target.value)}
                    aria-label={`Episode ${row + 1} title`}
                    className="min-w-0 flex-1 truncate rounded-[6px] border border-transparent bg-transparent px-1 py-0.5 text-[15px] font-semibold tracking-[-0.01em] text-[var(--ink-900)] hover:border-[var(--ink-150)] focus:border-[var(--signal-500)] focus:bg-[var(--surface)] focus:outline-none"
                  />
                  <Chip tone={PRIORITY_TONE[t.priority]}>{PRIORITY_LABEL[t.priority]}</Chip>
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 px-1 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-500)]">
                  <span>~{t.episodeMinutes} min</span>
                  <span aria-hidden>·</span>
                  <span>{t.files.length === 1 ? "1 file" : `${t.files.length} files`}</span>
                  {t.examMentions > 0 && (
                    <>
                      <span aria-hidden>·</span>
                      <span>
                        named {t.examMentions}× in your review material
                      </span>
                    </>
                  )}
                </div>

                <div className="mt-1.5 px-1 text-[13px] leading-[1.5] text-[var(--ink-600)]">
                  {t.files.join(" · ")}
                </div>

                {t.merged && (
                  <div className="mt-2 flex items-start gap-2 rounded-[8px] bg-[var(--info-bg)] px-2.5 py-1.5 text-[12.5px] leading-[1.45] text-[var(--info)]">
                    <span aria-hidden className="mt-[5px] inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--info)]" />
                    <span>
                      {t.merged === "same subject"
                        ? "Joined: these are the same lecture in two parts, so splitting them would stop one episode mid-idea."
                        : t.merged === "too thin"
                          ? "Joined: alone, neither had enough material for five minutes, and the rest would have been padding."
                          : "Joined by you: one episode covering both, as long as the material supports."}
                    </span>
                  </div>
                )}
              </div>

              {row > 0 && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={disabled}
                  onClick={() => onMergeUp(t.index)}
                  title={`Join "${t.title}" to "${topics[row - 1].title}"`}
                  className="shrink-0"
                >
                  Join up
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
