import { psnImage } from "@/lib/utils";

/**
 * The home page hero's background: a tilted wall of real PSN game icons
 * from the catalogue (the most played games), fading into the page on the
 * left and bottom. It reaches the right edge of the window and is hidden on
 * small screens, where the hero stacks.
 */
export function HeroCovers({ covers }: { covers: { id: string; title: string; iconUrl: string | null }[] }) {
  const tiles = covers.filter((c) => c.iconUrl);
  // Too few real icons (demo mode) looks broken rather than decorative.
  if (tiles.length < 12) return null;
  return (
    <div
      aria-hidden
      className="hero-fade pointer-events-none absolute inset-y-0 hidden overflow-hidden opacity-90 lg:block"
      style={{ left: "42%", right: "calc((100% - 100vw) / 2)" }}
    >
      <div className="absolute -right-6 -top-24 grid w-[118%] rotate-[-9deg] grid-cols-6 gap-3">
        {tiles.map((c) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={c.id}
            src={psnImage(c.iconUrl!, 160)}
            alt=""
            referrerPolicy="no-referrer"
            className="aspect-square w-full rounded-xl bg-surface-3 object-cover"
          />
        ))}
      </div>
    </div>
  );
}
