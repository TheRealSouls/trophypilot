import { prisma } from "./db";

const PLATFORM_ORDER = ["PS5", "PS4", "PS3", "PSVITA", "PSVR", "PSVR2"];

export function sortPlatforms(platforms: Iterable<string>) {
  return [...new Set(platforms)].sort((a, b) => {
    const ia = PLATFORM_ORDER.indexOf(a);
    const ib = PLATFORM_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
  });
}

export type Family = { lists: number; platforms: string[] };

/**
 * One game can have several PSN trophy lists (per platform and often per
 * region). For each titleKey, returns how many lists exist and on which
 * platforms, so results can show one row per game.
 */
export async function familiesFor(keys: string[]): Promise<Map<string, Family>> {
  const unique = [...new Set(keys.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const rows = await prisma.game.findMany({
    where: { titleKey: { in: unique } },
    select: { titleKey: true, platforms: true },
  });
  const out = new Map<string, { lists: number; platforms: Set<string> }>();
  for (const r of rows) {
    const f = out.get(r.titleKey) ?? { lists: 0, platforms: new Set<string>() };
    f.lists++;
    for (const p of r.platforms.split(",")) if (p) f.platforms.add(p);
    out.set(r.titleKey, f);
  }
  return new Map([...out].map(([k, f]) => [k, { lists: f.lists, platforms: sortPlatforms(f.platforms) }]));
}

/** The other trophy lists of the same game, newest platform first. */
export async function siblingLists(game: { id: string; titleKey: string }) {
  if (!game.titleKey) return [];
  const rows = await prisma.game.findMany({
    where: { titleKey: game.titleKey },
    select: {
      id: true,
      slug: true,
      title: true,
      platforms: true,
      npCommunicationId: true,
      _count: { select: { trophies: true, userGames: true } },
    },
    orderBy: { npCommunicationId: "asc" },
  });
  if (rows.length < 2) return [];
  return rows
    .map((r) => ({
      ...r,
      // Only right for the game that filled the cache: pages compare ids themselves (lists are shared between stacks).
      current: r.id === game.id,
      platform: sortPlatforms(r.platforms.split(","))[0] ?? "",
    }))
    .sort((a, b) => PLATFORM_ORDER.indexOf(a.platform) - PLATFORM_ORDER.indexOf(b.platform));
}
