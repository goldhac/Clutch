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
      <body>{children}</body>
    </html>
  );
}
