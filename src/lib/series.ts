import { prisma } from "./db";
import { cached } from "./cache";
import { cleanTitle, slugify } from "./utils";
import { sortPlatforms } from "./games";

/**
 * Game series (Call of Duty, Uncharted) for the Series tab on game pages.
 * Most come from IGDB's franchise for the game; staff can also put a game in a
 * series by hand. Every trophy list of one game (same titleKey) shares it.
 */

/** A free slug for a new series: the name, then the name with a number. */
async function freeSlug(name: string) {
  const base = slugify(name) || "series";
  for (let n = 1; n < 50; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    if (!(await prisma.series.findUnique({ where: { slug }, select: { id: true } }))) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** The series for an IGDB franchise, made the first time it's seen. */
export async function seriesForFranchise(f: { id: number; name: string }) {
  const known = await prisma.series.findUnique({ where: { igdbId: f.id }, select: { id: true } });
  if (known) return known.id;
  try {
    return (await prisma.series.create({ data: { igdbId: f.id, name: f.name.trim(), slug: await freeSlug(f.name) }, select: { id: true } })).id;
  } catch {
    // Made at the same moment by another request.
    return (await prisma.series.findUniqueOrThrow({ where: { igdbId: f.id }, select: { id: true } })).id;
  }
}

/** The series with this name (any capitals), made if there's none. For staff linking games by hand. */
export async function seriesNamed(name: string) {
  const clean = name.trim().replace(/\s+/g, " ");
  const known = await prisma.series.findFirst({ where: { name: { equals: clean, mode: "insensitive" } }, select: { id: true } });
  if (known) return known.id;
  return (await prisma.series.create({ data: { name: clean, slug: await freeSlug(clean) }, select: { id: true } })).id;
}

/** Puts every trophy list of a game in a series (or takes them out, with null). */
export async function setFamilySeries(game: { id: string; titleKey: string }, seriesId: string | null) {
  await prisma.game.updateMany({ where: game.titleKey ? { titleKey: game.titleKey } : { id: game.id }, data: { seriesId } });
}

export type SeriesEntry = {
  key: string;
  title: string;
  iconUrl: string | null;
  coverHue: number;
  released: Date | null;
  /** One trophy list per platform (the most played), newest platform first. */
  platforms: { platform: string; slug: string }[];
};

/**
 * The games in a series, one entry per game with its platforms, oldest first.
 * The same for every visitor, so shared for half an hour.
 */
export function seriesEntries(seriesId: string) {
  return cached(
    `series:${seriesId}`,
    async () => {
      const lists = await prisma.game.findMany({
        where: { seriesId },
        orderBy: [{ players: "desc" }, { title: "asc" }],
        // A long-running franchise has a few hundred lists at most.
        take: 600,
        select: { id: true, slug: true, title: true, titleKey: true, platforms: true, releaseDate: true, iconUrl: true, coverHue: true },
      });
      const byGame = new Map<string, typeof lists>();
      for (const l of lists) {
        const key = l.titleKey || l.id;
        byGame.set(key, [...(byGame.get(key) ?? []), l]);
      }
      const entries: SeriesEntry[] = [...byGame.entries()].map(([key, family]) => {
        const top = family[0];
        const slugOf = new Map<string, string>();
        // The most played list per platform (the family is already in that order).
        for (const l of family) for (const p of l.platforms.split(",")) if (p && !slugOf.has(p)) slugOf.set(p, l.slug);
        const dates = family.map((l) => l.releaseDate?.getTime()).filter((d): d is number => d != null);
        return {
          key,
          title: cleanTitle(top.title),
          iconUrl: family.find((l) => l.iconUrl)?.iconUrl ?? null,
          coverHue: top.coverHue,
          released: dates.length ? new Date(Math.min(...dates)) : null,
          platforms: sortPlatforms(slugOf.keys()).map((platform) => ({ platform, slug: slugOf.get(platform)! })),
        };
      });
      // Oldest first; games with no known release date go last.
      return entries.sort((a, b) => (a.released?.getTime() ?? Infinity) - (b.released?.getTime() ?? Infinity) || a.title.localeCompare(b.title));
    },
    { ttlMs: 30 * 60_000, maxStaleMs: 6 * 3_600_000, tags: ["series"] },
  );
}
