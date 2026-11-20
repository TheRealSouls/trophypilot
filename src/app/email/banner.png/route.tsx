import { ImageResponse } from "next/og";

/**
 * The banner across the top of TrophyPilot's emails, 1200 by 300 (shown at 600 by 150). Made once
 * when the site is built and served as a plain picture, so emails cost nothing to show.
 */
export const dynamic = "force-static";

const TROPHY = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M10 8h12v5a6 6 0 0 1-12 0z" fill="#fff"/><path d="M10 10H7.5a3.2 3.2 0 0 0 3.3 4M22 10h2.5a3.2 3.2 0 0 1-3.3 4" fill="none" stroke="#fff" stroke-width="1.8"/><rect x="14.5" y="18.5" width="3" height="3.5" fill="#fff"/><rect x="11" y="22" width="10" height="2.6" rx="0.6" fill="#fff"/></svg>`;
const OUTLINE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M10 8h12v5a6 6 0 0 1-12 0z" fill="none" stroke="#fff" stroke-width="0.7"/><path d="M10 10H7.5a3.2 3.2 0 0 0 3.3 4M22 10h2.5a3.2 3.2 0 0 1-3.3 4" fill="none" stroke="#fff" stroke-width="0.7"/><rect x="14.5" y="18.5" width="3" height="3.5" fill="none" stroke="#fff" stroke-width="0.7"/><rect x="11" y="22" width="10" height="2.6" rx="0.6" fill="none" stroke="#fff" stroke-width="0.7"/></svg>`;
const src = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

/** Inter Bold from Google Fonts, the site's typeface. Without it the picture falls back to the built-in font. */
async function inter(weight: number) {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Inter:wght@${weight}`, { signal: AbortSignal.timeout(8000) })).text();
    const url = css.match(/src: url\(([^)]+)\) format\('(?:truetype|opentype)'\)/)?.[1];
    return url ? await (await fetch(url, { signal: AbortSignal.timeout(8000) })).arrayBuffer() : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const [bold, regular] = await Promise.all([inter(700), inter(500)]);
  const fonts = [
    ...(bold ? [{ name: "Inter", data: bold, weight: 700 as const, style: "normal" as const }] : []),
    ...(regular ? [{ name: "Inter", data: regular, weight: 500 as const, style: "normal" as const }] : []),
  ];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", fontFamily: "Inter", background: "linear-gradient(120deg, #e23b31 0%, #c92e26 55%, #a8241d 100%)", overflow: "hidden" }}>
        {/* A large faint trophy on the right, for depth. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src(OUTLINE)} width={420} height={420} alt="" style={{ position: "absolute", right: -40, top: -60, opacity: 0.18 }} />
        <div style={{ display: "flex", alignItems: "center", padding: "0 80px", gap: 36 }}>
          <div style={{ width: 120, height: 120, borderRadius: 28, background: "rgba(255,255,255,0.16)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src(TROPHY)} width={124} height={124} alt="" />
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 76, fontWeight: 700, color: "#fff", letterSpacing: -2 }}>TrophyPilot</div>
            <div style={{ fontSize: 30, fontWeight: 500, color: "rgba(255,255,255,0.9)", marginTop: 4 }}>Trophy tracking, guides and leaderboards</div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 300, fonts, headers: { "Cache-Control": "public, max-age=604800, immutable" } },
  );
}
