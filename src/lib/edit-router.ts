/**
 * edit-router.ts — decide what a chat message IS before spending anything (issue #14).
 *
 * Most things a student types at a sheet are not content edits: "hide the traps",
 * "chapter order", "compact sources", "more formulas". Those are display changes the app
 * already does for free and instantly, so they never reach the model. Only what is left —
 * "remove everything about ELMo", "shorter definitions" — becomes a content edit.
 *
 * Deliberately conservative: anything qualified ("hide the traps ABOUT BERT") is a content
 * edit, because a display switch can't do it.
 */
export type FreeAction =
  | { type: "view"; key: "traps" | "tags" | "answers"; on: boolean }
  | { type: "sources"; value: "off" | "compact" | "full" }
  | { type: "order"; value: "course" | "priority" }
  | { type: "density"; value: "max" | "balanced" | "essentials" }
  | { type: "preset"; label: string; patch: { priority?: "formulas" | "concepts" | "balanced"; examType?: "mixed" } }
  | { type: "figure"; id: string; on: boolean }
  | { type: "format"; value: "mixed" | "multiple-choice" | "true-false" | "short-answer" | "problems" }
  | { type: "figures-off" }
  | { type: "open-diagrams" };

export type Route = { kind: "free"; actions: FreeAction[]; reply: string } | { kind: "content" };

const OFF = /\b(hide|remove|no|without|take off|turn off|drop|lose|get rid of|delete|off)\b/;
const ON = /\b(show|add|include|turn on|bring back|with|put|on)\b/;
/** A qualifier means "only some of them" — a display switch can't do that. */
const QUALIFIED = /\b(about|regarding|related to|on the topic|for (the )?topic|from (chapter|lecture|slide)|in (chapter|lecture) \d|except|only the|that mention|which mention|containing)\b/;

export function routeInstruction(raw: string, figures: { id: string; caption: string }[] = []): Route {
  const t = raw.toLowerCase().replace(/[.!?]+$/g, "").trim();
  if (!t || t.length > 90 || QUALIFIED.test(t)) return { kind: "content" };

  const actions: FreeAction[] = [];
  const said: string[] = [];
  const off = OFF.test(t), on = ON.test(t);
  const toggle = (rx: RegExp, key: "traps" | "tags" | "answers", name: string) => {
    if (!rx.test(t) || off === on) return; // needs exactly one direction
    actions.push({ type: "view", key, on });
    said.push(`${name} ${on ? "shown" : "hidden"}`);
  };

  toggle(/\btraps?\b/, "traps", "traps");
  toggle(/\b(question )?(tags?|labels?)\b/, "tags", "question tags");
  if (/\b(quiz me|self[- ]?test|test me|test myself)\b/.test(t)) {
    actions.push({ type: "view", key: "answers", on: false });
    said.push("answers hidden so you can test yourself");
  } else toggle(/\banswers?\b/, "answers", "answers");

  if (/\b(sources?|citations?|proof|references?)\b/.test(t)) {
    const value = /\bcompact\b/.test(t) ? "compact" : /\bfull\b/.test(t) ? "full" : off && !on ? "off" : on && !off ? "compact" : null;
    if (value) {
      actions.push({ type: "sources", value });
      said.push(value === "off" ? "sources hidden" : `sources set to ${value}`);
    }
  }

  if (/\b(chapter|course|lecture|chronological|syllabus)\b.*\border\b|\bby (chapter|lecture)\b|\border of the course\b/.test(t)) {
    actions.push({ type: "order", value: "course" });
    said.push("topics put in course order");
  } else if (/\b(priority|importance|most important|most likely)\b.*\b(order|first)\b|\bpriority order\b/.test(t)) {
    actions.push({ type: "order", value: "priority" });
    said.push("topics put in priority order");
  }

  const density = /\b(essentials?|just the basics|only the basics|bare minimum)\b/.test(t) ? "essentials"
    : /\bbalanced\b/.test(t) && /\b(density|sheet|make it|switch)\b/.test(t) ? "balanced"
    : /\b(max|fit everything|as much as possible|everything that fits)\b/.test(t) ? "max" : null;
  if (density) {
    actions.push({ type: "density", value: density });
    said.push(`density set to ${density}`);
  }

  if (/\bmore formulas?\b|\bfocus on formulas?\b/.test(t)) {
    actions.push({ type: "preset", label: "More formulas", patch: { priority: "formulas" } });
    said.push("formulas given more room");
  } else if (/\bmore (concepts?|definitions?)\b|\bfocus on (concepts?|definitions?)\b/.test(t)) {
    actions.push({ type: "preset", label: "More concepts", patch: { priority: "concepts" } });
    said.push("concepts given more room");
  } else if (/\breset( the)?( mix| sheet| everything)?\b/.test(t) && t.length < 30) {
    actions.push({ type: "preset", label: "Reset mix", patch: { priority: "balanced", examType: "mixed" } });
    said.push("mix reset");
  }

  // "switch to true/false", "multiple choice mode", "it's a short answer exam"
  if (/\b(exam|format|mode|switch|make it|it'?s an?)\b/.test(t)) {
    const format = /\btrue\s*(\/|or|and)?\s*false\b|\bt\s*\/\s*f\b/.test(t) ? "true-false"
      : /\bmultiple[- ]choice\b|\bmcq\b/.test(t) ? "multiple-choice"
      : /\bshort[- ]answer\b/.test(t) ? "short-answer"
      : /\bproblems?\b|\bproblem[- ]solving\b|\bcalculations?\b/.test(t) ? "problems"
      : /\bmixed\b/.test(t) ? "mixed" : null;
    if (format) {
      actions.push({ type: "format", value: format });
      said.push(`sheet weighted for a ${format.replace("-", " ")} exam (to reword the questions themselves, ask me to rewrite them for that format)`);
    }
  }

  if (/\b(diagrams?|figures?|pictures?|images?)\b/.test(t) && figures.length) {
    if (off && !on) {
      actions.push({ type: "figures-off" });
      said.push("diagrams removed");
    } else if (on && !off) {
      const words = t.split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !/^(diagram|figure|picture|image|show|include|sheet|with|from|that|this|bring|back)s?$/.test(w));
      const match = figures.find((f) => words.some((w) => f.caption.toLowerCase().includes(w)));
      if (match) {
        actions.push({ type: "figure", id: match.id, on: true });
        said.push(`“${match.caption}” placed on the sheet`);
      } else {
        actions.push({ type: "open-diagrams" });
        said.push("here are the diagrams from your files — pick the ones you want");
      }
    }
  }

  if (!actions.length) return { kind: "content" };
  const reply = said.join("; ");
  return { kind: "free", actions, reply: `Done: ${reply}. That was free.` };
}
