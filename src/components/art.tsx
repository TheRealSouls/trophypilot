import clsx from "clsx";
import { artHue, hashString, mulberry32, psnImage } from "@/lib/utils";

/** Roughly how wide a tile is drawn, from its Tailwind width classes (w-12 is 48px). */
function shownWidth(className: string | undefined, size: "sm" | "md" | "lg") {
  const widths = [...(className ?? "").matchAll(/(?:^|\s)(?:[a-z]+:)?w-(\d+)(?=\s|$)/g)].map((m) => Number(m[1]) * 4);
  if (widths.length && !/(?:^|\s)(?:[a-z]+:)?w-full/.test(className ?? "")) return Math.max(...widths);
  return size === "lg" ? 256 : 192;
}

/**
 * Game tile. Real PSN titles use their trophy icon; the fictional demo
 * catalogue gets a flat, generated cover so it needs no copyrighted box art.
 */
export function GameArt({
  title,
  hue,
  iconUrl,
  className,
  size = "md",
}: {
  title: string;
  hue: number;
  iconUrl?: string | null;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  if (iconUrl) {
    return (
      // PS4 icons are wide and PS5 icons are square, so letterbox rather than crop.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={psnImage(iconUrl, shownWidth(className, size))}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        className={clsx("aspect-square shrink-0 rounded-md border border-line bg-surface-2 object-contain", className)}
      />
    );
  }
  hue = artHue(hue);
  const r = mulberry32(hashString(title));
  const initials = title
    .replace(/[^A-Za-z0-9 ]/g, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
  const spacing = 6 + Math.floor(r() * 6);
  const angle = [0, 45, 90, 135][Math.floor(r() * 4)];
  const band = 55 + r() * 25;
  const id = `hatch-${hashString(title).toString(36)}`;
  return (
    <div
      className={clsx("relative aspect-square shrink-0 overflow-hidden rounded-md border border-line", className)}
      style={{ background: `hsl(${hue} 22% 20%)` }}
      aria-hidden
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
        <defs>
          <pattern id={id} width={spacing} height={spacing} patternUnits="userSpaceOnUse" patternTransform={`rotate(${angle})`}>
            <line x1="0" y1="0" x2="0" y2={spacing} stroke={`hsl(${hue} 25% 32%)`} strokeWidth="1.5" />
          </pattern>
        </defs>
        <rect width="100" height={band} fill={`url(#${id})`} />
        <rect y={band} width="100" height={100 - band} fill={`hsl(${hue} 30% 14%)`} />
      </svg>
      <span
        className={clsx(
          "absolute bottom-0 left-0 p-[8%] font-bold leading-none tracking-tight text-white/85",
          size === "sm" ? "text-sm" : size === "lg" ? "text-5xl" : "text-2xl",
        )}
      >
        {initials}
      </span>
    </div>
  );
}

/** Flat generated "screenshot" landscapes for the demo catalogue. */
export function SceneArt({ seed, hue, className }: { seed: string; hue: number; className?: string }) {
  const r = mulberry32(hashString(seed));
  const h = artHue(hue);
  const sunX = 15 + r() * 70;
  const layers = [0, 1, 2].map((i) => {
    const base = 55 + i * 12;
    const pts = Array.from({ length: 9 }, (_, k) => `${k * 12.5},${base - r() * (22 - i * 5)}`).join(" L ");
    return { d: `M0,100 L ${pts} L100,100 Z`, l: 20 - i * 4 };
  });
  return (
    <div className={clsx("relative aspect-video overflow-hidden rounded-lg border border-line", className)} aria-hidden>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
        <rect width="100" height="100" fill={`hsl(${h} 20% 26%)`} />
        <circle cx={sunX} cy={30 + r() * 15} r={6 + r() * 6} fill={`hsl(${(h + 20) % 360} 22% 48%)`} />
        {layers.map((l, i) => (
          <path key={i} d={l.d} fill={`hsl(${h} 22% ${l.l}%)`} />
        ))}
      </svg>
    </div>
  );
}
