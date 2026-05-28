/**
 * verify.ts — the Step 2 gate, in code.
 *
 *   1. The realistic sample MUST parse cleanly.
 *   2. Intentionally bad samples MUST be rejected with the expected
 *      Zod error message — so we know the trust rule is real, not
 *      ceremonial.
 *
 * Run with:  npm run check:contract
 * Exits 0 on all pass, 1 if any case fails.
 */
import { z } from "zod";
import {
  type SheetContent,
  safeParseSheetContent,
  SheetContentSchema,
} from "@/contract/sheet-content";
import { sampleContent } from "./sample-content";

type Case =
  | { kind: "pass"; name: string; input: unknown }
  | { kind: "fail"; name: string; input: unknown; expect: RegExp };

const C = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

function clone<T>(o: T): T {
  return JSON.parse(JSON.stringify(o));
}

/* ── Bad-sample builders (each mutates a clone of the good sample) ─── */

function fakeHighConfNoExamSrc(): unknown {
  const bad = clone(sampleContent);
  // Lying: claim high on something only mentioned once in slides.
  bad.formulas[7] = {
    ...bad.formulas[7], // "z-score (standardisation)" — src: "Slide 16", conf: low
    conf: "high",
    verified: false,
  };
  return bad;
}

function missingRequiredField(): unknown {
  const bad = clone(sampleContent) as unknown as { formulas: { vars?: string }[] };
  delete bad.formulas[0].vars; // formula vars is required
  return bad;
}

function invalidQuestionKind(): unknown {
  const bad = clone(sampleContent) as unknown as {
    questions: { kind: string }[];
  };
  bad.questions[0].kind = "essay"; // not in the enum
  return bad;
}

function unknownTopLevelKey(): unknown {
  const bad = { ...clone(sampleContent), bonusJunk: "should be rejected" };
  return bad;
}

function vagueTrap(): unknown {
  const bad = clone(sampleContent);
  bad.traps[0] = {
    text: "Be careful about z* vs t*.", // vague — no "FALSE/wrong/not"
    src: "Lecture 7",
  };
  return bad;
}

function mismatchedTableRowLength(): unknown {
  const bad = clone(sampleContent);
  bad.tables![0].rows[0] = ["σ known", "z-test"]; // missing 2 cells
  return bad;
}

/* ── Test cases ─────────────────────────────────────────────────────── */

const cases: Case[] = [
  { kind: "pass", name: "realistic intro-stats sample parses cleanly", input: sampleContent },
  {
    kind: "fail",
    name: "REJECTS fake high confidence (single-source, no-exam, no verified)",
    input: fakeHighConfNoExamSrc(),
    expect: /Trust rule.*high.*requires verified=true OR.*exam-grade src/i,
  },
  {
    kind: "fail",
    name: "REJECTS missing required field (formula.vars)",
    input: missingRequiredField(),
    expect: /vars|required|invalid_type/i,
  },
  {
    kind: "fail",
    name: 'REJECTS invalid question kind ("essay")',
    input: invalidQuestionKind(),
    expect: /invalid.*enum|MCQ|short|problem|T\/F/i,
  },
  {
    kind: "fail",
    name: "REJECTS unknown top-level key (.strict)",
    input: unknownTopLevelKey(),
    expect: /unrecognized.*bonusJunk|unrecognized_key/i,
  },
  {
    kind: "fail",
    name: 'REJECTS vague trap ("be careful about X" instead of "X is FALSE")',
    input: vagueTrap(),
    expect: /FALSE|name the falsity|trap text/i,
  },
  {
    kind: "fail",
    name: "REJECTS mismatched table row length",
    input: mismatchedTableRowLength(),
    expect: /row.*cells|cols/i,
  },
];

/* ── Runner ─────────────────────────────────────────────────────────── */

function fmtZodError(err: z.ZodError): string {
  return err.issues
    .map((i) => `    • [${i.path.join(".") || "<root>"}] ${i.message}`)
    .join("\n");
}

let pass = 0;
let fail = 0;

console.log(C.bold("\nSheetContent contract — verify\n"));

for (let i = 0; i < cases.length; i++) {
  const c = cases[i];
  const idx = `[${i + 1}/${cases.length}]`;
  const result = safeParseSheetContent(c.input);

  if (c.kind === "pass") {
    if (result.success) {
      const parsed: SheetContent = result.data;
      console.log(
        `${idx} ${C.green("PASS")}  ${c.name}\n` +
          C.dim(
            `    ${parsed.topics.length} topics · ${parsed.formulas.length} formulas · ` +
              `${parsed.concepts.length} concepts · ${parsed.traps.length} traps · ` +
              `${parsed.questions.length} questions · ${parsed.tables?.length ?? 0} tables · ` +
              `${parsed.verifiedPatterns?.length ?? 0} verifiedPatterns`,
          ),
      );
      pass++;
    } else {
      console.log(`${idx} ${C.red("FAIL")}  ${c.name}`);
      console.log(C.red("    expected: parse success"));
      console.log(C.red("    got: ZodError"));
      console.log(fmtZodError(result.error));
      fail++;
    }
    continue;
  }

  // kind === "fail" — we expect rejection with matching message.
  if (result.success) {
    console.log(`${idx} ${C.red("FAIL")}  ${c.name}`);
    console.log(C.red(`    expected: ZodError matching ${c.expect}`));
    console.log(C.red("    got: parse SUCCESS (bad sample slipped through)"));
    fail++;
  } else {
    const allMsgs = result.error.issues.map((i) => i.message).join(" | ");
    if (c.expect.test(allMsgs)) {
      console.log(`${idx} ${C.green("PASS")}  ${c.name}`);
      console.log(C.dim(`    rejected with: ${result.error.issues[0].message.slice(0, 110)}…`));
      pass++;
    } else {
      console.log(`${idx} ${C.red("FAIL")}  ${c.name}`);
      console.log(C.red(`    expected message matching ${c.expect}`));
      console.log(C.red(`    got:`));
      console.log(fmtZodError(result.error));
      fail++;
    }
  }
}

console.log();
const summary = `${pass}/${cases.length} passed`;
if (fail === 0) {
  console.log(C.green(C.bold(`✓ ${summary}`)));
  // Touch the unused export to silence "imported but never used" if any
  void SheetContentSchema;
  process.exit(0);
} else {
  console.log(C.red(C.bold(`✗ ${summary} (${fail} failed)`)));
  process.exit(1);
}
