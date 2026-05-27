import "@/renderer/density.css";
import "@/renderer/semantics.css";

/**
 * Design-token + semantics debug surface.
 *
 * This is the Step 1 acceptance demo (docs/06-V1-CHECKLIST.md Step 1):
 *   - every functional + topic color rendered as a labeled swatch
 *   - every inline semantic convention rendered live
 *   - confidence dots + ★ + ✓/✗ shown
 *   - a tiny preview of each density (1 column each — full geometry lands in Step 3)
 *
 * If anything here looks wrong, the rest of the renderer will inherit
 * the bug — fix it here first.
 */

type Swatch = { label: string; cssVar: string; hex: string; note?: string };

const FUNCTIONAL: Swatch[] = [
  { label: "Primary indigo",   cssVar: "--color-primary-indigo",   hex: "#3b3593", note: "h1/h2 banner default" },
  { label: "Primary indigo-2", cssVar: "--color-primary-indigo-2", hex: "#6a5cff", note: "h1 gradient pair" },
  { label: "Strong red",       cssVar: "--color-strong-red",       hex: "#b53756", note: "**bold** / danger" },
  { label: "Emphasis teal",    cssVar: "--color-emphasis-teal",    hex: "#0d8b8b", note: "*em* watch-out" },
  { label: "Correct green",    cssVar: "--color-correct-green",    hex: "#1f7d3a", note: "✓ / high confidence" },
  { label: "Warning orange",   cssVar: "--color-warning-orange",   hex: "#b35c00", note: "trap callouts" },
  { label: "Exam gold",        cssVar: "--color-exam-gold",        hex: "#a08200", note: "★ exam-verified" },
  { label: "Code bg dark",     cssVar: "--color-code-bg-dark",     hex: "#1c2030" },
  { label: "Code fg light",    cssVar: "--color-code-fg-light",    hex: "#e6e9f0" },
  { label: "Light fill",       cssVar: "--color-light-fill",       hex: "#f1f3f8", note: "inline code bg" },
  { label: "Light bg",         cssVar: "--color-light-bg",         hex: "#f6f7fb", note: "zebra rows" },
  { label: "Border light",     cssVar: "--color-border-light",     hex: "#d8dbe4" },
  { label: "Border mid",       cssVar: "--color-border-mid",       hex: "#b8bbc4" },
];

const TOPIC: Swatch[] = [
  { label: "Blue",   cssVar: "--topic-blue",   hex: "#1e5fa3" },
  { label: "Green",  cssVar: "--topic-green",  hex: "#1f7d3a" },
  { label: "Pink",   cssVar: "--topic-pink",   hex: "#c8336b" },
  { label: "Maroon", cssVar: "--topic-maroon", hex: "#8b1a1a" },
  { label: "Teal",   cssVar: "--topic-teal",   hex: "#0d8b8b" },
  { label: "Purple", cssVar: "--topic-purple", hex: "#6a3d9a" },
  { label: "Orange", cssVar: "--topic-orange", hex: "#b35c00" },
  { label: "Gold",   cssVar: "--topic-gold",   hex: "#a08200" },
  { label: "Indigo", cssVar: "--topic-indigo", hex: "#3b3593" },
  { label: "Olive",  cssVar: "--topic-olive",  hex: "#5e5326" },
];

function SwatchCard({ s }: { s: Swatch }) {
  return (
    <div className="flex items-center gap-3 rounded border border-neutral-200 p-2 text-sm">
      <div
        className="h-10 w-10 shrink-0 rounded border border-neutral-300"
        style={{ background: `var(${s.cssVar})` }}
      />
      <div className="min-w-0">
        <div className="font-semibold">{s.label}</div>
        <div className="font-mono text-xs text-neutral-500">{s.hex}</div>
        {s.note && <div className="text-xs text-neutral-600">{s.note}</div>}
      </div>
    </div>
  );
}

export default function TokensDebugPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-[color:var(--color-primary-indigo)]">
          Design tokens — debug
        </h1>
        <p className="mt-1 text-sm text-neutral-600">
          Source of truth: <code>docs/02-OUTPUT-SPEC.md</code>. If a hex value below doesn&apos;t
          match the swatch, the token wiring is broken.
        </p>
      </header>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Functional colors</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
          {FUNCTIONAL.map((s) => (
            <SwatchCard key={s.cssVar} s={s} />
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Topic palette</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {TOPIC.map((s) => (
            <SwatchCard key={s.cssVar} s={s} />
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">Inline semantic conventions</h2>
        <div className="sheet density-standard rounded border border-neutral-200 p-4">
          <p>
            <strong>bold</strong> renders strong red ·{" "}
            <em>emphasis</em> renders teal bold non-italic ·{" "}
            <span className="verified-star">★</span>
            exam-verified prefix · <span className="ok">✓ correct</span> ·{" "}
            <span className="ko">wrong</span> ·{" "}
            <span className="conf-dot conf-high" aria-label="high confidence" /> high ·{" "}
            <span className="conf-dot conf-med" aria-label="medium confidence" /> med ·{" "}
            <span className="conf-dot conf-low" aria-label="low confidence" /> low ·{" "}
            <span className="src">Slide 14</span>
          </p>

          <blockquote>
            <strong>z*</strong> is NOT used when <em>σ is unknown</em> — use <strong>t*</strong>{" "}
            with <code>df = n − 1</code>.
          </blockquote>

          <div className="formula-block">
            <div>
              <span className="verified-star">★</span>
              <strong>Confidence interval — small-sample mean</strong>{" "}
              <span className="conf-dot conf-high" />
            </div>
            <div className="formula">x̄ ± t*(s/√n)</div>
            <div>
              <em>vars:</em> x̄ sample mean · s sample SD · n size · t from t-table (df=n−1)
            </div>
            <div>
              <em>use:</em> σ unknown <strong>AND</strong> small n
            </div>
            <div>
              <em>Q:</em> 95% CI for n=10, x̄=50, s=4 <span className="src">Review p2</span>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Test</th>
                <th>When</th>
                <th>Stat</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>z-test</td>
                <td>σ known</td>
                <td>(x̄ − μ)/(σ/√n)</td>
              </tr>
              <tr>
                <td>t-test</td>
                <td>σ unknown</td>
                <td>(x̄ − μ)/(s/√n)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">Density preview (one column each)</h2>
        <p className="mb-3 text-sm text-neutral-600">
          Full multi-column geometry lands in Step 3. This just confirms each density&apos;s
          font + line-height come through.
        </p>

        <div className="grid gap-4 md:grid-cols-3">
          {(["minimal", "standard", "max"] as const).map((d) => (
            <div key={d} className="rounded border border-neutral-200 p-3">
              <div className="mb-1 text-xs font-semibold uppercase text-neutral-500">
                {d}
              </div>
              <div className={`sheet density-${d}`}>
                <h2>Sample heading</h2>
                <p>
                  <strong>z-test</strong> applies when σ is known; otherwise use{" "}
                  <strong>t*</strong>.
                </p>
                <pre>code block — mono</pre>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
