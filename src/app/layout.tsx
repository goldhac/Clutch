import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CramSheet",
  description:
    "Exam-calibrated one-page reference sheets — upload course materials, get a ranked cheat sheet you can trust.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* suppressHydrationWarning silences false positives from browser
       * extensions that inject attributes onto <body> (Grammarly, etc.).
       * Scope is one level deep — does NOT mask real hydration bugs in
       * our own components. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
