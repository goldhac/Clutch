import "@/renderer/density.css";
import "@/renderer/semantics.css";
import "@/renderer/sheet.css";

import Link from "next/link";
import type { Metadata } from "next";
import { LinkButton, Reveal } from "@/components/ui";
import { Sheet } from "@/components/sheet";
import { sampleContent } from "@samples/sample-content";

export const metadata: Metadata = {
  title: "Clutch — it decides what's on the exam. Then it proves it.",
  description:
    "Drop in your slides, review guides and past exams. Get one printable page, ranked by what's most likely tested — every line carrying a confidence score and the slide it came from.",
};

/**
 * Marketing home — v2 handoff, option 2a "Photographic: the moment,
 * then the artifact". Ink hero over the corridor photograph, the real
 * sheet cropped and floating off the right edge, the anatomy-of-one-
 * line trust spec, editorial three-up, pricing strip, ink closer.
 */
export default function HomePage() {
  return (
    <>
      {/* ── Hero — the photograph carries the moment, ink scrim the words ── */}
      <section className="relative min-h-[560px] overflow-hidden bg-[var(--ink-900)] lg:min-h-[660px]">
        <img
          src="/photos/corridor.jpg"
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(97deg, rgba(17,17,20,.96) 0%, rgba(17,17,20,.9) 32%, rgba(17,17,20,.42) 68%, rgba(17,17,20,.08) 100%)",
          }}
        />
        <div className="relative mx-auto max-w-[1180px] px-6 pb-24 pt-20 sm:px-10 lg:pt-24">
          <div className="max-w-[560px]">
            <Reveal>
              <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-400)]">
                48 hours out
              </div>
            </Reveal>
            <Reveal delay={80}>
              <h1
                className="mt-5 font-serif text-[clamp(2.75rem,6.5vw,4.5rem)] leading-[1] tracking-[-0.03em] text-white"
                style={{ textWrap: "balance" }}
              >
                It decides what&apos;s on the exam. Then it proves it.
              </h1>
            </Reveal>
            <Reveal delay={150}>
              <p
                className="mt-6 max-w-[44ch] text-[17px] leading-[1.6] text-[var(--ink-300)]"
                style={{ textWrap: "pretty" }}
              >
                Drop in your slides, review guides and past exams. Get one printable page, ranked
                by what&apos;s most likely tested — every line carrying a confidence score and the
                slide it came from.
              </p>
            </Reveal>
            <Reveal delay={220}>
              <div className="mt-8 flex flex-wrap items-center gap-3.5">
                <LinkButton href="/generate" variant="inverse" size="xl" className="!px-6">
                  Drop your files
                </LinkButton>
                <LinkButton href="/results?g=mis-final&tier=free" variant="ghostDark" size="xl">
                  See a real sheet
                </LinkButton>
              </div>
              <div className="mt-5 flex items-center gap-3.5 font-mono text-[12px] text-[var(--ink-500)]">
                <span>free preview</span>
                <span aria-hidden className="text-[#3a3a44]">·</span>
                <span>no subscription</span>
                <span aria-hidden className="text-[#3a3a44]">·</span>
                <span>$4.99 to unlock</span>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── The output — left reads, the real sheet floats off the edge ── */}
      <section className="overflow-hidden border-t border-[var(--ink-150)] bg-[var(--paper)]">
        <div className="mx-auto grid max-w-[1180px] items-center gap-10 px-6 py-16 sm:px-10 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:gap-14 lg:py-[92px] lg:pr-0">
          <Reveal>
            <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-500)]">
              The output
            </div>
            <h2
              className="mt-4 font-serif text-[clamp(2rem,4vw,2.75rem)] leading-[1.06] tracking-[-0.025em] text-[var(--ink-900)]"
              style={{ textWrap: "balance" }}
            >
              Read it at a glance. Print it at 100%.
            </h2>
            <p className="mt-5 text-[16px] leading-[1.65] text-[var(--ink-600)]" style={{ textWrap: "pretty" }}>
              Seven topic colours, a confidence dot on every line, and the slide it came from
              printed underneath. Nothing on the page is decoration — if it takes ink, it earns it.
            </p>
            <div className="mt-8 border-t border-[var(--ink-900)]">
              {(
                [
                  ["Format", "A4 landscape · borderless"],
                  ["Density", "131 items · 7 topics"],
                  ["Provenance", "every line cites a slide"],
                ] as const
              ).map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-baseline justify-between gap-4 border-b border-[var(--ink-150)] py-[11px]"
                >
                  <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-500)]">
                    {k}
                  </span>
                  <span className="font-mono text-[12px] text-[var(--ink-600)]">{v}</span>
                </div>
              ))}
            </div>
            <Link
              href="/results?g=mis-final&tier=free"
              className="group mt-6 inline-flex items-center gap-2.5 text-[15px] font-semibold text-[var(--ink-900)]"
            >
              <span className="border-b border-[var(--ink-900)] pb-0.5">See the whole page</span>
              <span aria-hidden className="text-[var(--ink-400)] transition-transform duration-[160ms] ease-[var(--ease-out)] group-hover:translate-x-1">
                →
              </span>
            </Link>
          </Reveal>

          <Reveal delay={120} className="relative">
            <div className="relative h-[380px] sm:h-[480px] lg:h-[568px]">
              <div className="absolute left-0 top-0 h-full w-[920px] max-w-none overflow-hidden rounded-[10px] border border-[var(--ink-150)] bg-white shadow-[var(--sh-lifted)]">
                <div className="absolute left-0 top-0 w-[1122px] origin-top-left scale-100 lg:scale-[1.42]">
                  <Sheet content={sampleContent} density="max" />
                </div>
              </div>
              <span className="absolute -bottom-8 left-0 font-mono text-[11px] text-[var(--ink-500)]">
                the real sheet, cropped — the page runs on past the edge
              </span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── What goes in — the photo carries it, no headline ────────────── */}
      <section className="relative h-[320px] overflow-hidden border-y border-[var(--ink-150)] bg-[var(--field)]">
        <img
          src="/photos/paper-pile.jpg"
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, rgba(251,251,250,.97) 0%, rgba(251,251,250,.86) 34%, rgba(251,251,250,0) 66%)",
          }}
        />
        <div className="relative mx-auto max-w-[1180px] px-6 py-16 sm:px-10">
          <Reveal className="max-w-[420px]">
            <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-500)]">
              What goes in
            </div>
            <p className="mt-3.5 text-[19px] leading-[1.5] text-[var(--ink-900)]" style={{ textWrap: "pretty" }}>
              A typical pack is nine files and about 200 pages. An image-only scan gets flagged,
              not guessed at.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── Anatomy of one line — the ownable trust-layer section ──────── */}
      <section className="bg-[var(--paper)]">
        <div className="mx-auto max-w-[1180px] px-6 py-16 sm:px-10 lg:py-24">
          <Reveal>
            <div className="flex flex-col justify-between gap-6 border-b border-[var(--ink-900)] pb-5 lg:flex-row lg:items-end lg:gap-10">
              <div>
                <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-500)]">
                  Anatomy of one line
                </div>
                <h2 className="mt-3.5 max-w-[26ch] font-serif text-[clamp(2rem,4vw,2.75rem)] leading-[1.08] tracking-[-0.025em] text-[var(--ink-900)]">
                  Every claim carries its receipt.
                </h2>
              </div>
              <p className="max-w-[38ch] text-[15px] leading-[1.65] text-[var(--ink-600)]" style={{ textWrap: "pretty" }}>
                Other tools hand you a summary and ask you to trust it. Clutch prints the score,
                the star and the source on every line — two seconds to check, and the wondering
                stops.
              </p>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <div className="border border-t-0 border-[var(--ink-150)] bg-white">
              {/* the specimen */}
              <div className="border-b border-[var(--ink-150)] bg-[var(--paper)] px-6 py-10 sm:px-14 sm:py-12">
                <div className="mx-auto max-w-[760px]">
                  <div className="flex items-center gap-3.5">
                    <span
                      aria-hidden
                      className="inline-block h-3 w-3 shrink-0 rounded-full bg-[var(--conf-high)]"
                      style={{ boxShadow: "0 0 0 4px var(--conf-high-bg)" }}
                    />
                    <span aria-hidden className="text-[18px] text-[var(--verified)]">★</span>
                    <span className="text-[19px] font-semibold tracking-[-0.015em] text-[var(--ink-900)] sm:text-[22px]">
                      SQL SELECT with implicit join
                    </span>
                  </div>
                  <div className="mt-4 overflow-x-auto rounded-[4px] bg-[#1c2030] px-3.5 py-3 font-mono text-[13px] leading-[1.6] text-[#e6e9f0]">
                    SELECT t1.col, t2.col FROM table1 t1, table2 t2 WHERE t1.key = t2.key AND
                    [conditions];
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-3.5">
                    <span className="rounded-full bg-[var(--conf-high-bg)] px-2.5 py-[3px] font-mono text-[12px] font-semibold text-[var(--conf-high)]">
                      conf high
                    </span>
                    <span className="font-mono text-[12px] text-[var(--ink-500)]">
                      lecture-databases-slides.pptx · Slide 21
                    </span>
                  </div>
                </div>
              </div>
              {/* the annotation table */}
              <div className="grid sm:grid-cols-3">
                <div className="border-b border-[var(--ink-150)] p-7 sm:border-b-0 sm:border-r sm:p-8">
                  <div className="flex items-center gap-2.5">
                    <span
                      aria-hidden
                      className="inline-block h-[9px] w-[9px] rounded-full bg-[var(--conf-high)]"
                      style={{ boxShadow: "0 0 0 3px var(--conf-high-bg)" }}
                    />
                    <span className="font-mono text-[11px] font-semibold tracking-[0.06em] text-[var(--ink-500)]">
                      01 · SCORE
                    </span>
                  </div>
                  <p className="mt-3 text-[14px] leading-[1.65] text-[var(--ink-600)]" style={{ textWrap: "pretty" }}>
                    Green above 80%, gold 50–79%, red below. Calibrated — and the contract rejects
                    a fake high.
                  </p>
                </div>
                <div className="border-b border-[var(--ink-150)] p-7 sm:border-b-0 sm:border-r sm:p-8">
                  <div className="flex items-center gap-2.5">
                    <span aria-hidden className="text-[13px] text-[var(--verified)]">★</span>
                    <span className="font-mono text-[11px] font-semibold tracking-[0.06em] text-[var(--ink-500)]">
                      02 · VERIFIED
                    </span>
                  </div>
                  <p className="mt-3 text-[14px] leading-[1.65] text-[var(--ink-600)]" style={{ textWrap: "pretty" }}>
                    The star appears only when a past exam in your own pack asked this. Stripped
                    automatically if the file was image-only.
                  </p>
                </div>
                <div className="p-7 sm:p-8">
                  <div className="flex items-center gap-2.5">
                    <span aria-hidden className="font-mono text-[11px] text-[var(--ink-300)]">s21</span>
                    <span className="font-mono text-[11px] font-semibold tracking-[0.06em] text-[var(--ink-500)]">
                      03 · SOURCE
                    </span>
                  </div>
                  <p className="mt-3 text-[14px] leading-[1.65] text-[var(--ink-600)]" style={{ textWrap: "pretty" }}>
                    Slide 21 of your databases deck, and the past question that used it. Go check
                    it yourself.
                  </p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── How it works — editorial three-up on the ranking rules ─────── */}
      <section className="border-t border-[var(--ink-150)] bg-white">
        <div className="mx-auto max-w-[1180px] px-6 py-16 sm:px-10 lg:py-[88px]">
          <Reveal>
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end lg:gap-10">
              <h2 className="max-w-[20ch] font-serif text-[clamp(1.9rem,3.5vw,2.5rem)] leading-[1.1] tracking-[-0.02em] text-[var(--ink-900)]">
                Ranked by likelihood. Checked against your own past exams.
              </h2>
              <span className="pb-2 font-mono text-[11px] text-[var(--ink-500)]">
                typically 40–90 seconds
              </span>
            </div>
          </Reveal>
          <div className="mt-11 grid border-t border-[var(--ink-900)] sm:grid-cols-3">
            <Reveal delay={0} className="border-b border-[var(--ink-150)] py-7 sm:border-b-0 sm:border-r sm:pr-8">
              <div className="font-mono text-[11px] font-semibold text-[var(--ink-500)]">01</div>
              <h3 className="mt-3.5 text-[20px] font-semibold tracking-[-0.01em] text-[var(--ink-900)]">
                Drop and tag
              </h3>
              <p className="mt-2.5 text-[15px] leading-[1.6] text-[var(--ink-600)]" style={{ textWrap: "pretty" }}>
                Slides, review guides, notes, past exams. Tag the past exams — they carry the most
                weight in the ranking.
              </p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-[var(--ink-100)] px-2.5 py-1 text-[12px] font-medium text-[var(--ink-700)]">Slides</span>
                <span className="rounded-full bg-[var(--salmon)] px-2.5 py-1 text-[12px] font-medium text-[var(--salmon-text)]">★ Past exam</span>
                <span className="rounded-full bg-[var(--ink-100)] px-2.5 py-1 text-[12px] font-medium text-[var(--ink-700)]">Review guide</span>
              </div>
            </Reveal>
            <Reveal delay={70} className="border-b border-[var(--ink-150)] py-7 sm:border-b-0 sm:border-r sm:px-8">
              <div className="font-mono text-[11px] font-semibold text-[var(--ink-500)]">02</div>
              <h3 className="mt-3.5 text-[20px] font-semibold tracking-[-0.01em] text-[var(--ink-900)]">
                Ranked, then checked
              </h3>
              <p className="mt-2.5 text-[15px] leading-[1.6] text-[var(--ink-600)]" style={{ textWrap: "pretty" }}>
                Every topic is scored for likely testability, then the top of the list is matched
                against the questions your professor actually asked.
              </p>
              <div className="mt-4">
                <div className="flex justify-between text-[12px] text-[var(--ink-500)]">
                  <span>Confidence in result</span>
                  <span className="font-mono font-medium text-[var(--ink-800)]">91%</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--ink-150)]">
                  <div
                    className="h-full w-[91%] rounded-full"
                    style={{ background: "linear-gradient(90deg, var(--conf-med), var(--conf-high))" }}
                  />
                </div>
              </div>
            </Reveal>
            <Reveal delay={140} className="py-7 sm:pl-8">
              <div className="font-mono text-[11px] font-semibold text-[var(--ink-500)]">03</div>
              <h3 className="mt-3.5 text-[20px] font-semibold tracking-[-0.01em] text-[var(--ink-900)]">
                Printed, not clipped
              </h3>
              <p className="mt-2.5 text-[15px] leading-[1.6] text-[var(--ink-600)]" style={{ textWrap: "pretty" }}>
                The layout is measured, not guessed. One A4 page comes out full, nothing cut off —
                front and back if you want more.
              </p>
              <div className="mt-4 inline-flex items-center gap-2 rounded-[var(--r-md)] border border-[var(--conf-high)]/25 bg-[var(--conf-high-bg)] px-2.5 py-[7px] text-[12px] font-medium text-[var(--conf-high)]">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                Fits at MAX · verified
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Pricing strip ──────────────────────────────────────────────── */}
      <section className="border-t border-[var(--ink-150)] bg-[var(--paper)]">
        <div className="mx-auto max-w-[1180px] px-6 py-16 sm:px-10 lg:py-[88px]">
          <Reveal>
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end lg:gap-10">
              <h2 className="max-w-[22ch] font-serif text-[clamp(1.9rem,3.5vw,2.5rem)] leading-[1.1] tracking-[-0.02em] text-[var(--ink-900)]">
                Pay for the sheet. Never a subscription.
              </h2>
              <span className="pb-2 font-mono text-[11px] text-[var(--ink-500)]">
                credits never expire · nothing to cancel
              </span>
            </div>
          </Reveal>
          <div className="mt-10 grid gap-5 sm:grid-cols-3">
            <Reveal delay={0}>
              <Link href="/pricing" className="block rounded-[12px] border border-[var(--ink-150)] bg-white p-7 transition-[transform,box-shadow,border-color] duration-200 ease-[var(--ease-out)] hover:-translate-y-0.5 hover:border-[var(--ink-300)] hover:shadow-[var(--sh-md)]">
                <div className="text-[14px] font-semibold text-[var(--ink-900)]">Single</div>
                <div className="mt-3 font-serif text-[44px] leading-none text-[var(--ink-900)]">$4.99</div>
                <div className="mt-2.5 text-[14px] text-[var(--ink-500)]">One full sheet, one credit.</div>
                <div className="mt-5 font-mono text-[11px] text-[var(--ink-500)]">$4.99 / sheet</div>
              </Link>
            </Reveal>
            <Reveal delay={70}>
              <Link href="/pricing" className="block rounded-[12px] border border-[var(--ink-900)] bg-white p-7 shadow-[var(--sh-lg)] transition-[transform,box-shadow] duration-200 ease-[var(--ease-out)] hover:-translate-y-0.5">
                <div className="flex items-center gap-2.5">
                  <span className="text-[14px] font-semibold text-[var(--ink-900)]">3-Pack</span>
                  <span className="rounded-full bg-[var(--ink-900)] px-2 py-0.5 text-[11px] font-semibold text-white">Best value</span>
                </div>
                <div className="mt-3 font-serif text-[44px] leading-none text-[var(--ink-900)]">$9.99</div>
                <div className="mt-2.5 text-[14px] text-[var(--ink-500)]">Three sheets. One midterm season.</div>
                <div className="mt-5 font-mono text-[11px] text-[var(--ink-500)]">$3.33 / sheet</div>
              </Link>
            </Reveal>
            <Reveal delay={140}>
              <Link href="/pricing" className="block rounded-[12px] border border-[var(--ink-150)] bg-white p-7 transition-[transform,box-shadow,border-color] duration-200 ease-[var(--ease-out)] hover:-translate-y-0.5 hover:border-[var(--ink-300)] hover:shadow-[var(--sh-md)]">
                <div className="text-[14px] font-semibold text-[var(--ink-900)]">Sprint Pass</div>
                <div className="mt-3 font-serif text-[44px] leading-none text-[var(--ink-900)]">$14.99</div>
                <div className="mt-2.5 text-[14px] text-[var(--ink-500)]">Unlimited for 7 days, priority queue.</div>
                <div className="mt-5 font-mono text-[11px] text-[var(--ink-500)]">finals week</div>
              </Link>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Closer — ink, the 2am desk under a diagonal mask ───────────── */}
      <section className="relative overflow-hidden bg-[var(--ink-900)]">
        <div
          aria-hidden
          className="absolute bottom-0 right-0 top-0 hidden w-[58%] lg:block"
          style={{
            maskImage: "linear-gradient(95deg, transparent 2%, rgba(0,0,0,.85) 38%, #000 72%)",
            WebkitMaskImage: "linear-gradient(95deg, transparent 2%, rgba(0,0,0,.85) 38%, #000 72%)",
          }}
        >
          <img src="/photos/desk-2am.jpg" alt="" className="h-full w-full object-cover" />
        </div>
        <div className="relative mx-auto max-w-[1180px] px-6 pb-24 pt-24 sm:px-10 lg:pb-[116px] lg:pt-32">
          <div className="max-w-[560px]">
            <Reveal>
              <h2 className="max-w-[16ch] font-serif text-[clamp(2.75rem,6.5vw,4.5rem)] leading-[1] tracking-[-0.03em] text-white">
                One page. Print it. Take it.
              </h2>
            </Reveal>
            <Reveal delay={90}>
              <p className="mt-6 max-w-[42ch] text-[16px] leading-[1.65] text-[var(--ink-300)]">
                Free preview on every sheet — you see the real thing, at full density, before you
                pay for it.
              </p>
              <div className="mt-9 flex items-center gap-5">
                <LinkButton href="/generate" variant="inverse" size="xl" className="!px-6">
                  Drop your files
                </LinkButton>
                <span className="font-mono text-[11px] text-[var(--ink-500)]">
                  no account needed to preview
                </span>
              </div>
            </Reveal>
          </div>
        </div>
        {/* The global Footer renders directly below and merges into this block. */}
      </section>
    </>
  );
}
