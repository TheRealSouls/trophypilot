import { faTwitch, faYoutube } from "@fortawesome/free-brands-svg-icons";

/**
 * Brand icons from Font Awesome Free (https://fontawesome.com, icons CC BY 4.0), drawn as inline SVG.
 * Only these shapes are bundled into the page: no Font Awesome script, font or kit request, so no
 * extra downloads and no kit page-view limits.
 */
const ICONS = { youtube: faYoutube, twitch: faTwitch } as const;

export type Brand = keyof typeof ICONS;

export function BrandIcon({ brand, className = "h-3.5 w-3.5" }: { brand: Brand; className?: string }) {
  const [width, height, , , path] = ICONS[brand].icon;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={className} fill="currentColor" aria-hidden focusable="false">
      <path d={Array.isArray(path) ? path.join(" ") : path} />
    </svg>
  );
}
