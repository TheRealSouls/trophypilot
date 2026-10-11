import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { levelFromPoints, pointsFor, ULTRA_RARE_MAX } from "./trophies";

export async function getUserStats(userId: string) {
  const [agg, platinum, completed, ultraRare] = await Promise.all([
    prisma.userGame.aggregate({
      where: { userId },
      _sum: { earnedBronze: true, earnedSilver: true, earnedGold: true, earnedCount: true },
      _avg: { progress: true },
      _count: true,
    }),
    prisma.userGame.count({ where: { userId, hasPlatinum: true } }),
    prisma.userGame.count({ where: { userId, completedAt: { not: null } } }),
    prisma.userTrophy.count({ where: { userId, trophy: { earnedRate: { lte: ULTRA_RARE_MAX } } } }),
  ]);

  const counts = {
    platinum,
    gold: agg._sum.earnedGold ?? 0,
    silver: agg._sum.earnedSilver ?? 0,
    bronze: agg._sum.earnedBronze ?? 0,
  };
  const points = pointsFor(counts);
  return {
    ...counts,
    total: agg._sum.earnedCount ?? 0,
    games: agg._count,
    completed,
    ultraRare,
    avgCompletion: Math.round(agg._avg.progress ?? 0),
    points,
    ...levelFromPoints(points),
  };
}

export type UserStats = Awaited<ReturnType<typeof getUserStats>>;

export type Milestone = {
  key: string;
  label: string;
  kind: "trophy" | "platinum" | "rare" | "complete";
  achieved: boolean;
  at?: Date;
  detail?: string;
  gameSlug?: string;
};

const TROPHY_MILESTONES = [1, 10, 50, 100, 250, 500, 1000, 1500, 2000, 2500, 5000, 7500, 10000, 15000, 20000, 25000];
const PLATINUM_MILESTONES = [1, 5, 10, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500];
const ULTRA_MILESTONES = [1, 10, 25, 50, 100, 250];
const COMPLETE_MILESTONES = [1, 10, 25, 50, 100];

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n.toLocaleString("en-GB") + (s[(v - 20) % 10] || s[v] || s[0]);
}

type Nth = { n: number; at: Date; name: string; title: string; slug: string; rate: number | null };

/** The trophies that were a member's 1st, 10th, 100th… (by when they were earned), in one query. */
function nthTrophies(userId: string, ns: number[], ultraOnly: boolean) {
  return prisma.$queryRaw<Nth[]>`
    SELECT x.n::int AS n, x."earnedAt" AS at, x.name, x.title, x.slug, x."earnedRate" AS rate FROM (
      SELECT ROW_NUMBER() OVER (ORDER BY ut."earnedAt", ut.id) AS n, ut."earnedAt", t.name, t."earnedRate", g.title, g.slug
      FROM "UserTrophy" ut JOIN "Trophy" t ON t.id = ut."trophyId" JOIN "Game" g ON g.id = t."gameId"
      WHERE ut."userId" = ${userId} ${ultraOnly ? Prisma.sql`AND t."earnedRate" <= ${ULTRA_RARE_MAX}` : Prisma.empty}
    ) x WHERE x.n IN (${Prisma.join(ns)})`;
}

/** Milestones are derived on read from the member's earned-trophy history: four queries, however many milestones. */
export async function getMilestones(userId: string, stats: UserStats): Promise<Milestone[]> {
  const [trophies, ultras, plats, completes] = await Promise.all([
    nthTrophies(userId, TROPHY_MILESTONES, false),
    nthTrophies(userId, ULTRA_MILESTONES, true),
    prisma.userGame.findMany({
      where: { userId, hasPlatinum: true },
      orderBy: { platinumAt: "asc" },
      select: { platinumAt: true, game: { select: { title: true, slug: true } } },
    }),
    prisma.userGame.findMany({
      where: { userId, completedAt: { not: null } },
      orderBy: { completedAt: "asc" },
      take: Math.max(...COMPLETE_MILESTONES),
      select: { completedAt: true, game: { select: { title: true, slug: true } } },
    }),
  ]);
  const trophyAt = new Map(trophies.map((t) => [Number(t.n), t]));
  const ultraAt = new Map(ultras.map((t) => [Number(t.n), t]));

  return [
    ...TROPHY_MILESTONES.map((n): Milestone => {
      const t = trophyAt.get(n);
      return {
        key: `t${n}`,
        label: n === 1 ? "First trophy" : `${ordinal(n)} trophy`,
        kind: "trophy",
        achieved: !!t,
        at: t?.at,
        detail: t ? `${t.name} (${t.title})` : undefined,
        gameSlug: t?.slug,
      };
    }),
    ...PLATINUM_MILESTONES.map((n): Milestone => {
      const p = plats[n - 1];
      return {
        key: `p${n}`,
        label: n === 1 ? "First platinum" : `${ordinal(n)} platinum`,
        kind: "platinum",
        achieved: !!p,
        at: p?.platinumAt ?? undefined,
        detail: p?.game.title,
        gameSlug: p?.game.slug,
      };
    }),
    ...ULTRA_MILESTONES.map((n): Milestone => {
      const t = ultraAt.get(n);
      return {
        key: `u${n}`,
        label: n === 1 ? "First ultra rare" : `${ordinal(n)} ultra rare`,
        kind: "rare",
        achieved: !!t,
        at: t?.at,
        detail: t ? `${t.name} (${t.rate?.toFixed(1)}%)` : undefined,
        gameSlug: t?.slug,
      };
    }),
    ...COMPLETE_MILESTONES.map((n): Milestone => {
      const c = completes[n - 1];
      return {
        key: `c${n}`,
        label: n === 1 ? "First 100% completion" : `${ordinal(n)} 100% completion`,
        kind: "complete",
        achieved: !!c,
        at: c?.completedAt ?? undefined,
        detail: c?.game.title,
        gameSlug: c?.game.slug,
      };
    }),
  ];
}
