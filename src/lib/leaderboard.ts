import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { cached } from "./cache";
import { getFriendIds } from "./social";
import { startOfMonthUTC, startOfWeekUTC } from "./utils";
import { levelFromPoints, ULTRA_RARE_MAX } from "./trophies";

export const METRICS = {
  points: "Trophy points",
  platinums: "Platinums",
  completion: "Avg. completion",
  rare: "Ultra rares",
} as const;
export const PERIODS = { all: "All time", weekly: "This week", monthly: "This month" } as const;
export const SCOPES = { global: "Global", country: "Country", friends: "Friends" } as const;

export type Metric = keyof typeof METRICS;
export type Period = keyof typeof PERIODS;
export type Scope = keyof typeof SCOPES;

export type LeaderboardRow = {
  rank: number;
  /** Stable React key: the user id for members, the PSN account id otherwise. */
  key: string;
  /** "member" rows link to /u/[username]; "psn" rows are tracked PSN players who haven't joined. */
  kind: "member" | "psn";
  href: string;
  name: string;
  userId: string | null;
  username: string | null;
  country: string | null;
  avatarHue: number;
  avatarUrl: string | null;
  /** The member's chosen picture (User.avatar), if any. */
  avatar: string | null;
  level: number;
  points: number;
  platinums: number;
  trophies: number;
  /** Members: from their synced trophies. Tracked players: counted list by list (see countUltraRares). */
  rare: number | null;
  /** True while some of a tracked player's lists are still to be counted, so `rare` is a running total. */
  rarePartial: boolean;
  completion: number | null;
  games: number | null;
};

type Opts = {
  metric: Metric;
  period: Period;
  scope: Scope;
  country?: string | null;
  viewerId?: string | null;
  limit?: number;
};

/** Minimum games before someone ranks on the completion board (stops 1-game 100%ers topping it). */
export const COMPLETION_MIN_GAMES = 5;

type MemberRaw = {
  userId: string;
  username: string;
  country: string | null;
  avatarHue: number;
  avatar: string | null;
  onlineId: string | null;
  avatarUrl: string | null;
  accountId: string | null;
  points: number;
  platinums: number;
  rare: number;
  trophies: number;
  completion: number;
  games: number;
};

/**
 * True when the board ranks Sony's real totals (all time) or gains between
 * snapshots (weekly/monthly) for every tracked player, rather than members'
 * synced trophy history.
 */
export function usesPsnTotals(opts: Pick<Opts, "metric" | "period" | "scope">) {
  if (opts.scope === "friends") return false;
  // Ultra rares and completion are only known all time for players who haven't joined.
  return opts.metric === "points" || opts.metric === "platinums" || opts.period === "all";
}

/**
 * Global and country boards are the same for everyone, so they are cached for
 * two minutes (served instantly, refreshed in the background). Friends boards
 * depend on the viewer and are always worked out fresh.
 */
export async function getLeaderboard(opts: Opts): Promise<LeaderboardRow[]> {
  if (opts.scope === "friends") return buildLeaderboard(opts);
  const country = opts.scope === "country" ? (opts.country ?? "") : "";
  const key = `board:${opts.metric}:${opts.period}:${opts.scope}:${country}:${opts.limit ?? 100}`;
  return cached(key, () => buildLeaderboard({ ...opts, viewerId: null }), { ttlMs: 2 * 60_000, tags: ["boards"] });
}

async function buildLeaderboard(opts: Opts): Promise<LeaderboardRow[]> {
  const { period, limit = 100 } = opts;
  // Completion is a lifetime stat with no meaningful weekly/monthly variant.
  const metric: Metric = opts.metric === "completion" && period !== "all" ? "points" : opts.metric;
  const members = await memberBoard({ ...opts, metric }, limit);

  if (!usesPsnTotals({ ...opts, metric })) return members.map((m, i) => memberRow(m, i + 1));
  return psnTotalsBoard({ ...opts, metric }, members, limit);
}

function memberRow(m: MemberRaw, rank: number): LeaderboardRow {
  return {
    rank,
    key: m.userId,
    kind: "member",
    href: `/u/${m.username}`,
    name: m.onlineId ?? m.username,
    userId: m.userId,
    username: m.username,
    country: m.country,
    avatarHue: m.avatarHue,
    avatarUrl: m.avatarUrl,
    avatar: m.avatar,
    level: levelFromPoints(m.points).level,
    points: m.points,
    platinums: m.platinums,
    trophies: m.trophies,
    rare: m.rare,
    rarePartial: false,
    completion: m.completion,
    games: m.games,
  };
}

/**
 * All-time global/country board built from PsnPlayer: the real PSN totals of
 * every player the site has seen, members or not. Members whose PSN summary
 * we have are ranked by it (a partial import won't hold them back); members
 * without one (demo mode, not synced yet) fall back to their synced trophies.
 */
async function psnTotalsBoard(opts: Opts, members: MemberRaw[], limit: number): Promise<LeaderboardRow[]> {
  const country = opts.scope === "country" ? opts.country : null;
  if (opts.scope === "country" && !country) return [];

  // Linked members who are private or opted out of leaderboards stay off, PSN summary included.
  const excluded = await prisma.psnAccount.findMany({
    where: {
      accountId: { not: null },
      user: { OR: [{ showOnLeaderboards: false }, { profileVisibility: { not: "PUBLIC" } }] },
    },
    select: { accountId: true },
  });
  const excludedIds = excluded.map((e) => e.accountId!);
  const orderBy: Prisma.PsnPlayerOrderByWithRelationInput[] = {
    points: [{ points: "desc" }, { platinum: "desc" }],
    platinums: [{ platinum: "desc" }, { points: "desc" }],
    rare: [{ ultraRare: { sort: "desc", nulls: "last" } }, { points: "desc" }],
    completion: [{ avgCompletion: { sort: "desc", nulls: "last" } }, { gamesPlayed: "desc" }],
  }[opts.metric] as Prisma.PsnPlayerOrderByWithRelationInput[];
  const players: PlayerTotals[] =
    opts.period === "all"
      ? (
          await prisma.psnPlayer.findMany({
            where: {
              hidden: false,
              trophiesPrivate: false,
              accountId: { notIn: excludedIds },
              ...(country ? { country } : {}),
              ...(opts.metric === "rare" ? { ultraRare: { not: null } } : {}),
              ...(opts.metric === "completion" ? { gamesPlayed: { gte: COMPLETION_MIN_GAMES } } : {}),
            },
            orderBy,
            take: limit,
          })
        ).map((p) => ({ ...p, trophies: p.platinum + p.gold + p.silver + p.bronze }))
      : await playerGains(opts, country ?? null, excludedIds, limit);

  // Which of these players are members (public, on leaderboards)?
  const linked = await prisma.psnAccount.findMany({
    where: {
      verified: true,
      accountId: { in: players.map((p) => p.accountId) },
      user: { showOnLeaderboards: true, profileVisibility: "PUBLIC" },
    },
    select: { accountId: true, user: { select: { id: true, username: true, avatarHue: true, avatar: true } } },
  });
  const memberByAccount = new Map(linked.map((l) => [l.accountId!, l.user]));
  // Synced stats for exactly the members on this board, wherever they rank on the members-only board.
  const shownMembers = linked.map((l) => l.user.id);
  const memberStats = new Map(
    [...members, ...(shownMembers.length ? await memberBoard({ ...opts, scope: "global", ids: shownMembers }, shownMembers.length) : [])].map((m) => [
      m.userId,
      m,
    ]),
  );
  const allTime = opts.period === "all";

  const rows: Omit<LeaderboardRow, "rank">[] = players.map((p) => {
    const m = memberByAccount.get(p.accountId);
    const stats = m ? memberStats.get(m.id) : undefined;
    return {
      key: m?.id ?? p.accountId,
      kind: m ? "member" : "psn",
      href: m ? `/u/${m.username}` : `/psn/${encodeURIComponent(p.onlineId)}`,
      name: p.onlineId,
      userId: m?.id ?? null,
      username: m?.username ?? null,
      country: p.country,
      avatarHue: m?.avatarHue ?? 0,
      avatarUrl: p.avatarUrl,
      avatar: m?.avatar ?? null,
      level: p.trophyLevel,
      points: p.points,
      platinums: p.platinum,
      trophies: p.trophies,
      // Weekly and monthly boards measure gains; a tracked player's ultra rares and completion are all-time only.
      rare: stats?.rare ?? (allTime ? (p.ultraRare ?? null) : null),
      rarePartial: !stats && allTime && (p.ultraRarePending ?? 0) > 0,
      completion: stats?.completion ?? (allTime ? (p.avgCompletion ?? null) : null),
      games: stats?.games ?? (allTime ? (p.gamesPlayed ?? null) : null),
    };
  });

  // Members with no PSN summary yet compete with their synced totals.
  const known = new Set(
    (
      await prisma.psnPlayer.findMany({
        where: { accountId: { in: members.flatMap((m) => (m.accountId ? [m.accountId] : [])) } },
        select: { accountId: true },
      })
    ).map((p) => p.accountId),
  );
  // Ultra rare and completion boards also take members whose lists aren't counted on their PSN summary yet.
  const byStats = opts.metric === "rare" || opts.metric === "completion";
  const present = new Set(rows.map((r) => r.userId));
  for (const m of members) {
    if (present.has(m.userId)) continue;
    if (!m.accountId || !known.has(m.accountId) || byStats) rows.push(memberRow(m, 0));
  }

  const key = {
    points: (r: Omit<LeaderboardRow, "rank">) => [r.points, r.platinums],
    platinums: (r: Omit<LeaderboardRow, "rank">) => [r.platinums, r.points],
    rare: (r: Omit<LeaderboardRow, "rank">) => [r.rare ?? -1, r.points],
    completion: (r: Omit<LeaderboardRow, "rank">) => [r.completion ?? -1, r.games ?? 0],
  }[opts.metric];
  if (opts.metric === "completion") {
    // Same minimum as the members' board, for members ranked on their synced games.
    for (let i = rows.length - 1; i >= 0; i--) if ((rows[i].games ?? 0) < COMPLETION_MIN_GAMES) rows.splice(i, 1);
  }
  rows.sort((a, b) => {
    const [a1, a2] = key(a);
    const [b1, b2] = key(b);
    return b1 - a1 || b2 - a2;
  });
  return rows.slice(0, limit).map((r, i) => ({ ...r, rank: i + 1 }));
}

type PlayerTotals = {
  accountId: string;
  onlineId: string;
  avatarUrl: string | null;
  country: string | null;
  trophyLevel: number;
  points: number;
  platinum: number;
  trophies: number;
  ultraRare?: number | null;
  ultraRarePending?: number | null;
  avgCompletion?: number | null;
  gamesPlayed?: number | null;
};

/**
 * Points, platinums and trophies each tracked player gained since the start of
 * the week or month, measured between stored snapshots. The baseline is the
 * last snapshot before the period, or the first one we have if they were
 * first seen during it.
 */
async function playerGains(opts: Opts, country: string | null, excluded: string[], limit: number): Promise<PlayerTotals[]> {
  const since = opts.period === "weekly" ? startOfWeekUTC() : startOfMonthUTC();
  const baseline = (col: "points" | "platinum" | "trophies") => Prisma.sql`COALESCE(
      (SELECT s.${Prisma.raw(`"${col}"`)} FROM "PsnPlayerSnapshot" s WHERE s."accountId" = p."accountId" AND s."takenAt" <= ${since} ORDER BY s."takenAt" DESC LIMIT 1),
      (SELECT s.${Prisma.raw(`"${col}"`)} FROM "PsnPlayerSnapshot" s WHERE s."accountId" = p."accountId" ORDER BY s."takenAt" ASC LIMIT 1)
    )`;
  const filters = [Prisma.sql`p."hidden" = FALSE`, Prisma.sql`p."trophiesPrivate" = FALSE`];
  if (country) filters.push(Prisma.sql`p."country" = ${country}`);
  if (excluded.length) filters.push(Prisma.sql`p."accountId" NOT IN (${Prisma.join(excluded)})`);
  const order = opts.metric === "platinums" ? Prisma.sql`platinum DESC, points DESC` : Prisma.sql`points DESC, platinum DESC`;

  const rows = await prisma.$queryRaw<PlayerTotals[]>`
    SELECT * FROM (
      SELECT p."accountId", p."onlineId", p."avatarUrl", p."country", p."trophyLevel",
        CAST(p."points" - ${baseline("points")} AS INTEGER) AS points,
        CAST(p."platinum" - ${baseline("platinum")} AS INTEGER) AS platinum,
        CAST((p."platinum" + p."gold" + p."silver" + p."bronze") - ${baseline("trophies")} AS INTEGER) AS trophies
      FROM "PsnPlayer" p
      WHERE ${Prisma.join(filters, " AND ")}
    ) AS gains WHERE points > 0
    ORDER BY ${order}
    LIMIT ${limit}
  `;
  return rows.map((r) => ({ ...r, points: Number(r.points), platinum: Number(r.platinum), trophies: Number(r.trophies) }));
}

async function memberBoard(opts: Opts & { metric: Metric; ids?: string[] }, limit: number): Promise<MemberRaw[]> {
  const { period, scope, metric } = opts;

  const filters: Prisma.Sql[] = [];

  if (opts.ids) {
    // Stats for particular members already cleared to appear on a board.
    filters.push(Prisma.sql`u."id" IN (${Prisma.join(opts.ids)})`);
  } else if (scope === "friends") {
    if (!opts.viewerId) return [];
    const ids = [opts.viewerId, ...(await getFriendIds(opts.viewerId))];
    // Friends can see friends-only profiles; the viewer always sees themselves.
    filters.push(
      Prisma.sql`u."id" IN (${Prisma.join(ids)})`,
      Prisma.sql`(u."id" = ${opts.viewerId} OR (u."showOnLeaderboards" = TRUE AND u."profileVisibility" <> 'PRIVATE'))`,
    );
  } else {
    // Global/country boards are public: friends-only and private profiles stay off them.
    filters.push(Prisma.sql`u."showOnLeaderboards" = TRUE`, Prisma.sql`u."profileVisibility" = 'PUBLIC'`);
    if (scope === "country") {
      if (!opts.country) return [];
      filters.push(Prisma.sql`u."country" = ${opts.country}`);
    }
  }

  const since = period === "weekly" ? startOfWeekUTC() : period === "monthly" ? startOfMonthUTC() : null;
  const trophyFilters = since ? [...filters, Prisma.sql`ut."earnedAt" >= ${since}`] : filters;
  const where = Prisma.join(trophyFilters, " AND ");

  const orderBy = {
    points: Prisma.sql`points DESC, platinums DESC`,
    platinums: Prisma.sql`platinums DESC, points DESC`,
    rare: Prisma.sql`rare DESC, points DESC`,
    completion: Prisma.sql`completion DESC, games DESC`,
  }[metric];

  // PostgreSQL can't use a column alias in HAVING, so repeat the expression.
  const having =
    metric === "completion"
      ? Prisma.sql`HAVING (SELECT COUNT(*) FROM "UserGame" ug WHERE ug."userId" = u."id") >= ${COMPLETION_MIN_GAMES}`
      : Prisma.empty;

  const rows = await prisma.$queryRaw<MemberRaw[]>`
    SELECT
      u."id" AS "userId", u."username", u."country", u."avatarHue", u."avatar",
      p."onlineId", p."avatarUrl", p."accountId",
      CAST(SUM(CASE t."type" WHEN 'PLATINUM' THEN 300 WHEN 'GOLD' THEN 90 WHEN 'SILVER' THEN 30 ELSE 15 END) AS INTEGER) AS points,
      CAST(SUM(CASE WHEN t."type" = 'PLATINUM' THEN 1 ELSE 0 END) AS INTEGER) AS platinums,
      CAST(SUM(CASE WHEN t."earnedRate" <= ${ULTRA_RARE_MAX} THEN 1 ELSE 0 END) AS INTEGER) AS rare,
      CAST(COUNT(*) AS INTEGER) AS trophies,
      CAST((SELECT ROUND(AVG(ug."progress")) FROM "UserGame" ug WHERE ug."userId" = u."id") AS INTEGER) AS completion,
      CAST((SELECT COUNT(*) FROM "UserGame" ug WHERE ug."userId" = u."id") AS INTEGER) AS games
    FROM "UserTrophy" ut
    JOIN "Trophy" t ON t."id" = ut."trophyId"
    JOIN "User" u ON u."id" = ut."userId"
    LEFT JOIN "PsnAccount" p ON p."userId" = u."id"
    WHERE ${where}
    GROUP BY u."id", p."onlineId", p."avatarUrl", p."accountId"
    ${having}
    ORDER BY ${orderBy}
    LIMIT ${limit}
  `;

  return rows.map((r) => ({
    ...r,
    points: Number(r.points),
    platinums: Number(r.platinums),
    rare: Number(r.rare),
    trophies: Number(r.trophies),
    completion: Number(r.completion ?? 0),
    games: Number(r.games),
  }));
}

export type ViewerRanks = {
  points: number;
  global: { rank: number; of: number };
  country: { code: string; rank: number; of: number } | null;
};

/**
 * Where a signed-in member stands on the all-time trophy points board,
 * worldwide and in their country. Uses Sony's totals when their PSN account
 * is tracked (everyone who has synced is), otherwise the members' board.
 * Null if they have no trophies to rank yet.
 */
export function viewerRanks(user: { id: string; country: string | null; psn: { accountId: string | null } | null }): Promise<ViewerRanks | null> {
  return cached(`ranks:${user.id}:${user.country ?? ""}`, () => workOutRanks(user), { ttlMs: 2 * 60_000, tags: ["boards"] });
}

async function workOutRanks(user: { id: string; country: string | null; psn: { accountId: string | null } | null }): Promise<ViewerRanks | null> {
  const visible = { hidden: false, trophiesPrivate: false } as const;
  const me = user.psn?.accountId ? await prisma.psnPlayer.findUnique({ where: { accountId: user.psn.accountId } }) : null;
  if (me && !me.hidden && !me.trophiesPrivate) {
    const code = me.country ?? user.country;
    const [ahead, total, aheadHere, totalHere] = await Promise.all([
      prisma.psnPlayer.count({ where: { ...visible, points: { gt: me.points } } }),
      prisma.psnPlayer.count({ where: visible }),
      code ? prisma.psnPlayer.count({ where: { ...visible, country: code, points: { gt: me.points } } }) : 0,
      code ? prisma.psnPlayer.count({ where: { ...visible, country: code } }) : 0,
    ]);
    return {
      points: me.points,
      global: { rank: ahead + 1, of: total },
      country: code ? { code, rank: aheadHere + 1, of: Math.max(totalHere, 1) } : null,
    };
  }

  // Not tracked on PSN (demo mode, or never synced): rank among members.
  const board = await getLeaderboard({ metric: "points", period: "all", scope: "global", limit: 10_000 });
  const mine = board.find((r) => r.userId === user.id);
  if (!mine) return null;
  const here = user.country ? board.filter((r) => r.country === user.country) : [];
  const hereRank = here.findIndex((r) => r.userId === user.id);
  return {
    points: mine.points,
    global: { rank: mine.rank, of: board.length },
    country: user.country && hereRank >= 0 ? { code: user.country, rank: hereRank + 1, of: here.length } : null,
  };
}
