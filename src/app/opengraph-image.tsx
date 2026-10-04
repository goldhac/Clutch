import { ImageResponse } from "next/og";

/**
 * The card a Clutch link unfurls into (Slack, LinkedIn, X, iMessage).
 *
 * The site already declared `twitter:card = summary_large_image` and an openGraph block with no
 * image in it, which is why a shared link showed nothing: a large-image card with no image is not
 * a small card, it is no card. This file is the image, and Next wires `og:image` from its presence.
 *
 * Drawn rather than photographed, for two reasons. A screenshot of a 135-item sheet is illegible
 * at 1200×630 — the thing it is selling disappears at the size it is seen. And type plus shapes
 * render identically every time, where a bitmap has to be re-exported whenever the brand moves.
 *
 * Colours come from tokens.css, not from memory. The dot row is the sheet's own topic key, which
 * is the most recognisable thing Clutch draws.
 */
export const runtime = "nodejs";
export const alt = "Clutch — it decides what's on the exam. Then it proves it.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** tokens.css — the light-theme values, since the card is a fixed dark surface either way. */
const BAND = "#111114";
const BAND_2 = "#1c1c21";
const SIGNAL = "#5b57e0";
const PAPER = "#fbfbfa";
const TOPICS = ["#5b57e0", "#1a7f4b", "#b26a00", "#2f6db3", "#8e44ad", "#c0392b"];

/**
 * The card uses the three faces the product uses, in the roles it uses them in: Newsreader for the
 * headline only — the app's own rule is that it is display-only — Geist for prose, Geist Mono for
 * the labels. Registering one family would have made the whole card a serif, which is the thing
 * the typography is deliberately not.
 *
 * The plain User-Agent matters: Google serves woff2 to a modern browser string, and satori cannot
 * parse woff2. Asking as an old client gets TrueType back.
 *
 * Every fetch may fail and the card still renders — in the built-in sans, because a plain card
 * beats a broken route.
 */
async function googleFont(family: string, spec: string): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:${spec}&display=swap`,
      { headers: { "User-Agent": "Mozilla/5.0" } },
    ).then((r) => r.text());
    const url = css.match(/src:\s*url\(([^)]+)\)\s*format\('(?:truetype|opentype)'\)/)?.[1];
    if (!url) return null;
    return await fetch(url).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

type Face = { name: string; data: ArrayBuffer; weight: 400 | 600; style: "normal" };
const face = (name: string, data: ArrayBuffer | null, weight: 400 | 600): Face[] =>
  data ? [{ name, data, weight, style: "normal" }] : [];

export default async function Image() {
  const [serif, sans, sansBold, mono] = await Promise.all([
    // Newsreader carries an optical-size axis, so its spec names both axes or Google refuses it.
    googleFont("Newsreader", "opsz,wght@6..72,400"),
    googleFont("Geist", "wght@400"),
    googleFont("Geist", "wght@600"),
    googleFont("Geist Mono", "wght@400"),
  ]);
  const fonts = [
    ...face("Geist", sans, 400),
    ...face("Geist", sansBold, 600),
    ...face("Newsreader", serif, 400),
    ...face("Geist Mono", mono, 400),
  ];
  const SANS = sans ? "Geist" : undefined;
  const MONO = mono ? "Geist Mono" : undefined;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BAND,
          padding: "64px 72px",
          fontFamily: SANS,
        }}
      >
        {/* The mark, as it is drawn in the app: a rounded sheet with a signal bolt. */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 11,
              background: SIGNAL,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 26,
              fontWeight: 700,
              color: PAPER,
            }}
          >
            C
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <div style={{ fontSize: 30, fontWeight: 600, color: PAPER, letterSpacing: "-0.01em" }}>
              Clutch
            </div>
            <div style={{ fontFamily: MONO, fontSize: 16, color: "#6b6b76", letterSpacing: "0.08em" }}>
              EXAM REFERENCE SHEETS
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontFamily: serif ? "Newsreader" : SANS,
              fontSize: 76,
              lineHeight: 1.04,
              letterSpacing: "-0.03em",
              color: PAPER,
            }}
          >
            <div>It decides what&rsquo;s on the exam.</div>
            <div>Then it proves it.</div>
          </div>

          <div
            style={{
              marginTop: 26,
              fontSize: 25,
              lineHeight: 1.45,
              color: "#a8a8b3",
              maxWidth: 880,
            }}
          >
            Drop in your slides, review guides and past exams. Get one printable page, ranked by
            what&rsquo;s most likely to be tested.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {/* The sheet's topic key — the thing a student recognises before the wordmark. */}
          <div style={{ display: "flex", gap: 7 }}>
            {TOPICS.map((c) => (
              <div key={c} style={{ width: 13, height: 13, borderRadius: 999, background: c }} />
            ))}
          </div>
          <div
            style={{
              height: 26,
              width: 1,
              background: BAND_2,
            }}
          />
          <div style={{ fontFamily: MONO, fontSize: 18, color: "#8a8a96" }}>
            every line cites a slide · scored · one page, printed
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts,
    },
  );
}
