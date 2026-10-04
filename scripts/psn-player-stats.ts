/**
 * Fills in games played, average completion and ultra rares for tracked PSN
 * players, best-ranked first. The players cron does the same a few players
 * at a time; this catches everyone up at once.
 *
 *   npm run psn:player-stats              # every player, 150 list lookups each
 *   npm run psn:player-stats -- 50 300    # top 50 players, 300 lookups each
 */
import { prisma } from "../src/lib/db";
import { refreshPlayer } from "../src/lib/psn/players";
import { toPsnError } from "../src/lib/psn/real";

async function main() {
  const [take, lookups] = process.argv.slice(2).map(Number);
  if (!process.env.PSN_NPSSO?.trim()) throw new Error("PSN_NPSSO is empty. Run npm run psn:check first.");
  const players = await prisma.psnPlayer.findMany({
    where: { hidden: false, trophiesPrivate: false },
    orderBy: { points: "desc" },
    take: take || undefined,
    select: { onlineId: true },
  });
  for (const [i, p] of players.entries()) {
    try {
      const r = await refreshPlayer(p.onlineId, { rareLookups: lookups || 150 });
      const now = await prisma.psnPlayer.findFirst({ where: { onlineId: p.onlineId }, select: { gamesPlayed: true, avgCompletion: true, ultraRare: true, ultraRarePending: true } });
      console.log(`${i + 1}/${players.length} ${p.onlineId}: ${now?.gamesPlayed} games, ${now?.avgCompletion}% avg, ${now?.ultraRare} ultra rares (${now?.ultraRarePending} lists left, ${r?.ultraRaresCounted ?? 0} counted now)`);
    } catch (err) {
      const e = toPsnError(err);
      console.warn(`skip ${p.onlineId}: ${e.message}`);
      if (e.kind === "auth" || e.kind === "rate_limited") break;
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
