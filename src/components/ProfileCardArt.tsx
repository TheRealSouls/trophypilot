import type { CSSProperties, ReactNode } from "react";
import { hashString, mulberry32 } from "@/lib/utils";

/**
 * Artwork for the pre-built profile cards (see PROFILE_CARDS). "banner" fills
 * the banner strip when the member hasn't picked game art; "body" is a faint
 * layer behind the rest of the card. Pure SVG and CSS: transforms and
 * opacity only, so it stays smooth on slow phones, and it holds still for
 * people who ask their device for reduced motion (globals.css, .pc-art).
 * Particles are placed from a seeded generator, so server and browser agree.
 */
export function ProfileCardArt({ card, part }: { card: string; part: "banner" | "body" }) {
  const art = part === "banner" ? BANNERS[card] : BODIES[card];
  if (!art) return null;
  return (
    <div className="pc-art pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {art()}
    </div>
  );
}

type Dot = { x: number; y: number; a: number; b: number; c: number };
function dots(seed: string, n: number): Dot[] {
  const r = mulberry32(hashString(seed));
  return Array.from({ length: n }, () => ({ x: r() * 100, y: r() * 100, a: r(), b: r(), c: r() }));
}

const anim = (name: string, seconds: number, delay: number, extra: CSSProperties = {}): CSSProperties => ({
  animation: `${name} ${seconds.toFixed(2)}s ${(-delay).toFixed(2)}s infinite ${name === "pc-blink" || name === "pc-twinkle" ? "ease-in-out" : "linear"}`,
  ...extra,
});

/** A row of rounded flame tongues along the bottom of a 600 x 176 box. */
function flamePath(seed: string, width: number, minH: number, maxH: number) {
  const r = mulberry32(hashString(seed));
  let d = "M0 176 L0 160";
  for (let x = 0; x < 600; x += width) {
    const h = minH + r() * (maxH - minH);
    d += ` Q${x + width * 0.2} ${160 - h * 0.35} ${x + width * 0.5} ${160 - h} Q${x + width * 0.8} ${160 - h * 0.35} ${x + width} 160`;
  }
  return `${d} L600 176 Z`;
}

/** Pine trees along a ridge: stacked triangles. */
function pines(seed: string, count: number, base: number, minH: number, maxH: number) {
  const r = mulberry32(hashString(seed));
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const x = (i / count) * 620 - 10 + r() * 20;
    const h = minH + r() * (maxH - minH);
    const w = h * 0.42;
    const top = base - h;
    out.push(
      `M${x} ${top} L${x + w * 0.55} ${top + h * 0.45} L${x + w * 0.3} ${top + h * 0.45} L${x + w * 0.75} ${top + h * 0.8} L${x + w * 0.12} ${top + h * 0.8} L${x + w * 0.12} ${base} L${x - w * 0.12} ${base} L${x - w * 0.12} ${top + h * 0.8} L${x - w * 0.75} ${top + h * 0.8} L${x - w * 0.3} ${top + h * 0.45} L${x - w * 0.55} ${top + h * 0.45} Z`,
    );
  }
  return out.join(" ");
}

/** Four-point sparkle centred on (x, y). */
const sparkle = (x: number, y: number, s: number) =>
  `M${x} ${y - s} Q${x + s * 0.18} ${y - s * 0.18} ${x + s} ${y} Q${x + s * 0.18} ${y + s * 0.18} ${x} ${y + s} Q${x - s * 0.18} ${y + s * 0.18} ${x - s} ${y} Q${x - s * 0.18} ${y - s * 0.18} ${x} ${y - s} Z`;

function Svg({ children, className = "absolute inset-0 h-full w-full", aspect = "xMidYMax slice" }: { children: ReactNode; className?: string; aspect?: string }) {
  return (
    <svg viewBox="0 0 600 176" preserveAspectRatio={aspect} className={className}>
      {children}
    </svg>
  );
}

const BANNERS: Record<string, () => ReactNode> = {
  ember: () => (
    <>
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, #160604 0%, #3b1007 50%, #7c240b 100%)" }} />
      <div className="absolute inset-x-0 bottom-0 h-2/3" style={{ background: "radial-gradient(60% 90% at 50% 100%, rgb(255 140 50 / 0.35), transparent 70%)" }} />
      <Svg aspect="none">
        <path d={flamePath("ember-back", 46, 60, 130)} fill="#a52a0c" className="pc-flame" style={anim("pc-flicker", 2.6, 0.4)} />
        <path d={flamePath("ember-mid", 34, 40, 95)} fill="#e0551c" className="pc-flame" style={anim("pc-flicker", 1.9, 1.1)} />
        <path d={flamePath("ember-front", 26, 18, 55)} fill="#f8a043" className="pc-flame" style={anim("pc-flicker", 1.4, 0.2)} />
      </Svg>
      {dots("ember-sparks", 18).map((d, i) => (
        <span
          key={i}
          className="absolute bottom-6 rounded-full"
          style={anim("pc-rise", 2.8 + d.a * 3, d.b * 6, {
            left: `${d.x}%`,
            width: 2 + d.c * 3,
            height: 2 + d.c * 3,
            background: d.c > 0.5 ? "#ffd27a" : "#ff9a4a",
            boxShadow: "0 0 6px #ff9a4a",
            opacity: 0.8,
            ["--dx" as string]: `${(d.a - 0.5) * 60}px`,
            ["--h" as string]: "150px",
          })}
        />
      ))}
    </>
  ),

  circuit: () => (
    <>
      <div className="absolute inset-0" style={{ background: "linear-gradient(160deg, #061821 0%, #0a2633 60%, #0c3140 100%)" }} />
      <div className="pc-grid absolute inset-0" />
      <Svg>
        <g fill="none" stroke="#2f8e88" strokeWidth="2" strokeLinejoin="round" opacity="0.75">
          {TRACES.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        <g fill="none" stroke="#9af3e8" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="14 420">
          {TRACES.map((d, i) => (
            <path key={i} d={d} style={anim("pc-dash", 3 + (i % 3), i * 0.7)} />
          ))}
        </g>
        <g fill="#0b2a36" stroke="#4fd1c5" strokeWidth="2">
          {NODES.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="4.5" />
          ))}
        </g>
        <g transform="translate(470 46)">
          <rect width="78" height="78" rx="8" fill="#0d3442" stroke="#4fd1c5" strokeWidth="2" />
          <rect x="16" y="16" width="46" height="46" rx="4" fill="none" stroke="#2f8e88" strokeWidth="2" />
          {[0, 1, 2, 3, 4].map((i) => (
            <g key={i} stroke="#4fd1c5" strokeWidth="2">
              <line x1={12 + i * 13.5} y1="-9" x2={12 + i * 13.5} y2="0" />
              <line x1={12 + i * 13.5} y1="78" x2={12 + i * 13.5} y2="87" />
              <line x1="-9" y1={12 + i * 13.5} x2="0" y2={12 + i * 13.5} />
              <line x1="78" y1={12 + i * 13.5} x2="87" y2={12 + i * 13.5} />
            </g>
          ))}
          <rect x="30" y="30" width="18" height="18" rx="2" fill="#4fd1c5" style={anim("pc-blink", 2.4, 0)} />
        </g>
      </Svg>
      <div className="pc-scan absolute inset-x-0 top-0 h-1/3" style={anim("pc-scan", 4.5, 0)} />
    </>
  ),

  ocean: () => (
    <>
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, #0f5b84 0%, #0a4466 45%, #05283f 100%)" }} />
      {[12, 34, 58, 80].map((x, i) => (
        <div
          key={x}
          className="absolute -top-6 h-[140%] w-16 origin-top"
          style={anim("pc-sway", 7 + i * 1.5, i * 2, {
            left: `${x}%`,
            background: "linear-gradient(180deg, rgb(190 235 255 / 0.22), transparent 80%)",
            transform: "rotate(-8deg)",
          })}
        />
      ))}
      <div className="absolute inset-x-0 top-0 h-6 overflow-hidden">
        <svg viewBox="0 0 1200 24" preserveAspectRatio="none" className="h-full w-[200%]" style={anim("pc-drift", 9, 0)}>
          <path d={wave(1200, 24, 8, 60)} fill="rgb(200 238 255 / 0.28)" />
        </svg>
      </div>
      <Svg>
        <path d="M0 176 L0 150 Q40 132 80 146 Q130 120 180 144 Q240 128 300 150 Q360 134 420 148 Q480 126 540 146 Q570 138 600 142 L600 176 Z" fill="#042033" />
        {[60, 150, 330, 470, 545].map((x, i) => (
          <path
            key={x}
            d={`M${x} 176 C${x - 14} 140 ${x + 16} 118 ${x} 80 C${x - 10} 60 ${x + 6} 48 ${x + 2} 36`}
            fill="none"
            stroke={i % 2 ? "#1f7a5c" : "#2a8f6a"}
            strokeWidth="5"
            strokeLinecap="round"
            className="pc-kelp"
            style={anim("pc-sway", 5 + i, i)}
          />
        ))}
      </Svg>
      {dots("ocean-bubbles", 14).map((d, i) => (
        <span
          key={i}
          className="absolute bottom-0 rounded-full border"
          style={anim("pc-rise", 4 + d.a * 4, d.b * 8, {
            left: `${d.x}%`,
            width: 4 + d.c * 8,
            height: 4 + d.c * 8,
            borderColor: "rgb(220 245 255 / 0.7)",
            background: "rgb(220 245 255 / 0.12)",
            ["--dx" as string]: `${(d.a - 0.5) * 30}px`,
            ["--h" as string]: "190px",
          })}
        />
      ))}
    </>
  ),

  forest: () => (
    <>
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, #0b1b28 0%, #10302b 60%, #143a2a 100%)" }} />
      <div className="absolute right-[14%] top-5 h-12 w-12 rounded-full" style={{ background: "#f1ecd2", boxShadow: "0 0 40px 10px rgb(241 236 210 / 0.25)" }} />
      <Svg>
        <path d={pines("pine-far", 22, 150, 70, 110)} fill="#123628" />
        <path d={pines("pine-mid", 16, 166, 80, 130)} fill="#0e2c20" />
        <path d={pines("pine-near", 10, 182, 100, 160)} fill="#0a2018" />
      </Svg>
      {dots("forest-flies", 16).map((d, i) => (
        <span
          key={i}
          className="absolute rounded-full"
          style={anim("pc-blink", 2 + d.a * 3, d.b * 5, {
            left: `${d.x}%`,
            top: `${30 + d.y * 60}%`,
            width: 3 + d.c * 2,
            height: 3 + d.c * 2,
            background: "#f6df78",
            boxShadow: "0 0 8px 2px rgb(246 223 120 / 0.7)",
          })}
        />
      ))}
    </>
  ),

  frost: () => (
    <>
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, #b9d9ee 0%, #dcedf8 70%, #eef7fc 100%)" }} />
      <Svg>
        <path d="M0 176 L0 120 L70 70 L120 104 L190 40 L260 110 L320 76 L400 128 L470 58 L540 108 L600 84 L600 176 Z" fill="#8fb7d2" />
        <path d="M190 40 L170 60 L182 58 L192 68 L204 56 L214 62 Z M470 58 L452 76 L464 74 L474 82 L484 72 L492 74 Z M70 70 L56 82 L68 80 L76 86 L86 82 Z" fill="#ffffff" />
        <path d="M0 176 L0 150 L60 128 L140 146 L230 118 L320 148 L420 124 L520 150 L600 132 L600 176 Z" fill="#a9cce2" />
        <path d="M0 176 L0 164 L120 156 L260 166 L400 154 L520 164 L600 158 L600 176 Z" fill="#f4fafd" />
      </Svg>
      {dots("frost-snow", 26).map((d, i) => (
        <span
          key={i}
          className="absolute -top-2 rounded-full"
          style={anim("pc-fall", 5 + d.a * 5, d.b * 10, {
            left: `${d.x}%`,
            width: 3 + d.c * 4,
            height: 3 + d.c * 4,
            background: "#ffffff",
            boxShadow: "0 0 0 1px rgb(90 140 180 / 0.35)",
            ["--dx" as string]: `${(d.a - 0.5) * 50}px`,
            ["--h" as string]: "200px",
          })}
        />
      ))}
    </>
  ),

  platinum: () => (
    <>
      <div className="absolute inset-0" style={{ background: "linear-gradient(115deg, #222b37 0%, #4c5a6c 38%, #8494a8 50%, #4c5a6c 62%, #222b37 100%)" }} />
      <div className="pc-trophies absolute inset-0 opacity-[0.14]" />
      <Svg>
        <defs>
          <linearGradient id="pc-plat" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f3f6fa" />
            <stop offset="0.5" stopColor="#a9b7c8" />
            <stop offset="1" stopColor="#e2e8f0" />
          </linearGradient>
        </defs>
        <g transform="translate(468 18) scale(4.4)" fill="url(#pc-plat)" opacity="0.92">
          <path d="M10 8h12v5a6 6 0 0 1-12 0z" />
          <path d="M10 10H7.5a3.2 3.2 0 0 0 3.3 4M22 10h2.5a3.2 3.2 0 0 1-3.3 4" fill="none" stroke="url(#pc-plat)" strokeWidth="1.6" />
          <rect x="14.5" y="18.5" width="3" height="3.5" />
          <rect x="11" y="22" width="10" height="2.6" rx="0.6" />
        </g>
        {dots("plat-sparkles", 9).map((d, i) => (
          <path
            key={i}
            d={sparkle(20 + d.x * 4.2, 18 + d.y * 1.4, 5 + d.c * 7)}
            fill="#ffffff"
            className="pc-spark"
            style={anim("pc-twinkle", 2.2 + d.a * 2, d.b * 4)}
          />
        ))}
      </Svg>
      <div className="absolute inset-y-0 left-0 w-1/4" style={anim("pc-sheen", 5, 0, { background: "linear-gradient(90deg, transparent, rgb(255 255 255 / 0.35), transparent)" })} />
    </>
  ),

  arcade: () => (
    <>
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, #0d1a33 0%, #13284a 65%, #1b3a5c 100%)" }} />
      {dots("arcade-stars", 22).map((d, i) => (
        <span
          key={i}
          className="absolute"
          style={anim("pc-blink", 1.5 + d.a * 2.5, d.b * 4, {
            left: `${d.x}%`,
            top: `${d.y * 55}%`,
            width: d.c > 0.7 ? 4 : 2,
            height: d.c > 0.7 ? 4 : 2,
            background: d.c > 0.85 ? "#ffd166" : "#e8f0ff",
          })}
        />
      ))}
      <div className="absolute inset-x-0 top-6 h-10 overflow-hidden opacity-80">
        <svg viewBox="0 0 1200 40" preserveAspectRatio="none" className="h-full w-[200%]" style={anim("pc-drift", 30, 0)} shapeRendering="crispEdges">
          {[60, 330, 610, 860, 1110].map((x) => (
            <path key={x} d={`M${x} 24h8v-8h8v-8h24v8h8v8h8v8h-56z`} fill="#d9e4f5" />
          ))}
        </svg>
      </div>
      <Svg aspect="xMidYMax slice">
        <g shapeRendering="crispEdges">
          {PIXEL_HILLS.map(([x, h, c], i) => (
            <rect key={i} x={x} y={176 - h} width="24" height={h} fill={c} />
          ))}
          {PIXEL_BLOCKS.map(([x, y], i) => (
            <g key={i}>
              <rect x={x} y={y} width="16" height="16" fill="#e0763a" />
              <rect x={x} y={y} width="16" height="3" fill="#f6a463" />
              <rect x={x + 13} y={y} width="3" height="16" fill="#a4471c" />
            </g>
          ))}
        </g>
        <g style={anim("pc-hop", 1.6, 0)} className="pc-coin" shapeRendering="crispEdges">
          <rect x="420" y="70" width="12" height="16" fill="#ffd166" />
          <rect x="424" y="74" width="4" height="8" fill="#c48a14" />
        </g>
      </Svg>
    </>
  ),
};

const BODIES: Record<string, () => ReactNode> = {
  ember: () => (
    <>
      <div className="absolute inset-0" style={{ background: "radial-gradient(70% 60% at 85% 110%, rgb(224 85 28 / 0.22), transparent 70%)" }} />
      {dots("ember-body", 8).map((d, i) => (
        <span
          key={i}
          className="absolute bottom-0 rounded-full"
          style={anim("pc-rise", 6 + d.a * 4, d.b * 10, {
            left: `${55 + d.x * 0.45}%`,
            width: 2 + d.c * 2,
            height: 2 + d.c * 2,
            background: "#ff9a4a",
            opacity: 0.5,
            ["--dx" as string]: `${(d.a - 0.5) * 40}px`,
            ["--h" as string]: "260px",
          })}
        />
      ))}
    </>
  ),
  circuit: () => <div className="pc-grid absolute inset-0 opacity-60" />,
  ocean: () => (
    <>
      <div className="absolute inset-0" style={{ background: "radial-gradient(60% 70% at 100% 0%, rgb(60 160 210 / 0.18), transparent 70%)" }} />
      {dots("ocean-body", 6).map((d, i) => (
        <span
          key={i}
          className="absolute bottom-0 rounded-full border"
          style={anim("pc-rise", 8 + d.a * 5, d.b * 12, {
            left: `${60 + d.x * 0.38}%`,
            width: 4 + d.c * 5,
            height: 4 + d.c * 5,
            borderColor: "rgb(220 245 255 / 0.4)",
            ["--dx" as string]: `${(d.a - 0.5) * 20}px`,
            ["--h" as string]: "280px",
          })}
        />
      ))}
    </>
  ),
  forest: () => (
    <>
      {dots("forest-body", 7).map((d, i) => (
        <span
          key={i}
          className="absolute rounded-full"
          style={anim("pc-blink", 3 + d.a * 3, d.b * 6, {
            left: `${62 + d.x * 0.36}%`,
            top: `${10 + d.y * 80}%`,
            width: 3,
            height: 3,
            background: "#f6df78",
            boxShadow: "0 0 6px 1px rgb(246 223 120 / 0.6)",
          })}
        />
      ))}
    </>
  ),
  frost: () => (
    <>
      {dots("frost-body", 10).map((d, i) => (
        <span
          key={i}
          className="absolute -top-2 rounded-full"
          style={anim("pc-fall", 9 + d.a * 6, d.b * 14, {
            left: `${58 + d.x * 0.4}%`,
            width: 3 + d.c * 3,
            height: 3 + d.c * 3,
            background: "#ffffff",
            boxShadow: "0 0 0 1px rgb(90 140 180 / 0.3)",
            ["--dx" as string]: `${(d.a - 0.5) * 30}px`,
            ["--h" as string]: "320px",
          })}
        />
      ))}
    </>
  ),
  platinum: () => <div className="pc-trophies absolute inset-0 opacity-[0.05]" />,
  arcade: () => (
    <>
      {dots("arcade-body", 10).map((d, i) => (
        <span
          key={i}
          className="absolute"
          style={anim("pc-blink", 2 + d.a * 3, d.b * 5, {
            left: `${55 + d.x * 0.44}%`,
            top: `${d.y * 90}%`,
            width: 2,
            height: 2,
            background: "#e8f0ff",
          })}
        />
      ))}
    </>
  ),
};

function wave(width: number, height: number, amp: number, period: number) {
  let d = `M0 ${height}`;
  for (let x = 0; x <= width; x += period) {
    d += ` Q${x + period / 4} ${height / 2 - amp} ${x + period / 2} ${height / 2} T${x + period} ${height / 2}`;
  }
  return `${d} L${width} ${height} Z`;
}

const TRACES = [
  "M0 30 H90 L120 60 H220 L240 40 H330",
  "M0 96 H60 L90 126 H180",
  "M0 150 H140 L170 120 H260 L290 150 H380",
  "M600 160 H520 L500 140 H420 L390 110 H330",
  "M600 20 H560 L540 40 H450 L420 70 H360",
  "M220 176 V150 L250 120 V90 L280 60",
];
const NODES = [
  [330, 40],
  [180, 126],
  [380, 150],
  [330, 110],
  [360, 70],
  [280, 60],
];
const PIXEL_HILLS: [number, number, string][] = Array.from({ length: 26 }, (_, i) => {
  const h = 16 + Math.round((Math.sin(i * 0.7) + 1) * 14 + (i % 3) * 6);
  return [i * 24, h, i % 2 ? "#1f6b4a" : "#24805a"];
});
const PIXEL_BLOCKS: [number, number][] = [
  [380, 98],
  [396, 98],
  [412, 98],
  [428, 98],
  [444, 98],
  [180, 112],
  [196, 112],
];
