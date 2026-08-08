import "@/renderer/density.css";
import "@/renderer/semantics.css";

/**
 * Design-system debug surface (v2 — the product-design token set).
 *
 * Source of truth: design/Clutch.dc.html :root block (mirrored in
 * src/renderer/tokens.css). If a hex below doesn't match its swatch,
 * the token wiring is broken. This page is also the D1 acceptance gate
 * and grows into the living design-system reference (D6).
 */

type Swatch = { label: string; cssVar: string; hex: string; note?: string };

const INK: Swatch[] = [
  { label: "Ink 900", cssVar: "--ink-900", hex: "#111114", note: "primary CTAs, headlines" },
  { label: "Ink 800", cssVar: "--ink-800", hex: "#1c1c21", note: "body text" },
  { label: "Ink 700", cssVar: "--ink-700", hex: "#2c2c33" },
  { label: "Ink 600", cssVar: "--ink-600", hex: "#4a4a53", note: "secondary text" },
  { label: "Ink 500", cssVar: "--ink-500", hex: "#6b6b76" },
  { label: "Ink 400", cssVar: "--ink-400", hex: "#909099", note: "placeholder, meta" },
  { label: "Ink 300", cssVar: "--ink-300", hex: "#b8b8bf" },
  { label: "Ink 200", cssVar: "--ink-200", hex: "#d9d9de", note: "borders" },
  { label: "Ink 150", cssVar: "--ink-150", hex: "#e6e6ea", note: "hairlines" },
  { label: "Ink 100", cssVar: "--ink-100", hex: "#f0f0f2" },
  { label: "Ink 50", cssVar: "--ink-50", hex: "#f7f7f8", note: "hover fills" },
  { label: "Paper", cssVar: "--paper", hex: "#fbfbfa", note: "app background" },
  { label: "Paper 2", cssVar: "--paper-2", hex: "#f5f5f3", note: "workspace bg" },
];

const BRAND: Swatch[] = [
  { label: "Signal 700", cssVar: "--signal-700", hex: "#3a34b8", note: "link hover" },
  { label: "Signal 600", cssVar: "--signal-600", hex: "#4b45d6", note: "links" },
  { label: "Signal 500", cssVar: "--signal-500", hex: "#5b57e0", note: "accents, focus" },
  { label: "Signal 100", cssVar: "--signal-100", hex: "#ecebfb", note: "selection, tints" },
  { label: "Signal 50", cssVar: "--signal-50", hex: "#f5f4fe" },
  { label: "Salmon", cssVar: "--salmon", hex: "#fdece4", note: "proof surfaces" },
  { label: "Salmon line", cssVar: "--salmon-line", hex: "#f4d3c4" },
];

const CONF: Swatch[] = [
  { label: "High ≥80%", cssVar: "--conf-high", hex: "#1a7f4b" },
  { label: "High bg", cssVar: "--conf-high-bg", hex: "#e6f4ec" },
  { label: "Med 50–79%", cssVar: "--conf-med", hex: "#b26a00" },
  { label: "Med bg", cssVar: "--conf-med-bg", hex: "#fbf0dd" },
  { label: "Low <50%", cssVar: "--conf-low", hex: "#c0392b" },
  { label: "Low bg", cssVar: "--conf-low-bg", hex: "#fbe9e7" },
  { label: "Verified ★", cssVar: "--verified", hex: "#a5790a" },
  { label: "Verified bg", cssVar: "--verified-bg", hex: "#fbf3da" },
];

const FUNCTIONAL: Swatch[] = [
  { label: "Info", cssVar: "--info", hex: "#2f6db3" },
  { label: "Warning", cssVar: "--warn", hex: "#b26a00" },
  { label: "Danger", cssVar: "--danger", hex: "#c0392b" },
  { label: "Success", cssVar: "--success", hex: "#1a7f4b" },
];

const TOPIC: Swatch[] = [
  { label: "Topic 1", cssVar: "--topic-1", hex: "#5b57e0" },
  { label: "Topic 2", cssVar: "--topic-2", hex: "#1a7f4b" },
  { label: "Topic 3", cssVar: "--topic-3", hex: "#b26a00" },
  { label: "Topic 4", cssVar: "--topic-4", hex: "#2f6db3" },
  { label: "Topic 5", cssVar: "--topic-5", hex: "#8e44ad" },
  { label: "Topic 6", cssVar: "--topic-6", hex: "#c0392b" },
];

function SwatchCard({ s }: { s: Swatch }) {
  return (
    <div className="flex items-center gap-3 rounded-ds-md border border-ink-150 bg-white p-2 text-sm shadow-ds-xs">
      <div
        className="h-10 w-10 shrink-0 rounded-ds-sm border border-ink-150"
        style={{ background: `var(${s.cssVar})` }}
      />
      <div className="min-w-0">
        <div className="font-medium text-ink-900">{s.label}</div>
        <div className="font-mono text-xs text-ink-400">{s.hex}</div>
        {s.note && <div className="text-xs text-ink-500">{s.note}</div>}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-3 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-ink-400">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function TokensDebugPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.08em] text-signal-600">
          Design system · v2
        </p>
        <h1 className="mt-2 font-serif text-4xl text-ink-900">
          One page. Print it. <em className="text-signal-600">Take it.</em>
        </h1>
        <p className="mt-3 max-w-xl text-sm text-ink-600">
          Source: <code className="rounded bg-ink-100 px-1 font-mono text-xs">design/Clutch.dc.html</code>{" "}
          — mirrored in <code className="rounded bg-ink-100 px-1 font-mono text-xs">tokens.css</code>. Light
          mode only; the sheet lives on paper.
        </p>
      </header>

      <Section title="Ink / neutral scale">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {INK.map((s) => (
            <SwatchCard key={s.cssVar} s={s} />
          ))}
        </div>
      </Section>

      <Section title="Brand — ink primary + iris signal + salmon">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {BRAND.map((s) => (
            <SwatchCard key={s.cssVar} s={s} />
          ))}
        </div>
      </Section>

      <Section title="Confidence tiers — the trust layer">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CONF.map((s) => (
            <SwatchCard key={s.cssVar} s={s} />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-5 rounded-ds-md border border-ink-150 bg-white p-4 text-sm shadow-ds-xs">
          <span className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: "var(--conf-high)", boxShadow: "0 0 0 3px var(--conf-high-bg)" }}
            />
            high
          </span>
          <span className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: "var(--conf-med)", boxShadow: "0 0 0 3px var(--conf-med-bg)" }}
            />
            med
          </span>
          <span className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: "var(--conf-low)", boxShadow: "0 0 0 3px var(--conf-low-bg)" }}
            />
            low
          </span>
          <span className="flex items-center gap-1" style={{ color: "var(--verified)" }}>
            ★ <span className="text-ink-600">verified</span>
          </span>
          <span className="font-mono text-xs text-ink-500">L08 s23 · Final &apos;19 Q3</span>
        </div>
      </Section>

      <Section title="Functional">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {FUNCTIONAL.map((s) => (
            <SwatchCard key={s.cssVar} s={s} />
          ))}
        </div>
      </Section>

      <Section title="Topic palette">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {TOPIC.map((s) => (
            <SwatchCard key={s.cssVar} s={s} />
          ))}
        </div>
      </Section>

      <Section title="Typography — Newsreader · Geist · Geist Mono">
        <div className="space-y-6 rounded-ds-md border border-ink-150 bg-white p-6 shadow-ds-xs">
          <div>
            <p className="font-mono text-[11px] text-signal-600">Display · Newsreader 400 · 56/1.05/−.02em</p>
            <p className="font-serif text-[56px] leading-[1.05] tracking-[-0.02em] text-ink-900">
              What&apos;s most likely tested
            </p>
          </div>
          <div>
            <p className="font-mono text-[11px] text-signal-600">H1 · Newsreader 400 · 40/1.1</p>
            <p className="font-serif text-[40px] leading-[1.1] text-ink-900">Drop your files</p>
          </div>
          <div>
            <p className="font-mono text-[11px] text-signal-600">H2 · Geist 600 · 28/1.2</p>
            <p className="text-[28px] font-semibold leading-[1.2] text-ink-900">
              Every claim scored &amp; sourced
            </p>
          </div>
          <div>
            <p className="font-mono text-[11px] text-signal-600">Body · Geist 400 · 14/1.55</p>
            <p className="max-w-lg text-[14px] leading-[1.55] text-ink-800">
              Clutch turns your exam materials into a single dense, printable page that
              decides what&apos;s most likely tested — and proves every claim with a confidence
              score and a real citation.
            </p>
          </div>
          <div>
            <p className="font-mono text-[11px] text-signal-600">Mono / cite · Geist Mono 500 · 12/1.4</p>
            <p className="font-mono text-[12px] font-medium leading-[1.4] text-ink-600">
              conf .91 · Lecture 08 s23 · Final 2019 Q3
            </p>
          </div>
        </div>
      </Section>

      <Section title="Shadows & radius">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {(["xs", "sm", "md", "lg", "xl"] as const).map((k) => (
            <div
              key={k}
              className="flex h-24 items-center justify-center rounded-ds-lg bg-white font-mono text-xs text-ink-500"
              style={{ boxShadow: `var(--sh-${k})` }}
            >
              sh-{k}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Legacy sheet conventions (until D5 rewrite)">
        <div className="sheet density-balanced rounded-ds-md border border-ink-150 bg-white p-4">
          <p>
            <strong>bold</strong> renders must-know · <em>emphasis</em> renders watch-out ·{" "}
            <span className="verified-star">★</span>exam-verified ·{" "}
            <span className="conf-dot conf-high" /> high · <span className="conf-dot conf-med" /> med ·{" "}
            <span className="conf-dot conf-low" /> low · <span className="src">Slide 14</span>
          </p>
          <blockquote>
            <strong>z*</strong> is NOT used when <em>σ is unknown</em> — use <strong>t*</strong> with{" "}
            <code>df = n − 1</code>.
          </blockquote>
        </div>
      </Section>
    </main>
  );
}
