import Link from "next/link";
import { LinkButton, Wordmark } from "@/components/ui";

/**
 * Root not-found — v2 handoff edge state: mark, mono ERROR 404, h1 over
 * an ink rule, two 48px actions, then a 3-row hairline list with
 * right-aligned notes. Copy unchanged from the shipped page.
 *
 * (Also the fix for the Next 15 static-export quirk where a project with
 * no root page.tsx and no explicit not-found surfaces a misleading
 * "<Html> import" error while prerendering /404.)
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center bg-[var(--paper)] px-6">
      <div className="mx-auto w-full max-w-[560px] py-16">
        <Wordmark href="/" />
        <div className="mt-10 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-500)]">
          Error 404
        </div>
        <h1 className="mt-3.5 border-b border-[var(--ink-900)] pb-6 font-serif text-[clamp(2.4rem,6vw,3.75rem)] leading-[1.02] tracking-[-0.03em] text-[var(--ink-900)]">
          This page isn&apos;t on the sheet.
        </h1>
        <p className="mt-6 max-w-[46ch] text-[16px] leading-[1.6] text-[var(--ink-600)]" style={{ textWrap: "pretty" }}>
          The link may be old or mistyped. Head back and make a sheet instead.
        </p>
        <div className="mt-7 flex gap-3">
          <LinkButton href="/" size="lg" className="!h-12">
            Back home
          </LinkButton>
          <LinkButton href="/generate" variant="secondary" size="lg" className="!h-12">
            Make a sheet
          </LinkButton>
        </div>
        <div className="mt-12 border-t border-[var(--ink-900)]">
          {(
            [
              ["Make a sheet", "/generate", "drop files, get one page"],
              ["Pricing", "/pricing", "$4.99 · no subscription"],
              ["How it works", "/faq", "scores, stars and sources"],
            ] as const
          ).map(([label, href, note]) => (
            <Link
              key={href}
              href={href}
              className="group flex items-baseline justify-between gap-5 border-b border-[var(--ink-150)] py-[15px]"
            >
              <span className="text-[15px] font-semibold text-[var(--ink-900)] group-hover:underline">
                {label}
              </span>
              <span className="shrink-0 text-[13.5px] text-[var(--ink-500)]">{note}</span>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
