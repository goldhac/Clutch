import type { Metadata } from "next";
import { LinkButton } from "@/components/ui";

export const metadata: Metadata = {
  title: "Pricing — CramSheet",
  description:
    "Pay for the sheet, not a subscription. Single $4.99, 3-Pack $9.99, Sprint Pass $14.99. Free preview on every sheet. Credits never expire.",
};

interface Tier {
  name: string;
  price: string;
  sub: string;
  cta: string;
  features: string[];
  featured?: boolean;
}

const TIERS: Tier[] = [
  {
    name: "Single",
    price: "$4.99",
    sub: "One credit · never expires",
    cta: "Start free",
    features: [
      "One full MAX-density sheet",
      "Every item scored & sourced",
      "PDF export, print-ready",
      "Free preview first",
    ],
  },
  {
    name: "3-Pack",
    price: "$9.99",
    sub: "Three credits · never expire",
    cta: "Get 3-Pack",
    featured: true,
    features: [
      "Three full sheets",
      "Everything in Single",
      "Save 33% per sheet",
      "Reuse across courses",
    ],
  },
  {
    name: "Sprint Pass",
    price: "$14.99",
    sub: "Unlimited sheets for a week",
    cta: "Go Sprint",
    features: [
      "Unlimited sheets, 7 days",
      "Everything in 3-Pack",
      "Best for back-to-back exams",
      "Priority generation",
    ],
  },
];

function Check() {
  return (
    <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--conf-high)]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-20">
      <header className="text-center">
        <h1 className="font-serif text-[clamp(2.4rem,6vw,3.5rem)] leading-[1.05] tracking-[-0.02em] text-[var(--ink-900)]" style={{ textWrap: "balance" }}>
          Pay for the sheet, not a subscription.
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-[16px] leading-[1.55] text-[var(--ink-600)]">
          Every sheet starts with a free preview. Credits never expire. Cancel nothing — there&apos;s
          nothing to cancel.
        </p>
      </header>

      <div className="mt-14 grid gap-5 md:grid-cols-3">
        {TIERS.map((t) => (
          <div
            key={t.name}
            className={
              "relative flex flex-col rounded-[var(--r-xl)] border bg-white p-7 " +
              (t.featured
                ? "border-[var(--ink-900)] shadow-[var(--sh-lg)]"
                : "border-[var(--ink-150)] shadow-[var(--sh-xs)]")
            }
          >
            {t.featured && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-[var(--r-full)] bg-[var(--ink-900)] px-3 py-1 text-[12px] font-semibold text-white">
                Best value · $3.33 a sheet
              </span>
            )}
            <div className="text-[17px] font-semibold text-[var(--ink-900)]">{t.name}</div>
            <div className="mt-3 font-serif text-[3rem] leading-none text-[var(--ink-900)]">
              {t.price}
            </div>
            <div className="mt-2 text-[14px] text-[var(--ink-500)]">{t.sub}</div>

            <ul className="mt-6 flex-1 space-y-2.5">
              {t.features.map((f) => (
                <li key={f} className="flex gap-2 text-[14px] text-[var(--ink-700)]">
                  <Check /> {f}
                </li>
              ))}
            </ul>

            <div className="mt-7">
              <LinkButton
                href="/generate"
                variant={t.featured ? "primary" : "secondary"}
                className="w-full"
              >
                {t.cta}
              </LinkButton>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-10 text-center font-mono text-[13px] text-[var(--ink-400)]">
        Free preview on every sheet — see it before you pay.
      </p>
    </div>
  );
}
