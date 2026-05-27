import Link from "next/link";

/**
 * Placeholder home page for Step 1. The real landing page (with a blurred
 * MAX preview and CTA) ships in Step 10. For now this just confirms the
 * app boots and points to the design-token debug surface.
 */
export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight text-[color:var(--color-primary-indigo)]">
        CramSheet
      </h1>
      <p className="mt-2 text-neutral-700">
        Exam-calibrated one-page reference sheets. Phase 0 scaffold.
      </p>
      <p className="mt-6 text-sm text-neutral-500">
        Verify the design tokens render at spec values on the{" "}
        <Link href="/debug/tokens" className="underline">
          /debug/tokens
        </Link>{" "}
        page.
      </p>
    </main>
  );
}
