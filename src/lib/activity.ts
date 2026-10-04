import { prisma } from "./db";

/**
 * Home page feeds. Each one merges members' synced history with the tracked
 * PSN players (refreshed by psn:track and the players cron), so the site has
 * real activity even before many people sign up.
 */

/** Linked members who don't want to appear in public activity. */
async function privateMemberAccounts() {
  const rows = await prisma.psnAccount.findMany({
    where: { accountId: { not: null }, user: { OR: [{ showActivity: false }, { profileVisibility: { not: "PUBLIC" } }] } },
    select: { accountId: true },
  });
  return rows.map((r) => r.accountId!);
}

const visiblePlayer = (excluded: string[]) => ({ hidden: false, trophiesPrivate: false, accountId: { notIn: excluded } });

export type PlatinumItem = {
  key: string;
  at: Date;
  game: { slug: string; title: string; titleKey: string; coverHue: number; iconUrl: string | null };
  player: { name: string; href: string; country: string | null };
};

export async function latestPlatinums(limit = 6): Promise<PlatinumItem[]> {
  const excluded = await privateMemberAccounts();
  const [memberPlats, playerPlats, links] = await Promise.all([
    prisma.userGame.findMany({
      where: { hasPlatinum: true, platinumAt: { not: null }, user: { showActivity: true, profileVisibility: "PUBLIC" } },
      orderBy: { platinumAt: "desc" },
      take: limit,
      include: { user: { include: { psn: true } }, game: true },
    }),
    prisma.psnPlayerTitle.findMany({
      where: { platinumAt: { not: null }, player: visiblePlayer(excluded) },
      orderBy: { platinumAt: "desc" },
      take: limit * 2,
      include: { player: true, game: true },
    }),
    prisma.psnAccount.findMany({
      where: { verified: true, accountId: { not: null } },
      select: { accountId: true, user: { select: { username: true } } },
    }),
  ]);
  const memberOf = new Map(links.map((l) => [l.accountId!, l.user.username]));
  const seen = new Set<string>();
  const items: PlatinumItem[] = [];

  for (const p of memberPlats) {
    seen.add(`${p.user.psn?.accountId}:${p.gameId}`);
    items.push({
      key: `m-${p.id}`,
      at: p.platinumAt!,
      game: p.game,
      player: { name: p.user.psn?.onlineId ?? p.user.username, href: `/u/${p.user.username}`, country: p.user.country },
    });
  }
  for (const p of playerPlats) {
    if (seen.has(`${p.accountId}:${p.gameId}`)) continue;
    const username = memberOf.get(p.accountId);
    items.push({
      key: `p-${p.accountId}-${p.npCommunicationId}`,
      at: p.platinumAt!,
      game: p.game,
      player: {
        name: p.player.onlineId,
        href: username ? `/u/${username}` : `/psn/${encodeURIComponent(p.player.onlineId)}`,
        country: p.player.country,
      },
    });
  }
  // The PS4 and PS5 lists of one game often platinum together; show the game once per player.
  const once = new Set<string>();
  return items
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .filter((i) => {
      const k = `${i.player.href}:${i.game.titleKey || i.game.slug}`;
      if (once.has(k)) return false;
      once.add(k);
      return true;
    })
    .slice(0, limit);
}

/** Games the most distinct players (members and tracked) earned trophies in since `since`. */
export async function trendingGameIds(since: Date, limit = 6) {
  const excluded = await privateMemberAccounts();
  const [members, players] = await Promise.all([
    prisma.$queryRaw<{ gameId: string; n: number }[]>`
      SELECT t."gameId" AS "gameId", CAST(COUNT(DISTINCT ut."userId") AS INTEGER) AS n
      FROM "UserTrophy" ut JOIN "Trophy" t ON t."id" = ut."trophyId"
      WHERE ut."earnedAt" >= ${since}
      GROUP BY t."gameId"`,
    prisma.psnPlayerTitle.groupBy({
      by: ["gameId"],
      where: { lastUpdated: { gte: since }, player: visiblePlayer(excluded) },
      _count: true,
    }),
  ]);
  const counts = new Map<string, number>();
  for (const m of members) counts.set(m.gameId, (counts.get(m.gameId) ?? 0) + Number(m.n));
  for (const p of players) counts.set(p.gameId, (counts.get(p.gameId) ?? 0) + p._count);
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([gameId]) => gameId);
}

/** Headline numbers: everyone we know about, not only members. */
export async function siteTotals() {
  const [players, sums, users, games] = await Promise.all([
    prisma.psnPlayer.count({ where: { hidden: false, trophiesPrivate: false } }),
    prisma.psnPlayer.aggregate({
      where: { hidden: false, trophiesPrivate: false },
      _sum: { platinum: true, gold: true, silver: true, bronze: true },
    }),
    prisma.user.findMany({ select: { id: true, psn: { select: { accountId: true } } } }),
    // One game per title: its PS4, PS5 and regional lists count once. Counted in the database, not by loading every game.
    prisma.$queryRaw<{ n: number }[]>`SELECT CAST(COUNT(DISTINCT "titleKey") AS INTEGER) AS n FROM "Game"`.then((r) => Number(r[0]?.n ?? 0)),
  ]);
  // Members without a PSN summary (not linked, not synced yet, or demo mode) count from their synced trophies.
  const summarised = new Set(
    (
      await prisma.psnPlayer.findMany({
        where: { accountId: { in: users.flatMap((u) => (u.psn?.accountId ? [u.psn.accountId] : [])) } },
        select: { accountId: true },
      })
    ).map((p) => p.accountId),
  );
  const others = users.filter((u) => !u.psn?.accountId || !summarised.has(u.psn.accountId)).map((u) => u.id);
  const [otherTrophies, otherPlats] = await Promise.all([
    prisma.userTrophy.count({ where: { userId: { in: others } } }),
    prisma.userGame.count({ where: { userId: { in: others }, hasPlatinum: true } }),
  ]);
  const s = sums._sum;
  return {
    members: users.length,
    games,
    hunters: players + others.length,
    trophies: (s.platinum ?? 0) + (s.gold ?? 0) + (s.silver ?? 0) + (s.bronze ?? 0) + otherTrophies,
    platinums: (s.platinum ?? 0) + otherPlats,
  };
}

/** Most-played games that nobody has written a guide for yet. */
export async function gamesNeedingGuides(limit = 5) {
  const rows = await prisma.psnPlayerTitle.groupBy({
    by: ["gameId"],
    where: { game: { guides: { none: {} } } },
    _count: true,
    orderBy: { _count: { gameId: "desc" } },
    take: limit,
  });
  const games = await prisma.game.findMany({ where: { id: { in: rows.map((r) => r.gameId) } } });
  return rows.map((r) => ({ game: games.find((g) => g.id === r.gameId)!, players: r._count })).filter((r) => r.game);
}

const gameCard = { id: true, slug: true, title: true, titleKey: true, platforms: true, iconUrl: true, coverHue: true } as const;

/** Keeps the first list of each game (its PS4, PS5 and regional lists share a titleKey). */
function onePerGame<T extends { id: string; titleKey: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((g) => {
    const k = g.titleKey || g.id;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * The newest trophy lists we know of. PSN hands out list ids (NPWR12345_00)
 * in order, so the highest ids are the lists most recently created, often
 * before the game is out. One entry per game; `counts` is empty until the
 * list itself has been loaded.
 */
export async function newTrophyLists(take: number) {
  // A few extra rows, then one per game here. (Prisma's distinct loads every matching list to do it.)
  let games = onePerGame(
    await prisma.game.findMany({ where: { npCommunicationId: { startsWith: "NPWR" } }, orderBy: { npCommunicationId: "desc" }, take: take * 4, select: gameCard }),
  ).slice(0, take);
  // The demo catalogue has no PSN ids: newest rows instead.
  if (!games.length) games = onePerGame(await prisma.game.findMany({ orderBy: { createdAt: "desc" }, take: take * 4, select: gameCard })).slice(0, take);

  const rows = await prisma.trophy.groupBy({ by: ["gameId", "type"], where: { gameId: { in: games.map((g) => g.id) } }, _count: { _all: true } });
  return games.map((g) => {
    const counts: Record<string, number> = {};
    for (const r of rows) if (r.gameId === g.id) counts[r.type] = r._count._all;
    return { ...g, counts };
  });
}

/**
 * Newest DLC trophy packs: first those found when a list we already had grew
 * (DLC released after we saw the game), then DLC of the newest games.
 * A pack shared by a game's PS4 and PS5 lists shows once.
 */
export async function newDlc(take: number) {
  const groups = await prisma.trophyGroup.findMany({
    where: { isDlc: true },
    orderBy: [{ addedLater: "desc" }, { createdAt: "desc" }, { game: { npCommunicationId: "desc" } }],
    take: take * 3,
    include: { game: { select: gameCard }, _count: { select: { trophies: true } } },
  });
  const seen = new Set<string>();
  return groups
    .filter((g) => {
      const key = `${g.game.titleKey || g.game.id}:${g.name.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, take);
}

/** The most recently created sessions that haven't started yet. */
export function latestSessions(take: number) {
  return prisma.session.findMany({
    where: { startsAt: { gte: new Date() } },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      game: { select: gameCard },
      host: { select: { username: true, psn: { select: { onlineId: true } } } },
      _count: { select: { members: true } },
    },
  });
}

/**
 * Real PSN game icons for the home page hero, most played first and one per
 * game. Only games with a trailer on IGDB, which keeps it to proper releases
 * rather than the trophy-farm titles top hunters play most. PS5 icons are
 * square, so they come first; PS4 ones are cropped.
 */
export async function heroCovers(take: number) {
  const games = await prisma.game.findMany({
    where: { iconUrl: { not: null }, trailerYoutubeId: { not: null } },
    orderBy: [{ npServiceName: "desc" }, { playerTitles: { _count: "desc" } }, { userGames: { _count: "desc" } }],
    distinct: ["titleKey"],
    take,
    select: { id: true, title: true, iconUrl: true, coverHue: true },
  });
  return games;
}

/**
 * Who played a trophy list most recently: members (by their last trophy on
 * it) and tracked PSN players (by PSN's last-updated time), newest first.
 * A member who is also tracked shows once, as the member.
 */
export async function recentPlayers(gameId: string, take: number) {
  const excluded = await privateMemberAccounts();
  const [members, tracked] = await Promise.all([
    prisma.userGame.findMany({
      where: { gameId, lastEarned: { not: null }, user: { profileVisibility: "PUBLIC", showActivity: true } },
      orderBy: { lastEarned: "desc" },
      take,
      select: {
        progress: true,
        hasPlatinum: true,
        lastEarned: true,
        user: { select: { username: true, country: true, avatarHue: true, avatar: true, psn: { select: { onlineId: true, avatarUrl: true, accountId: true } } } },
      },
    }),
    prisma.psnPlayerTitle.findMany({
      where: { gameId, player: visiblePlayer(excluded) },
      orderBy: { lastUpdated: "desc" },
      take: take * 2,
      select: { progress: true, hasPlatinum: true, lastUpdated: true, player: { select: { accountId: true, onlineId: true, avatarUrl: true, country: true } } },
    }),
  ]);
  const memberAccounts = new Set(members.flatMap((m) => (m.user.psn?.accountId ? [m.user.psn.accountId] : [])));
  return [
    ...members.map((m) => ({
      key: `u:${m.user.username}`,
      name: m.user.psn?.onlineId ?? m.user.username,
      href: `/u/${m.user.username}`,
      avatarUrl: m.user.psn?.avatarUrl ?? null,
      avatarHue: m.user.avatarHue,
      avatar: m.user.avatar as string | null,
      country: m.user.country,
      progress: m.progress,
      hasPlatinum: m.hasPlatinum,
      at: m.lastEarned!,
    })),
    ...tracked
      .filter((t) => !memberAccounts.has(t.player.accountId))
      .map((t) => ({
        key: `p:${t.player.accountId}`,
        name: t.player.onlineId,
        href: `/psn/${encodeURIComponent(t.player.onlineId)}`,
        avatarUrl: t.player.avatarUrl,
        avatarHue: 0,
        avatar: null as string | null,
        country: t.player.country,
        progress: t.progress,
        hasPlatinum: t.hasPlatinum,
        at: t.lastUpdated,
      })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, take);
}
