import { prisma } from "./db";

const PLATFORM_ORDER = ["PS5", "PS4", "PS3", "PSVITA", "PSVR", "PSVR2"];

export function sortPlatforms(platforms: Iterable<string>) {
  return [...new Set(platforms)].sort((a, b) => {
    const ia = PLATFORM_ORDER.indexOf(a);
    const ib = PLATFORM_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
  });
}

/**
 * Trophies per list, for these lists only. Prisma's own relation count
 * (_count: { trophies }) adds up the whole Trophy table (400k rows) on every
 * call whatever the filter, which is what used up the database's disk budget.
 */
export async function trophyCounts(gameIds: string[]): Promise<Map<string, number>> {
  const ids = [...new Set(gameIds)];
  if (!ids.length) return new Map();
  const rows = await prisma.trophy.groupBy({ by: ["gameId"], where: { gameId: { in: ids } }, _count: { _all: true } });
  return new Map(rows.map((r) => [r.gameId, r._count._all]));
}

/** The rows with `_count.trophies` filled in, the shape Prisma's relation count gave. */
export async function withTrophyCounts<T extends { id: string }>(rows: T[]): Promise<(T & { _count: { trophies: number } })[]> {
  const counts = await trophyCounts(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, _count: { trophies: counts.get(r.id) ?? 0 } }));
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
    },
    orderBy: { npCommunicationId: "asc" },
  });
  if (rows.length < 2) return [];
  const ids = rows.map((r) => r.id);
  const [trophies, members] = await Promise.all([
    trophyCounts(ids),
    prisma.userGame.groupBy({ by: ["gameId"], where: { gameId: { in: ids } }, _count: { _all: true } }),
  ]);
  const playing = new Map(members.map((m) => [m.gameId, m._count._all]));
  return rows
    .map((r) => ({
      ...r,
      _count: { trophies: trophies.get(r.id) ?? 0, userGames: playing.get(r.id) ?? 0 },
      // Only right for the game that filled the cache: pages compare ids themselves (lists are shared between stacks).
      current: r.id === game.id,
      platform: sortPlatforms(r.platforms.split(","))[0] ?? "",
    }))
    .sort((a, b) => PLATFORM_ORDER.indexOf(a.platform) - PLATFORM_ORDER.indexOf(b.platform));
}
