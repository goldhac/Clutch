import Link from "next/link";
import { LinkButton, Wordmark } from "@/components/ui";

/**
 * Root not-found. Also the fix for the Next 15 static-export quirk where
 * a project with no root page.tsx (home lives in the (marketing) group)
 * and no explicit not-found surfaces a misleading "<Html> import" error
 * while prerendering /404.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--paper)] px-6 text-center">
      <Wordmark href="/" />
      <h1 className="mt-8 font-serif text-[clamp(2.4rem,6vw,3.5rem)] tracking-[-0.02em] text-[var(--ink-900)]">
        This page isn&apos;t on the sheet.
      </h1>
      <p className="mt-3 max-w-sm text-[15px] text-[var(--ink-600)]">
        The link may be old or mistyped. Head back and make a sheet instead.
      </p>
      <div className="mt-7 flex gap-3">
        <LinkButton href="/">Back home</LinkButton>
        <LinkButton href="/generate" variant="secondary">
          Make a sheet
        </LinkButton>
      </div>
      <p className="mt-6 font-mono text-[12px] text-[var(--ink-400)]">
        <Link href="/pricing" className="underline">
          Pricing
        </Link>{" "}
        ·{" "}
        <Link href="/faq" className="underline">
          How it works
        </Link>
      </p>
    </main>
  );
}
