import type { Metadata } from "next";
import { LinkButton, Reveal } from "@/components/ui";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Pay for the sheet, not a subscription. Single $4.99, 3-Pack $9.99, Sprint Pass $14.99. Free preview on every sheet. Credits never expire.",
};

/**
 * /pricing — v2 handoff: hairline column table (no card towers), the
 * 3-Pack highlighted by ground + "cheapest per sheet" flag, the 2am
 * photo band, the in-every-sheet trust row, ink closer card.
 */
const TIERS = [
  {
    key: "single",
    name: "Single",
    price: "$4.99",
    sub: "one credit · never expires",
    gets: "One full sheet at MAX density, scored, sourced and print-ready.",
    cta: "Start free",
  },
  {
    key: "pack",
    name: "3-Pack",
    price: "$9.99",
    sub: "$3.33 a sheet · three credits",
    gets: "Three sheets, usable across different courses and terms.",
    cta: "Get 3-Pack",
    pick: true,
  },
  {
    key: "sprint",
    name: "Sprint Pass",
    price: "$14.99",
    sub: "unlimited for 7 days",
    gets: "Unlimited sheets and priority generation through a stacked finals week.",
    cta: "Go Sprint",
  },
] as const;

export default function PricingPage() {
  return (
    <div className="bg-[var(--paper)]">
      {/* head */}
      <div className="mx-auto max-w-[1040px] px-6 pt-16 text-center sm:px-8 lg:pt-[88px]">
        <Reveal>
          <h1
            className="mx-auto max-w-[20ch] font-serif text-[clamp(2.5rem,6vw,4rem)] leading-[1] tracking-[-0.035em] text-[var(--ink-900)]"
            style={{ textWrap: "balance" }}
          >
            Pay for the sheet, not a subscription.
          </h1>
          <p
            className="mx-auto mt-5 max-w-[46ch] text-[16px] leading-[1.6] text-[var(--ink-600)]"
            style={{ textWrap: "pretty" }}
          >
            Every sheet starts with a free preview — the whole front page, at full density.
            Credits never expire, and there is nothing to cancel.
          </p>
        </Reveal>
      </div>

      {/* prices — hairline columns */}
      <div className="mx-auto max-w-[1040px] px-6 pt-14 sm:px-8 lg:pt-16">
        <Reveal>
          <div className="grid border-t border-[var(--ink-900)] sm:grid-cols-3">
            {TIERS.map((t, i) => (
              <div
                key={t.key}
                className={
                  "flex flex-col items-start border-b border-[var(--ink-150)] py-[34px] pr-7 " +
                  (i > 0 ? "sm:border-l sm:border-l-[var(--ink-150)] sm:pl-[30px] " : "") +
                  ("pick" in t && t.pick ? "bg-white" : "")
                }
              >
                <div className="flex min-h-6 flex-wrap items-center gap-x-2.5 gap-y-2">
                  <span className="whitespace-nowrap text-[15px] font-semibold tracking-[-0.01em] text-[var(--ink-900)]">
                    {t.name}
                  </span>
                  {"pick" in t && t.pick && (
                    <span className="whitespace-nowrap font-mono text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--salmon-text)]">
                      ★ cheapest per sheet
                    </span>
                  )}
                </div>
                <div className="mt-4 font-serif text-[52px] leading-none tracking-[-0.025em] text-[var(--ink-900)]">
                  {t.price}
                </div>
                <div className="mt-2.5 font-mono text-[11.5px] text-[var(--ink-500)]">{t.sub}</div>
                <p className="mb-[26px] mt-4 text-[14px] leading-[1.6] text-[var(--ink-600)]" style={{ textWrap: "pretty" }}>
                  {t.gets}
                </p>
                <LinkButton
                  href="/generate"
                  variant={"pick" in t && t.pick ? "primary" : "secondary"}
                  size="md"
                  className="mt-auto !h-11 !rounded-[9px] !px-5"
                >
                  {t.cta}
                </LinkButton>
              </div>
            ))}
          </div>
          <div className="mt-5 text-center font-mono text-[11.5px] text-[var(--ink-500)]">
            free preview on every sheet · credits never expire · no subscription
          </div>
        </Reveal>
      </div>

      {/* photo band */}
      <div className="mx-auto max-w-[1040px] px-6 pt-16 sm:px-8 lg:pt-[72px]">
        <Reveal>
          <div className="h-[260px] overflow-hidden rounded-[14px] bg-[var(--ink-100)] sm:h-[340px]">
            <img
              src="/photos/desk-2am.jpg"
              alt="A study sheet on a desk at night, laptop and coffee beside it"
              className="h-full w-full object-cover"
            />
          </div>
          <div className="mt-3.5 text-center font-mono text-[11px] text-[var(--ink-500)]">
            what $4.99 buys · one printed page, the night before
          </div>
        </Reveal>
      </div>

      {/* in every sheet */}
      <div className="mx-auto max-w-[1040px] px-6 pt-16 sm:px-8 lg:pt-20">
        <div className="grid gap-9 sm:grid-cols-3">
          <Reveal delay={0}>
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="h-[9px] w-[9px] rounded-full bg-[var(--conf-high)]"
                style={{ boxShadow: "0 0 0 3px var(--conf-high-bg)" }}
              />
              <span className="text-[14.5px] font-semibold text-[var(--ink-900)]">
                Every line scored
              </span>
            </div>
            <p className="mt-2.5 text-[14px] leading-[1.6] text-[var(--ink-600)]">
              Green, gold or red, printed on the page itself.
            </p>
          </Reveal>
          <Reveal delay={70}>
            <div className="flex items-center gap-2.5">
              <span aria-hidden className="text-[14px] text-[var(--verified)]">★</span>
              <span className="text-[14.5px] font-semibold text-[var(--ink-900)]">
                Exam-verified marks
              </span>
            </div>
            <p className="mt-2.5 text-[14px] leading-[1.6] text-[var(--ink-600)]">
              The star appears only where a past exam in your pack asked it.
            </p>
          </Reveal>
          <Reveal delay={140}>
            <div className="flex items-center gap-2.5">
              <span aria-hidden className="font-mono text-[11px] text-[var(--ink-500)]">s21</span>
              <span className="text-[14.5px] font-semibold text-[var(--ink-900)]">
                A source on every claim
              </span>
            </div>
            <p className="mt-2.5 text-[14px] leading-[1.6] text-[var(--ink-600)]">
              Slide number and file name, so you can check it in two seconds.
            </p>
          </Reveal>
        </div>
      </div>

      {/* closer card */}
      <div className="mx-auto max-w-[1040px] px-6 pb-24 pt-16 sm:px-8 lg:pt-20">
        <Reveal>
          <div className="flex flex-wrap items-center justify-between gap-7 rounded-[14px] bg-[var(--ink-900)] p-8 sm:p-10">
            <h2 className="max-w-[22ch] font-serif text-[clamp(1.75rem,3.5vw,2.25rem)] leading-[1.06] tracking-[-0.025em] text-white">
              See the sheet before you decide anything.
            </h2>
            <div className="flex shrink-0 flex-col gap-2.5">
              <LinkButton href="/generate" variant="inverse" size="lg" className="!rounded-[9px]">
                Drop your files
              </LinkButton>
              <span className="text-center font-mono text-[11px] text-[var(--ink-400)]">
                no account needed
              </span>
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
