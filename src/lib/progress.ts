import type { prisma } from "./db";
import { TROPHY_POINTS, type TrophyType } from "./trophies";

/**
 * Recomputes the denormalised UserGame row for a user/game pair from their
 * earned trophies. Progress matches PSN: points-weighted, with the platinum
 * left out (PSN shows 86% for 18 bronze, 11 silver and 3 gold out of
 * 19/12/4 plus a platinum). Games with nothing earned yet stay, at 0%, the
 * same way PSN lists them. Shared by the PSN sync service and the seed script.
 */
export async function recomputeUserGame(db: typeof prisma, userId: string, gameId: string) {
  const [trophies, earned] = await Promise.all([
    db.trophy.findMany({ where: { gameId }, select: { type: true } }),
    db.userTrophy.findMany({
      where: { userId, trophy: { gameId } },
      select: { earnedAt: true, trophy: { select: { type: true } } },
      orderBy: { earnedAt: "asc" },
    }),
  ]);

  const countsTowardProgress = (type: string) => type !== "PLATINUM";
  const totalPoints = trophies.filter((t) => countsTowardProgress(t.type)).reduce((s, t) => s + TROPHY_POINTS[t.type as TrophyType], 0);
  let earnedPoints = 0;
  const counts = { BRONZE: 0, SILVER: 0, GOLD: 0, PLATINUM: 0 };
  let platinumAt: Date | null = null;
  for (const e of earned) {
    const type = e.trophy.type as TrophyType;
    counts[type]++;
    if (countsTowardProgress(type)) earnedPoints += TROPHY_POINTS[type];
    if (type === "PLATINUM") platinumAt = e.earnedAt;
  }

  const data = {
    progress: totalPoints ? Math.floor((earnedPoints / totalPoints) * 100) : 0,
    earnedCount: earned.length,
    earnedBronze: counts.BRONZE,
    earnedSilver: counts.SILVER,
    earnedGold: counts.GOLD,
    hasPlatinum: counts.PLATINUM > 0,
    platinumAt,
    completedAt: earned.length > 0 && earned.length === trophies.length ? earned[earned.length - 1].earnedAt : null,
    firstEarned: earned[0]?.earnedAt ?? null,
    lastEarned: earned.at(-1)?.earnedAt ?? null,
  };

  await db.userGame.upsert({
    where: { userId_gameId: { userId, gameId } },
    create: { userId, gameId, ...data },
    update: data,
  });
}
