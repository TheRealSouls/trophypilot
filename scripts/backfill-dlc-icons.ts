/**
 * Fetches PSN's picture for DLC packs stored before the site kept them: one
 * PSN request per game. Newest games first; stops if PSN starts limiting.
 *
 *   npm run psn:dlc-icons            # up to 300 games
 *   npm run psn:dlc-icons -- 2000
 */
import { getTitleTrophyGroups } from "psn-api";
import { prisma } from "../src/lib/db";
import { psnAuth, toPsnError, withTimeout } from "../src/lib/psn/real";

async function main() {
  const max = Number(process.argv[2]) || 300;
  if (!process.env.PSN_NPSSO?.trim()) throw new Error("PSN_NPSSO is empty. Run npm run psn:check first.");
  const games = await prisma.game.findMany({
    where: { npCommunicationId: { not: null }, groups: { some: { isDlc: true, iconUrl: null } } },
    orderBy: { npCommunicationId: "desc" },
    take: max,
    select: { id: true, title: true, npCommunicationId: true, npServiceName: true },
  });
  console.log(`${games.length} games with DLC pictures missing`);
  let done = 0;
  for (const g of games) {
    try {
      const opts = g.npServiceName === "trophy" ? { npServiceName: "trophy" as const } : {};
      const res = await withTimeout(getTitleTrophyGroups(await psnAuth(), g.npCommunicationId!, opts));
      for (const grp of res.trophyGroups) {
        if (!grp.trophyGroupIconUrl) continue;
        await prisma.trophyGroup.updateMany({
          where: { gameId: g.id, psnGroupId: grp.trophyGroupId, iconUrl: null },
          data: { iconUrl: grp.trophyGroupIconUrl },
        });
      }
      done++;
      if (done % 25 === 0) console.log(`${done}/${games.length}`);
    } catch (err) {
      const e = toPsnError(err);
      console.warn(`skip ${g.title}: ${e.message}`);
      if (e.kind === "rate_limited" || e.kind === "auth") break;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  console.log(`done: ${done} games updated`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
