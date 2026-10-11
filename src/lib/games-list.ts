import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { cached } from "./cache";
import { GAME_PLATFORMS } from "./utils";

/** The games list (/games): filters, sorts and one page of cards. */

export const GAME_SORTS = {
  popular: "Most played",
  release: "Newest",
  easiest: "Easiest platinum",
  hardest: "Hardest platinum",
  shortest: "Shortest",
  title: "A to Z",
} as const;
export type GameSort = keyof typeof GAME_SORTS;

export { GAME_PLATFORMS };
export const GAMES_PER_PAGE = 60;

export type GameFilters = { q: string; platform: string; genre: string; online: boolean };

/**
 * One page of the games list, cached for half an hour (it changes slowly) and
 * served stale while it refreshes, so filters answer straight away.
 */
export function gamesListPage(f: GameFilters, sort: GameSort, page: number) {
  return cached(`games:${JSON.stringify([f, sort, page])}`, () => loadPage(f, sort, page), {
    ttlMs: 30 * 60_000,
    maxStaleMs: 6 * 3600_000,
    tags: ["games"],
  });
}

export function gameGenres() {
  return cached(
    "games:genres",
    async () =>
      (await prisma.$queryRaw<{ genre: string }[]>`SELECT DISTINCT "genre" FROM "Game" WHERE "genre" IS NOT NULL ORDER BY "genre"`).map(
        (g) => g.genre,
      ),
    { ttlMs: 60 * 60_000, tags: ["games"] },
  );
}

/**
 * Loads the first page of each platform (and all platforms) into the cache,
 * so the first visitor after a restart doesn't wait. Called by the games cron.
 */
export async function warmGamesList() {
  const none = { q: "", platform: "", genre: "", online: false };
  for (const platform of ["", ...GAME_PLATFORMS]) await gamesListPage({ ...none, platform }, "popular", 1);
  await gameGenres();
}

/**
 * Stores how many players (tracked players and members) have each game, on
 * every list of the game, for the "Most played" order. Only rows whose count
 * changed are written. Run by the players and games crons.
 */
export async function refreshGamePopularity() {
  return prisma.$executeRaw`
    UPDATE "Game" g SET "players" = fam.n
    FROM (
      SELECT g2."id", SUM(COUNT(*)) OVER (PARTITION BY COALESCE(NULLIF(g2."titleKey", ''), g2."id"))::int AS n
      FROM (SELECT "gameId" FROM "PsnPlayerTitle" UNION ALL SELECT "gameId" FROM "UserGame") x
      JOIN "Game" g2 ON g2."id" = x."gameId"
      GROUP BY g2."id"
    ) fam
    WHERE g."id" = fam."id" AND g."players" IS DISTINCT FROM fam.n`;
}

/**
 * One card per game: lists that share a titleKey collapse into one,
 * represented by the PS5 list when there is one. The database picks the ids
 * (DISTINCT ON), so only those rows load.
 */
async function loadPage(f: GameFilters, sort: GameSort, page: number) {
  const where: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (f.q) where.push(Prisma.sql`g."title" ILIKE ${`%${f.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`}`);
  if (f.platform) where.push(Prisma.sql`g."platforms" LIKE ${`%${f.platform}%`}`);
  if (f.genre) where.push(Prisma.sql`g."genre" = ${f.genre}`);
  if (f.online) where.push(Prisma.sql`g."hasOnlineTrophies" = FALSE`);
  const filter = Prisma.join(where, " AND ");

  const order = {
    popular: Prisma.sql`r."players" DESC`,
    release: Prisma.sql`r."releaseDate" DESC NULLS LAST`,
    easiest: Prisma.sql`r."difficulty" ASC NULLS LAST`,
    hardest: Prisma.sql`r."difficulty" DESC NULLS LAST`,
    shortest: Prisma.sql`r."hoursToPlatinum" ASC NULLS LAST`,
    title: Prisma.sql`r."title" ASC`,
  }[sort];

  const [ids, count] = await Promise.all([
    prisma.$queryRaw<{ id: string }[]>`
      SELECT r."id" FROM (
        SELECT DISTINCT ON (COALESCE(NULLIF(g."titleKey", ''), g."id"))
          g."id", g."title", g."releaseDate", g."difficulty", g."hoursToPlatinum", g."players"
        FROM "Game" g
        WHERE ${filter}
        ORDER BY COALESCE(NULLIF(g."titleKey", ''), g."id"), g."npServiceName" DESC NULLS LAST, g."title"
      ) r
      ORDER BY ${order}, r."title" ASC
      LIMIT ${GAMES_PER_PAGE} OFFSET ${(page - 1) * GAMES_PER_PAGE}`,
    prisma.$queryRaw<{ n: number }[]>`
      SELECT CAST(COUNT(DISTINCT COALESCE(NULLIF(g."titleKey", ''), g."id")) AS INTEGER) AS n FROM "Game" g WHERE ${filter}`,
  ]);
  const rows = await prisma.game.findMany({
    where: { id: { in: ids.map((r) => r.id) } },
    select: {
      id: true,
      slug: true,
      title: true,
      titleKey: true,
      platforms: true,
      iconUrl: true,
      coverHue: true,
      difficulty: true,
      hoursToPlatinum: true,
      genre: true,
      trophies: { where: { type: "PLATINUM" }, select: { earnedRate: true } },
      _count: { select: { trophies: true } },
    },
  });
  const byId = new Map(rows.map((g) => [g.id, g]));
  return { games: ids.flatMap((r) => byId.get(r.id) ?? []), total: Number(count[0]?.n ?? 0) };
}
