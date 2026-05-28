/**
 * sample-content.ts — a realistic intro-stats SheetContent used to
 * drive the renderer in Steps 3–5 (before the engine exists).
 *
 * Pretends a past midterm was supplied (so we exercise the
 * verifiedPatterns path and the ★ exam-verified prefix).
 *
 * Sourced from canonical intro-stats material; mixed-confidence items
 * with realistic citations so the trust layer has something to render.
 */
import type { SheetContent } from "@/contract/sheet-content";

export const sampleContent: SheetContent = {
  title: "Intro Statistics — Midterm 1 Reference Sheet",

  examFormat: {
    mix: "8 MCQ (40%) · 4 short answer (40%) · 2 problems (20%)",
    time: "75 minutes",
    openBook: false,
    notes: "Formula sheet, z-table, and t-table provided. No calculators with CAS.",
  },

  // Surfaced FIRST in the sheet — the highest-leverage block when a
  // past exam is in the pack. (Output spec §7 / Build Plan §A.8.)
  verifiedPatterns: [
    {
      pattern:
        "Construct a 95% CI from given x̄, s, n — show the t* lookup and the half-width",
      src: "Past midterm 2024 Q3",
    },
    {
      pattern:
        "Pick the right test (z vs t vs two-sample) from a worded scenario; explain the choice in one line",
      src: "Past final 2023 Q5",
    },
    {
      pattern: "MCQ: identify the FALSE interpretation of a p-value",
      src: "Past midterm 2024 Q7",
    },
  ],

  topics: [
    {
      name: "Confidence intervals",
      why: "The core inference move. Every midterm has 1–2 CI builds + 1 interpretation Q.",
      src: "Past midterm 2024 Q3; Review p2",
      conf: "high",
      verified: true,
    },
    {
      name: "Hypothesis testing (one-sample)",
      why: "Pick the test → state H₀/H₁ → compute stat → compare to critical or p-value → conclude.",
      src: "Past midterm 2024 Q5",
      conf: "high",
      verified: true,
    },
    {
      name: "Linear regression basics",
      why: "Slope/intercept interpretation, R², and one residual-reading question.",
      src: "Review p5; HW4 Q2; HW5 Q1",
      conf: "med",
    },
    {
      name: "Sampling distributions + CLT",
      why: "Conceptual MCQs; one short-answer asking why we can use Normal for large n.",
      src: "Lecture 6; Review p3",
      conf: "med",
    },
    {
      name: "Common distributions",
      why: "Normal, t (with df), binomial — recognise shape + when to use which.",
      src: "Slides 14–18",
      conf: "low",
    },
  ],

  formulas: [
    {
      name: "CI for mean — σ unknown (the workhorse)",
      formula: "x̄ ± t*(s/√n),  df = n − 1",
      vars: "x̄ sample mean · s sample SD · n size · t* from t-table at df, conf level",
      when: "σ unknown AND any n (use Normal-shape assumption for small n)",
      trap: "NOT z* here — that's only when σ is known (rare in practice)",
      ex: "n=10, x̄=50, s=4, 95% CI: t*=2.262 → 50 ± 2.86 → (47.14, 52.86)",
      src: "Past midterm 2024 Q3",
      conf: "high",
      verified: true,
    },
    {
      name: "CI for mean — σ known",
      formula: "x̄ ± z*(σ/√n)",
      vars: "x̄ mean · σ known pop SD · n size · z* from z-table",
      when: "σ known (textbook-only most of the time)",
      trap: "If σ unknown but n large, use t* — the prof prefers t* throughout",
      ex: "n=100, x̄=50, σ=4, 95% CI: z*=1.96 → 50 ± 0.78 → (49.22, 50.78)",
      src: "Review p2",
      conf: "med",
    },
    {
      name: "CI for proportion",
      formula: "p̂ ± z*·√(p̂(1−p̂)/n)",
      vars: "p̂ sample proportion · n size · z* from z-table at conf level",
      when: "np̂ ≥ 10 AND n(1−p̂) ≥ 10 (success-failure condition)",
      trap: "Use p̂, NOT 0.5 — 0.5 only goes in the planning/sample-size formula",
      ex: "n=400, p̂=0.55, 95%: 0.55 ± 1.96·0.0249 → (0.501, 0.599)",
      src: "Past final 2023 Q4",
      conf: "high",
      verified: true,
    },
    {
      name: "z-test statistic",
      formula: "z = (x̄ − μ₀) / (σ/√n)",
      vars: "x̄ sample mean · μ₀ null mean · σ known SD · n size",
      when: "σ known (rare)",
      trap: "Two-sided p-value is 2·P(Z>|z|) — don't forget the 2× for two-sided",
      ex: "x̄=52, μ₀=50, σ=4, n=25 → z = 2/0.8 = 2.5, two-sided p ≈ 0.012",
      src: "Lecture 7; Review p4",
      conf: "med",
    },
    {
      name: "t-test statistic (one-sample)",
      formula: "t = (x̄ − μ₀) / (s/√n),  df = n − 1",
      vars: "x̄ mean · μ₀ null · s sample SD · n size",
      when: "σ unknown (default in practice)",
      trap: "Compare to t-critical at df, NOT z-critical — different table",
      ex: "x̄=52, μ₀=50, s=4, n=25 → t = 2.5, df=24, two-sided p ≈ 0.020",
      src: "Past midterm 2024 Q5",
      conf: "high",
      verified: true,
    },
    {
      name: "Two-sample t-test (unequal var, Welch)",
      formula: "t = (x̄₁ − x̄₂) / √(s₁²/n₁ + s₂²/n₂)",
      vars: "x̄ᵢ means · sᵢ SDs · nᵢ sizes",
      when: "Compare two independent group means; do NOT assume equal variances",
      trap: "Pooled-variance version is on the formula sheet but Welch is the safer default",
      ex: "Two classes: x̄₁=80,s₁=10,n₁=30 vs x̄₂=75,s₂=12,n₂=25 → t ≈ 1.69",
      src: "Review p4; HW3 Q4",
      conf: "med",
    },
    {
      name: "Standard error of the mean",
      formula: "SE(x̄) = σ/√n   (or s/√n if σ unknown)",
      vars: "σ or s · n size",
      when: "Anywhere a sampling distribution shows up",
      trap: "SE ≠ SD — SE shrinks with n, SD does not",
      ex: "σ=10, n=100 → SE = 1. Sampling dist of x̄ is much tighter than data dist.",
      src: "Lecture 6; Review p3",
      conf: "med",
    },
    {
      name: "z-score (standardisation)",
      formula: "z = (x − μ) / σ",
      vars: "x raw · μ mean · σ SD",
      when: "Convert any Normal value to standard Normal for table lookup",
      trap: "For a sample MEAN use SE in the denominator, NOT σ",
      ex: "x=70, μ=60, σ=5 → z = 2.0 → 97.7th percentile",
      src: "Slide 16",
      conf: "low",
    },
    {
      name: "Linear regression slope",
      formula: "b = r · (s_y / s_x)",
      vars: "r correlation · s_y/s_x SDs of y and x",
      when: "Given r and the two SDs (common short-answer setup)",
      trap: "Sign of b matches sign of r — a negative r forces a negative slope",
      ex: "r=0.6, s_y=10, s_x=2 → b = 3.0; one-unit x increase ↑ y by 3 units (on average)",
      src: "Past final 2023 Q8",
      conf: "high",
      verified: true,
    },
    {
      name: "R² (coefficient of determination)",
      formula: "R² = SSR/SST  =  1 − SSE/SST   (simple regression: R² = r²)",
      vars: "SSR explained · SSE residual · SST total",
      when: "Reporting how much of y's variance the model explains",
      trap: "High R² does NOT mean causation — only that the line fits these data well",
      ex: "r = 0.6 → R² = 0.36 → 36% of variation in y explained by x",
      src: "Review p5; HW5 Q1",
      conf: "med",
    },
  ],

  concepts: [
    {
      term: "p-value",
      def: "Probability of seeing data this extreme (or more) ASSUMING H₀ is true. NOT the probability H₀ is true.",
      src: "Past midterm 2024 Q7",
      conf: "high",
      verified: true,
    },
    {
      term: "Type I error (α)",
      def: "Rejecting H₀ when it is actually true. α is the rate we tolerate (usually 0.05).",
      src: "Lecture 7; Review p4",
      conf: "med",
    },
    {
      term: "Type II error (β)",
      def: "Failing to reject H₀ when it is actually false. Power = 1 − β.",
      src: "Lecture 7",
      conf: "low",
    },
    {
      term: "Significance level (α)",
      def: "Threshold for rejecting H₀: reject when p ≤ α.",
      src: "Slides 19–21",
      conf: "low",
    },
    {
      term: "Degrees of freedom (df)",
      def: "For one-sample t, df = n − 1. For two-sample Welch, df is a messy fraction (software uses it).",
      src: "Review p4",
      conf: "med",
    },
    {
      term: "Central Limit Theorem (CLT)",
      def: "Sampling distribution of x̄ approaches Normal as n grows, regardless of population shape (rule of thumb n ≥ 30).",
      src: "Past final 2023 Q2",
      conf: "high",
      verified: true,
    },
    {
      term: "Confidence level",
      def: "Long-run % of CIs that capture the true parameter — NOT the prob the true value is in THIS interval.",
      src: "Past midterm 2024 Q3",
      conf: "high",
      verified: true,
    },
  ],

  tables: [
    {
      title: "z-test vs t-test — when to use which",
      cols: ["Condition", "Use", "Stat", "Distribution"],
      rows: [
        ["σ known (rare)", "z-test", "(x̄ − μ₀)/(σ/√n)", "Standard Normal"],
        ["σ unknown, any n", "t-test", "(x̄ − μ₀)/(s/√n)", "t with df = n − 1"],
        ["Two groups, indep.", "Welch t-test", "(x̄₁ − x̄₂)/√(s₁²/n₁ + s₂²/n₂)", "t with messy df"],
        ["Proportion", "z-test for p̂", "(p̂ − p₀)/√(p₀(1−p₀)/n)", "Standard Normal"],
      ],
      src: "Past final 2023 Q5",
    },
  ],

  traps: [
    {
      text: "“Use z* when σ is unknown” → FALSE — use t* with df = n − 1.",
      src: "Past midterm 2024 Q5",
    },
    {
      text:
        "“The p-value is the probability H₀ is true” → FALSE — it is the prob of data this extreme ASSUMING H₀.",
      src: "Past midterm 2024 Q7",
    },
    {
      text:
        "“A 95% CI means there is a 95% probability the true mean is in this interval” → FALSE — the true mean is fixed; 95% is the long-run capture rate.",
      src: "Past midterm 2024 Q3",
    },
    {
      text:
        "“High R² implies x causes y” → FALSE — only association; causation needs a designed experiment.",
      src: "Review p5",
    },
    {
      text:
        "“Failing to reject H₀ means H₀ is true” → FALSE — only that we lack evidence to reject.",
      src: "Lecture 7",
    },
    {
      text: "“SE = SD” → FALSE — SE = SD/√n; SE shrinks with n, SD does not.",
      src: "Review p3",
    },
  ],

  questions: [
    {
      q: "Build a 95% CI for μ given n=16, x̄=22.0, s=3.0. (Look up t*₀.₀₂₅,₁₅ = 2.131.)",
      kind: "problem",
      src: "Past midterm 2024 Q3",
      conf: "high",
      verified: true,
    },
    {
      q: "When do you use z* vs t* for a confidence interval for a mean? One sentence.",
      kind: "short",
      src: "Past final 2023 Q5",
      conf: "high",
      verified: true,
    },
    {
      q:
        "Test H₀: μ = 50 vs H₁: μ ≠ 50 with x̄=52, s=4, n=25, α=0.05. State decision and one-line reason.",
      kind: "problem",
      src: "Past midterm 2024 Q5",
      conf: "high",
      verified: true,
    },
    {
      q: "p-value < α implies we reject H₀. (T/F)",
      kind: "T/F",
      src: "Slides 19–21",
      conf: "low",
    },
    {
      q: "Which interpretation of a p-value is correct? (MCQ-style — name the one TRUE option.)",
      kind: "MCQ",
      src: "Past midterm 2024 Q7",
      conf: "high",
      verified: true,
    },
    {
      q: "Why is a 99% CI wider than a 95% CI? One sentence.",
      kind: "short",
      src: "Review p2; HW2 Q3",
      conf: "med",
    },
    {
      q:
        "Given r=0.6, s_y=10, s_x=2, find the regression slope b and interpret it in plain English.",
      kind: "problem",
      src: "Past final 2023 Q8",
      conf: "high",
      verified: true,
    },
  ],
};
