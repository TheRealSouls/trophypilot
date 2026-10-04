/**
 * The loading animation: a trophy built from cubes that drop in one by one,
 * bottom up, hold for a moment, then clear away in the same order and start
 * again. SVG and CSS only (globals.css, .cube-loader), so it runs before any
 * script loads. For people who ask for reduced motion it shows the finished
 * trophy, still. It fades in after a short delay so quick pages never flash it.
 */

// The trophy, as [column, row] from the bottom: base, stem, cup and handles.
const CUBES: [number, number][] = [
  [1, 0], [2, 0], [3, 0], [4, 0], [5, 0],
  [3, 1],
  [3, 2],
  [2, 3], [3, 3], [4, 3],
  [0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4],
  [0, 5], [1, 5], [2, 5], [3, 5], [4, 5], [5, 5], [6, 5],
];

const S = 16; // cube size
const D = 7; // depth offset of the top and side faces
const W = 7 * S + D;
const H = 6 * S + D;

export function CubeLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="cube-loader flex flex-col items-center gap-3 py-6" aria-hidden>
      <svg viewBox={`-4 -4 ${W + 8} ${H + 14}`} width={W + 8} height={H + 14} className="overflow-visible">
        <ellipse cx={(7 * S) / 2 + D / 2} cy={H + 6} rx={(7 * S) / 2} ry="4" className="cube-shadow" />
        {CUBES.map(([c, r], i) => {
          const x = c * S;
          const y = H - (r + 1) * S;
          return (
            <g key={i} className="cube" style={{ animationDelay: `${i * 70}ms` }}>
              <path d={`M${x} ${y} l${D} ${-D} h${S} l${-D} ${D} z`} className="cube-top" />
              <path d={`M${x + S} ${y} l${D} ${-D} v${S} l${-D} ${D} z`} className="cube-side" />
              <rect x={x} y={y} width={S} height={S} className="cube-front" />
            </g>
          );
        })}
      </svg>
      <span className="text-sm font-semibold text-muted">{label}…</span>
    </div>
  );
}
