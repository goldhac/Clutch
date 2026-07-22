import "@/renderer/density.css";
import "@/renderer/semantics.css";
import "@/renderer/sheet.css";

import Link from "next/link";
import type { Metadata } from "next";
import { LinkButton, Card } from "@/components/ui";
import { ConfDot, VerifiedStar, Citation } from "@/components/trust";
import { Sheet } from "@/components/sheet";
import { sampleContent } from "@samples/sample-content";

export const metadata: Metadata = {
  title: "CramSheet — the one-page cheat sheet that knows what's on the exam",
  description:
    "Upload your slides, review guides, and past exams. Get one dense, printable Exam Reference Sheet that ranks what's most likely tested — every claim scored and sourced.",
};

const STEPS = [
  {
    n: "1",
    title: "Drop your files",
    body: "Slides, review guides, past exams, notes. Tag the heavy hitters — past exams count most.",
  },
  {
    n: "2",
    title: "We rank & verify",
    body: "The engine scores every topic by likelihood, then checks the top ones against your real past exams.",
  },
  {
    n: "3",
    title: "Print one page",
    body: "A single A4 sheet, dense and sourced. Export the PDF, print it, walk into the exam.",
  },
];

const WHY = [
  { h: "Confidence, not vibes.", b: "A calibrated score on every topic." },
  { h: "★ Verified patterns.", b: "Matched to questions on your real past exams." },
  { h: "Cited to the source.", b: "Jump from any claim to the slide it came from." },
];

const TIERS = [
  { name: "Single", price: "$4.99", sub: "One full sheet", cta: "Start free" },
  { name: "3-Pack", price: "$9.99", sub: "Three sheets · $3.33 each", cta: "Get 3-Pack", featured: true },
  { name: "Sprint Pass", price: "$14.99", sub: "Unlimited · 7 days", cta: "Go Sprint" },
];

export default function HomePage() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* faint grid backdrop */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.5]"
          style={{
            backgroundImage:
              "linear-gradient(var(--ink-100) 1px, transparent 1px), linear-gradient(90deg, var(--ink-100) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage: "radial-gradient(ellipse 80% 60% at 50% 30%, #000 40%, transparent 100%)",
          }}
        />
        <div className="relative mx-auto max-w-3xl px-6 pb-8 pt-20 text-center sm:pt-24">
          <span className="inline-flex items-center gap-2 rounded-[var(--r-full)] border border-[var(--ink-200)] bg-white px-3 py-1 text-[13px] text-[var(--ink-600)] shadow-[var(--sh-xs)]">
            <ConfDot conf="high" size={7} /> Every claim scored &amp; sourced
          </span>
          <h1
            className="mt-6 font-serif text-[clamp(2.6rem,6vw,4.25rem)] leading-[1.05] tracking-[-0.02em] text-[var(--ink-900)]"
            style={{ textWrap: "balance" }}
          >
            The one-page cheat sheet that knows what&apos;s on the exam.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[17px] leading-[1.55] text-[var(--ink-600)]">
            Upload your materials. Get a dense, printable Exam Reference Sheet that ranks what&apos;s
            most likely tested — and proves every claim.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <LinkButton href="/generate" size="lg">
              Drop your files
            </LinkButton>
            <LinkButton href="/sheet?density=max" size="lg" variant="secondary">
              See a sample sheet
            </LinkButton>
          </div>
          <p className="mt-4 font-mono text-[12px] text-[var(--ink-400)]">
            Free preview, always · No subscription · $4.99 to unlock a sheet
          </p>
        </div>

        {/* Hero proof: a real MAX sheet, blurred, with one unblurred callout */}
        <div className="relative mx-auto mt-6 max-w-5xl px-6 pb-20">
          <div className="relative overflow-hidden rounded-[var(--r-xl)] border border-[var(--ink-150)] bg-white shadow-[var(--sh-xl)]">
            <div
              className="origin-top scale-[0.62] blur-[2px] sm:scale-[0.78]"
              style={{ height: 340, filter: "blur(2px)" }}
              aria-hidden
            >
              <Sheet content={sampleContent} density="max" />
            </div>
            {/* fade the bottom so it reads as a peek */}
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-24"
              style={{ background: "linear-gradient(transparent, var(--white))" }}
            />
            {/* the one unblurred confidence callout, floating */}
            <div className="absolute left-1/2 top-1/2 w-[min(340px,86%)] -translate-x-1/2 -translate-y-1/2">
              <Card className="!p-4 shadow-[var(--sh-lg)]">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--ink-900)]">
                  <ConfDot conf="high" ring size={9} />
                  <VerifiedStar verified /> Confidence interval — small-sample mean
                </div>
                <p className="mt-1.5 font-mono text-[12px] leading-[1.5] text-[var(--ink-600)]">
                  x̄ ± t*(s/√n), df = n−1
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="rounded-[var(--r-full)] bg-[var(--conf-high-bg)] px-2 py-0.5 font-mono text-[11px] font-semibold text-[var(--conf-high)]">
                    conf .91
                  </span>
                  <Citation src="Lecture 08 s23 · Final '19 Q3" />
                </div>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <section className="border-t border-[var(--ink-150)] bg-white">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="font-serif text-[clamp(1.9rem,4vw,2.6rem)] tracking-[-0.02em] text-[var(--ink-900)]">
            From a pile of files to one page you trust.
          </h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n}>
                <span className="flex h-9 w-9 items-center justify-center rounded-[var(--r-md)] bg-[var(--ink-900)] font-mono text-[14px] font-semibold text-white">
                  {s.n}
                </span>
                <h3 className="mt-4 text-[19px] font-semibold text-[var(--ink-900)]">{s.title}</h3>
                <p className="mt-2 text-[15px] leading-[1.55] text-[var(--ink-600)]">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why we're different (trust layer) ────────────────────────── */}
      <section className="border-t border-[var(--ink-150)]">
        <div className="mx-auto grid max-w-5xl gap-10 px-6 py-20 md:grid-cols-2 md:items-center">
          <div>
            <h2 className="font-serif text-[clamp(1.9rem,4vw,2.6rem)] tracking-[-0.02em] text-[var(--ink-900)]">
              Most tools summarize. We decide — and show our work.
            </h2>
            <ul className="mt-8 space-y-5">
              {WHY.map((w) => (
                <li key={w.h} className="flex gap-3">
                  <span className="mt-1.5 shrink-0">
                    <ConfDot conf="high" size={10} ring />
                  </span>
                  <div>
                    <div className="text-[16px] font-semibold text-[var(--ink-900)]">{w.h}</div>
                    <div className="text-[15px] text-[var(--ink-600)]">{w.b}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          {/* salmon evidence card */}
          <div className="rounded-[var(--r-xl)] border border-[var(--salmon-line)] bg-[var(--salmon)] p-6">
            <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--salmon-text)]">
              ★ Verified Q-pattern
            </div>
            <p className="mt-2 text-[17px] leading-[1.5] text-[var(--ink-900)]">
              &quot;Construct &amp; interpret a 95% CI&quot; — appeared on 3 of the last 4 finals.
            </p>
            <div className="mt-4 flex items-center gap-2 border-t border-[var(--salmon-line)] pt-3">
              <VerifiedStar verified />
              <Citation src="Final '18 Q5 · '20 Q4 · '21 Q5" />
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing preview ──────────────────────────────────────────── */}
      <section className="border-t border-[var(--ink-150)] bg-white">
        <div className="mx-auto max-w-5xl px-6 py-20 text-center">
          <h2 className="font-serif text-[clamp(1.9rem,4vw,2.6rem)] tracking-[-0.02em] text-[var(--ink-900)]">
            Pay for the sheet, not a subscription.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-[15px] text-[var(--ink-500)]">
            Free preview on every sheet. Credits never expire. There&apos;s nothing to cancel.
          </p>
          <div className="mx-auto mt-10 grid max-w-3xl gap-4 sm:grid-cols-3">
            {TIERS.map((t) => (
              <div
                key={t.name}
                className={
                  "rounded-[var(--r-lg)] border bg-white p-5 text-left " +
                  (t.featured
                    ? "border-[var(--ink-900)] shadow-[var(--sh-lg)]"
                    : "border-[var(--ink-150)] shadow-[var(--sh-xs)]")
                }
              >
                {t.featured && (
                  <span className="mb-2 inline-block rounded-[var(--r-full)] bg-[var(--ink-900)] px-2 py-0.5 text-[11px] font-semibold text-white">
                    Best value
                  </span>
                )}
                <div className="text-[15px] font-semibold text-[var(--ink-900)]">{t.name}</div>
                <div className="mt-1 font-serif text-[2rem] text-[var(--ink-900)]">{t.price}</div>
                <div className="mt-1 text-[13px] text-[var(--ink-500)]">{t.sub}</div>
              </div>
            ))}
          </div>
          <div className="mt-8">
            <LinkButton href="/pricing" variant="secondary">
              See full pricing
            </LinkButton>
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────── */}
      <section className="border-t border-[var(--ink-150)]">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h2 className="font-serif text-[clamp(2rem,5vw,3rem)] tracking-[-0.02em] text-[var(--ink-900)]">
            One page. Print it. <span className="text-[var(--signal-600)]">Take it.</span>
          </h2>
          <div className="mt-7">
            <LinkButton href="/generate" size="lg">
              Drop your files
            </LinkButton>
          </div>
          <p className="mt-3 text-[13px] text-[var(--ink-400)]">
            Free preview first — see the sheet before you pay.{" "}
            <Link href="/pricing" className="underline">
              Pricing
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}
