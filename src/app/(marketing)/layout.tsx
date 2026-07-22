import { MarketingNav, Footer } from "@/components/ui";

/**
 * Marketing layout — public, unauthenticated surfaces (home, pricing,
 * FAQ). Sticky nav on top, dark footer below, content between.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--paper)]">
      <MarketingNav />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
