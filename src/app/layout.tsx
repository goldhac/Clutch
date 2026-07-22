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
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://cramsheet-production.up.railway.app",
  ),
  title: {
    default: "CramSheet — the one-page cheat sheet that knows what's on the exam",
    template: "%s · CramSheet",
  },
  description:
    "Upload your materials, get a ranked, sourced Exam Reference Sheet — every claim scored and cited. One page. Print it. Take it.",
  applicationName: "CramSheet",
  openGraph: {
    title: "CramSheet — the one-page cheat sheet that knows what's on the exam",
    description:
      "Every claim scored and sourced. Upload your materials, get a ranked Exam Reference Sheet.",
    type: "website",
    siteName: "CramSheet",
  },
  twitter: {
    card: "summary_large_image",
    title: "CramSheet",
    description: "The one-page cheat sheet that knows what's on the exam.",
  },
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
