"use client";

import { useState } from "react";
import { LinkButton, Reveal } from "@/components/ui";

/**
 * /faq — v2 handoff "How it works": three-step strip over an ink rule,
 * hairline question list (first open by default, expand-all toggle),
 * iris-CTA ink closer card. The trust layer explained in prose.
 */
const FAQS = [
  {
    q: "Is this actually a cheat sheet?",
    a: "It's an exam reference sheet — a single dense page you're allowed to bring when your professor permits notes. Check your exam rules; we make the page, you decide how to use it.",
  },
  {
    q: "How does it know what's on the exam?",
    a: "It reads everything you upload, ranks each topic by how likely it is to be tested, then verifies the top items against patterns in your past exams. Every ranking shows its confidence and its source.",
  },
  {
    q: "What files can I upload?",
    a: "PDF, PPTX, TXT and MD — slides, review guides, past exams, and notes. Past exams carry the most weight. Image-only slides and scans get read by vision automatically.",
  },
  {
    q: "Do credits expire?",
    a: "Never. Single and 3-Pack credits sit in your account until you use them. The Sprint Pass is the only time-boxed option — unlimited sheets for 7 days.",
  },
  {
    q: "Is there a subscription?",
    a: "No. There is no monthly plan anywhere in Clutch. You pay once for what you need, and that's it.",
  },
  {
    q: "What if the sheet is wrong?",
    a: "Every claim is cited so you can check it against the source in one glance. If generation fails, your credit is refunded automatically.",
  },
];

export default function FaqPage() {
  const [open, setOpen] = useState<number[]>([0]);
  const allOpen = open.length === FAQS.length;

  function toggle(i: number) {
    setOpen((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));
  }

  return (
    <div className="bg-[var(--paper)]">
      <div className="mx-auto max-w-[1040px] px-6 pb-24 pt-16 sm:px-8 lg:pt-[88px]">
        <Reveal>
          <h1
            className="max-w-[22ch] font-serif text-[clamp(2.5rem,6vw,4rem)] leading-[1] tracking-[-0.035em] text-[var(--ink-900)]"
            style={{ textWrap: "balance" }}
          >
            How it works.
          </h1>
          <p className="mt-6 max-w-[52ch] text-[17px] leading-[1.6] text-[var(--ink-600)]" style={{ textWrap: "pretty" }}>
            The short version: upload your materials, we rank what&apos;s most likely tested and
            prove every claim, you print one page.
          </p>
        </Reveal>

        {/* three steps */}
        <div className="mt-16 grid gap-8 border-t border-[var(--ink-900)] pt-[26px] sm:grid-cols-3">
          {(
            [
              ["01", "Drop the pack", "Slides, review guides, notes and past exams. Everything gets read; past exams count most."],
              ["02", "It ranks, then proves", "Each item gets a confidence score and a source. A star means a past exam in your own pack asked it."],
              ["03", "Print one page", "Fitted to a single A4 sheet and clip-verified before you see it. The front page is free."],
            ] as const
          ).map(([n, title, body], i) => (
            <Reveal key={n} delay={i * 70}>
              <div className="font-mono text-[11px] font-semibold tracking-[0.08em] text-[var(--ink-500)]">
                {n}
              </div>
              <div className="mt-3 text-[16px] font-semibold tracking-[-0.01em] text-[var(--ink-900)]">
                {title}
              </div>
              <p className="mt-2 text-[14px] leading-[1.6] text-[var(--ink-600)]" style={{ textWrap: "pretty" }}>
                {body}
              </p>
            </Reveal>
          ))}
        </div>

        {/* questions */}
        <div className="mt-20 max-w-[720px]">
          <div className="flex items-baseline justify-between gap-5 border-b border-[var(--ink-900)] pb-3.5">
            <h2 className="font-serif text-[32px] leading-[1.08] tracking-[-0.025em] text-[var(--ink-900)]">
              Questions
            </h2>
            <button
              type="button"
              onClick={() => setOpen(allOpen ? [] : FAQS.map((_, i) => i))}
              className="shrink-0 font-mono text-[11px] text-[var(--signal-600)] hover:underline"
            >
              {allOpen ? "collapse all" : "expand all"}
            </button>
          </div>
          {FAQS.map((f, i) => {
            const isOpen = open.includes(i);
            return (
              <div key={f.q} className="border-b border-[var(--ink-150)]">
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-start justify-between gap-5 py-[22px] text-left"
                >
                  <span
                    className={`text-[16.5px] tracking-[-0.01em] transition-colors duration-[160ms] ${
                      isOpen ? "font-semibold text-[var(--ink-900)]" : "font-medium text-[var(--ink-700)]"
                    }`}
                  >
                    {f.q}
                  </span>
                  <span
                    aria-hidden
                    className="mt-0.5 shrink-0 font-mono text-[15px] text-[var(--ink-400)] transition-transform duration-200 ease-[var(--ease-out)]"
                    style={{ transform: isOpen ? "rotate(45deg)" : "none" }}
                  >
                    +
                  </span>
                </button>
                <div
                  className="grid transition-[grid-template-rows] duration-200 ease-[var(--ease-out)]"
                  style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
                >
                  <div className="overflow-hidden">
                    <p className="-mt-1.5 max-w-[60ch] pb-6 text-[15px] leading-[1.65] text-[var(--ink-600)]" style={{ textWrap: "pretty" }}>
                      {f.a}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* closer */}
        <Reveal>
          <div className="mt-[72px] flex max-w-[720px] flex-wrap items-center justify-between gap-7 rounded-[14px] bg-[var(--ink-900)] p-9">
            <div>
              <h2 className="max-w-[20ch] font-serif text-[32px] leading-[1.06] tracking-[-0.025em] text-white">
                Still deciding? The preview is free.
              </h2>
              <p className="mt-3 max-w-[40ch] text-[14.5px] leading-[1.6] text-[var(--ink-300)]">
                See a real sheet from your own files before you spend a credit.
              </p>
            </div>
            <LinkButton href="/generate" variant="signal" size="lg" className="!rounded-[9px]">
              Drop your files
            </LinkButton>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
