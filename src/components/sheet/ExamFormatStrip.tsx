import type { ExamFormat } from "@/contract/sheet-content";
import { InlineText } from "@/components/trust";
import { Fragment } from "react";

/**
 * ExamFormatStrip — the cheap-meta-layer block that appears just below
 * the h1. Signals "this engine actually knows the exam format." Spans
 * all columns via CSS (see sheet.css .exam-format).
 */
export interface ExamFormatStripProps {
  format?: ExamFormat;
}

export function ExamFormatStrip({ format }: ExamFormatStripProps) {
  if (!format) return null;

  const parts: Array<{ label?: string; value: string; asHtml?: boolean }> = [
    { label: "Format:", value: format.mix, asHtml: true },
  ];
  if (format.time) parts.push({ label: "Time:", value: format.time, asHtml: true });
  if (format.openBook !== undefined) {
    parts.push({ label: "Open book:", value: format.openBook ? "yes" : "no" });
  }
  if (format.notes) parts.push({ value: format.notes, asHtml: true });

  return (
    <section className="exam-format">
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && " · "}
          {p.label && <strong>{p.label}</strong>}
          {p.label && " "}
          {p.asHtml ? <InlineText text={p.value} /> : p.value}
        </Fragment>
      ))}
    </section>
  );
}
