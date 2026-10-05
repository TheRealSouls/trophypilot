/**
 * Loads the trophy lists (and IGDB details) of the best-known PlayStation
 * games ahead of time, so nobody has to wait for PSN the first time they open
 * one. "Best-known" comes from IGDB: the PS4 and PS5 games most people rated.
 * A game is only loaded if it's already in the catalogue (PSN has no game
 * search, so a game arrives when any tracked player or member has played it);
 * the ones still missing are listed at the end.
 *
 *   npm run psn:popular              # top 1000 on IGDB
 *   npm run psn:popular -- 3000
 */
import { prisma } from "../src/lib/db";
import { enrichGame, igdbEnabled, popularPlayStationGames } from "../src/lib/igdb";
import { ensureGameTrophies } from "../src/lib/psn/catalogue";
import { toPsnError } from "../src/lib/psn/real";
import { getProvider, isDemoMode } from "../src/lib/psn/sync";
import { titleKey } from "../src/lib/utils";

try {
  process.loadEnvFile(".env");
} catch {
  // No .env file; rely on the real environment.
}

async function main() {
  if (isDemoMode()) throw new Error("Set PSN_NPSSO first: demo mode has no PSN lists to load.");
  if (!igdbEnabled()) throw new Error("Set IGDB_CLIENT_ID and IGDB_CLIENT_SECRET: the popular list comes from IGDB.");
  const limit = Number(process.argv[2]) || 1000;
  const popular = await popularPlayStationGames(limit);

  const provider = getProvider();
  let loaded = 0;
  let already = 0;
  let enriched = 0;
  const missing: string[] = [];
  for (const [i, p] of popular.entries()) {
    const keys = [...new Set([p.name, ...p.alternatives].map(titleKey).filter(Boolean))];
    // Every list of the game: PS4, PS5 and regional ones share a titleKey.
    const lists = await retry(() => prisma.game.findMany({
      where: { titleKey: { in: keys } },
      select: {
        id: true,
        title: true,
        npCommunicationId: true,
        npServiceName: true,
        platforms: true,
        iconUrl: true,
        psnSampleAccountId: true,
        definedTrophies: true,
        igdbCheckedAt: true,
        _count: { select: { trophies: true } },
      },
    }));
    if (!lists.length) {
      missing.push(p.name);
      continue;
    }
    for (const g of lists) {
      if (g._count.trophies > 0) {
        already++;
        continue;
      }
      try {
        if (await ensureGameTrophies(provider, g)) loaded++;
      } catch (err) {
        const e = toPsnError(err);
        console.warn(`skip ${g.title}: ${e.message}`);
        if (/fetch failed|reach|P1001|P1017|ECONNRESET/i.test(e.message)) await new Promise((r) => setTimeout(r, 30_000));
        if (e.kind === "rate_limited" || e.kind === "auth") {
          console.warn("Stopping: PSN is limiting us. Run it again later; loaded lists are kept.");
          return report();
        }
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!lists[0].igdbCheckedAt) {
      if (await enrichGame(lists[0].id).catch(() => false)) enriched++;
    }
    if ((i + 1) % 50 === 0) console.log(`${i + 1}/${popular.length}: ${loaded} lists loaded, ${already} already there`);
  }
  report();

  function report() {
    console.log(`Done: ${loaded} trophy lists loaded, ${already} already loaded, ${enriched} games given IGDB details.`);
    console.log(`${missing.length} popular games aren't in the catalogue yet (no tracked player has played them).`);
    if (missing.length) console.log(`Most popular of those: ${missing.slice(0, 40).join(" | ")}`);
  }
}

/** Waits out a dropped connection (up to five tries) instead of stopping the whole run. */
async function retry<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= 4 || !/P1001|P1017|fetch failed|ECONNRESET|ETIMEDOUT/i.test(String(err))) throw err;
      await new Promise((r) => setTimeout(r, 30_000));
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
