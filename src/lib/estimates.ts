import { prisma } from "./db";

/**
 * Community estimates on a game (difficulty, hours to platinum, playthroughs)
 * come from the guides written for it. A game has one trophy list per
 * platform and region, so guides count for every list with the same titleKey.
 */

function median(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Games that share a title with any of these games (the games themselves included). */
async function familyIds(gameIds: string[]) {
  const games = await prisma.game.findMany({ where: { id: { in: gameIds } }, select: { id: true, titleKey: true } });
  const keys = [...new Set(games.map((g) => g.titleKey).filter(Boolean))];
  const siblings = keys.length
    ? await prisma.game.findMany({ where: { titleKey: { in: keys } }, select: { id: true, titleKey: true } })
    : [];
  return [...games.filter((g) => !g.titleKey), ...siblings];
}

/**
 * Recomputes the estimates for these games and their sibling lists.
 * Difficulty is the mean of the guides' ratings and members' own ratings
 * (one decimal); hours and playthroughs are the guides' median, so one wild
 * guess doesn't swing the number. The game's star rating is the mean of
 * members' ratings. With nothing left to go on, they go back to empty.
 */
export async function refreshEstimates(gameIds: string[]) {
  if (!gameIds.length) return 0;
  const games = await familyIds(gameIds);
  const groups = new Map<string, string[]>();
  for (const g of games) {
    const key = g.titleKey || `id:${g.id}`;
    groups.set(key, [...(groups.get(key) ?? []), g.id]);
  }

  let updated = 0;
  for (const ids of groups.values()) {
    const [guides, ratings] = await Promise.all([
      // Only published guides count; ones waiting for approval don't move the numbers yet.
      prisma.guide.findMany({
        where: { gameId: { in: ids }, status: "PUBLISHED" },
        select: { difficulty: true, hoursEstimate: true, playthroughs: true },
      }),
      prisma.gameRating.findMany({ where: { gameId: { in: ids } }, select: { difficulty: true, rating: true } }),
    ]);
    // Difficulty: every guide and every member's rating is one vote.
    const votes = [...guides.map((g) => g.difficulty), ...ratings.flatMap((r) => (r.difficulty ? [r.difficulty] : []))];
    const stars = ratings.flatMap((r) => (r.rating ? [r.rating] : []));
    const mean = (xs: number[]) => Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10;
    const data = {
      difficulty: votes.length ? mean(votes) : null,
      hoursToPlatinum: guides.length ? Math.round(median(guides.map((g) => g.hoursEstimate))) : null,
      playthroughs: guides.length ? Math.round(median(guides.map((g) => g.playthroughs))) : null,
      rating: stars.length ? mean(stars) : null,
      ratingCount: stars.length,
    };
    const res = await prisma.game.updateMany({ where: { id: { in: ids } }, data });
    updated += res.count;
  }
  return updated;
}

/** Every game that has at least one guide. Used by the backfill script. */
export async function refreshAllEstimates() {
  const rows = await prisma.guide.findMany({ select: { gameId: true }, distinct: ["gameId"] });
  return refreshEstimates(rows.map((r) => r.gameId));
}
