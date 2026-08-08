import type { Metadata } from "next";
import { LinkButton } from "@/components/ui";

export const metadata: Metadata = {
  title: "How it works — Clutch",
  description:
    "How Clutch ranks what's most likely tested, verifies against your past exams, and cites every claim. No subscription; credits never expire.",
};

const FAQS: { q: string; a: string }[] = [
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
    a: "PDF, PPTX and DOCX up to 40 MB each — slides, review guides, past exams, and notes. Past exams carry the most weight. Image-only PDFs get OCR'd automatically.",
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
  return (
    <div className="mx-auto max-w-[640px] px-6 py-20">
      <header>
        <h1 className="font-serif text-[clamp(2.2rem,5vw,3rem)] leading-[1.08] tracking-[-0.02em] text-[var(--ink-900)]" style={{ textWrap: "balance" }}>
          How it works.
        </h1>
        <p className="mt-4 text-[16px] leading-[1.6] text-[var(--ink-600)]">
          The short version: upload your materials, we rank what&apos;s most likely tested and prove
          every claim, you print one page.
        </p>
      </header>

      <dl className="mt-12 divide-y divide-[var(--ink-150)]">
        {FAQS.map((f) => (
          <div key={f.q} className="py-6">
            <dt className="text-[18px] font-semibold text-[var(--ink-900)]">{f.q}</dt>
            <dd className="mt-2 text-[15px] leading-[1.6] text-[var(--ink-600)]" style={{ textWrap: "pretty" }}>
              {f.a}
            </dd>
          </div>
        ))}
      </dl>

      {/* dark CTA card */}
      <div className="mt-12 rounded-[var(--r-xl)] bg-[var(--ink-900)] p-8 text-center">
        <h2 className="font-serif text-[26px] text-white">Still deciding? The preview is free.</h2>
        <p className="mx-auto mt-2 max-w-sm text-[14px] text-[var(--ink-400)]">
          See a real sheet from your own files before you spend a credit.
        </p>
        <div className="mt-6 flex justify-center">
          <LinkButton href="/generate" variant="signal">
            Drop your files
          </LinkButton>
        </div>
      </div>
    </div>
  );
}
