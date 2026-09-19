import assert from "node:assert/strict";
import { scoreItem } from "@/components/sheet/relevance";
const q = (kind: string) => ({ topic: "T", q: "x", a: "y", kind, src: "f p1", conf: "med" });
const ctx = (o: Record<string, unknown>) => ({ files: [], ...o }) as never;
const base = scoreItem(q("problem"), "questions", ctx({ examFormat: "problems", examType: "mixed" }));
const heavy = scoreItem(q("problem"), "questions", ctx({ examFormat: "problems", examType: "problem-solving" }));
const concept = scoreItem(q("problem"), "questions", ctx({ examFormat: "problems", examType: "conceptual" }));
console.log(`problems sheet · problem question: mixed ${base.toFixed(2)} · Problem-heavy ${heavy.toFixed(2)} · Concept-heavy ${concept.toFixed(2)}`);
assert.ok(heavy > base, "Problem-heavy must raise a problem question");
assert.ok(concept < base, "Concept-heavy must lower a problem question");
const mcqBase = scoreItem(q("MCQ"), "questions", ctx({ examFormat: "multiple-choice", examType: "mixed" }));
const mcqProb = scoreItem(q("MCQ"), "questions", ctx({ examFormat: "multiple-choice", examType: "problem-solving" }));
assert.ok(mcqProb < mcqBase, "Problem-heavy must lower an MCQ");
// the format must still outrank the preset
const wanted = scoreItem(q("problem"), "questions", ctx({ examFormat: "problems", examType: "conceptual" }));
const unwanted = scoreItem(q("MCQ"), "questions", ctx({ examFormat: "problems", examType: "conceptual" }));
assert.ok(wanted > unwanted, "the exam's own format stays the stronger signal");
console.log("mix presets: 4 checks passed");
