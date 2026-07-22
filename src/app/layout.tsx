import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import "./globals.css";

/**
 * The three-face type system from the product design:
 *   Geist        — UI sans (300–800, with ss01/cv01 feature settings)
 *   Newsreader   — editorial serif display (heroes, page titles, big
 *                  numbers; italic used for emphasis moments)
 *   Geist Mono   — citations, formulas, metadata, labels
 *
 * next/font self-hosts at build time (no runtime Google Fonts request)
 * and exposes each face as a CSS variable consumed by tokens.css
 * (--sans / --serif / --mono).
 */
const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CramSheet",
  description:
    "The one-page cheat sheet that knows what's on the exam. Upload your materials, get a ranked, sourced Exam Reference Sheet.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable} ${newsreader.variable}`}
    >
      {/* suppressHydrationWarning silences false positives from browser
       * extensions that inject attributes onto <body> (Grammarly, etc.).
       * Scope is one level deep — does NOT mask real hydration bugs in
       * our own components. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
