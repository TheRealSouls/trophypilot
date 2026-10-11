import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { durationText, planOf, PLANS } from "../plans";
import { recomputeUserGame } from "../progress";
import { ensureGameTrophies, importTitles } from "./catalogue";
import { MockPsnProvider } from "./mock";
import { recordPlayer } from "./players";
import { RealPsnProvider } from "./real";
import type { PsnEarnedTrophy, PsnTitle, TrophyProvider } from "./types";

export function isDemoMode() {
  return !process.env.PSN_NPSSO?.trim();
}

export function getProvider(): TrophyProvider {
  return isDemoMode() ? new MockPsnProvider() : new RealPsnProvider();
}

/** MANUAL is Sync now, AUTO the background schedule, IMPORT the first import after linking. */
export type SyncTrigger = "MANUAL" | "AUTO" | "IMPORT";

/**
 * PSN rate limits hard and big libraries have thousands of trophy lists, so a
 * run only processes this many changed lists. The next run (the import loop
 * after linking, Sync now, or the cron job) resumes where it stopped.
 */
const TITLES_PER_RUN = Math.max(1, Number(process.env.PSN_SYNC_TITLES_PER_RUN) || 200);
/**
 * Trophy lists fetched at the same time. PSN calls are the slow part, not the
 * database. Measured on a 4,500-game library: 4 at a time took 0.24s per
 * list, 8 took 0.13s, 12 took 0.09s and 16 barely helped (0.08s), so 10
 * leaves headroom under Sony's rate limits for the site's one token.
 */
const CONCURRENCY = Math.max(1, Number(process.env.PSN_SYNC_CONCURRENCY) || 10);

export class SyncCooldownError extends Error {}

/** When this user may press Sync now again, or null if they can now. */
export async function nextManualSyncAt(userId: string, plan: string) {
  const [lastManual, latest] = await Promise.all([
    // Failed syncs don't count, so a PSN outage doesn't lock anyone out for an hour.
    prisma.syncJob.findFirst({
      where: { userId, trigger: "MANUAL", status: { not: "FAILED" } },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    }),
    prisma.syncJob.findFirst({ where: { userId }, orderBy: { startedAt: "desc" }, select: { remaining: true, startedAt: true } }),
  ]);
  // While a big library is still importing, Sync now just continues it.
  if (latest && latest.remaining > 0) {
    const at = latest.startedAt.getTime() + 60_000;
    return at > Date.now() ? new Date(at) : null;
  }
  if (!lastManual) return null;
  const at = lastManual.startedAt.getTime() + planOf({ plan }).manualEveryMs;
  return at > Date.now() ? new Date(at) : null;
}

/**
 * Linked accounts the background sync should do next: never synced, past
 * their plan's interval, or part-way through importing a big library.
 */
export function accountsDueForSync(take: number, now = Date.now()) {
  return prisma.psnAccount.findMany({
    where: {
      verified: true,
      OR: [
        { lastSyncedAt: null },
        ...Object.entries(PLANS).map(([plan, p]) => ({ user: { plan }, lastSyncedAt: { lt: new Date(now - p.autoEveryMs) } })),
        { user: { plan: { notIn: Object.keys(PLANS) } }, lastSyncedAt: { lt: new Date(now - PLANS.FREE.autoEveryMs) } },
        { user: { syncJobs: { some: { remaining: { gt: 0 }, startedAt: { gte: new Date(now - 30 * 60_000) } } } } },
      ],
    },
    orderBy: { lastSyncedAt: { sort: "asc", nulls: "first" } },
    take,
    select: { userId: true, onlineId: true },
  });
}

/** Runs `fn` over `items`, at most `limit` at a time. */
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

/** Writes new earn rates for a list's trophies in one statement. */
async function saveEarnRates(rates: { id: string; rate: number }[]) {
  if (!rates.length) return;
  const values = Prisma.join(rates.map((r) => Prisma.sql`(${r.id}, ${r.rate}::double precision)`));
  await prisma.$executeRaw`
    UPDATE "Trophy" AS t SET "earnedRate" = v.rate
    FROM (VALUES ${values}) AS v(id, rate)
    WHERE t.id = v.id AND t."earnedRate" IS DISTINCT FROM v.rate`;
}

/**
 * `titles` lets a multi-run import reuse the game list it already fetched
 * (a 4,500-game library is six pages from PSN). The returned job carries the
 * list it used, for the next run.
 */
/**
 * The quick checks before a sync: PSN linked and verified, no sync already
 * running, and (for a manual sync) the plan allows another one now. Throws
 * with a message for the member; returns the account otherwise.
 */
export async function checkCanSync(userId: string, trigger: SyncTrigger = "MANUAL") {
  const psn = await prisma.psnAccount.findUnique({ where: { userId }, include: { user: { select: { plan: true } } } });
  if (!psn?.verified || !psn.accountId) throw new Error("Link and verify your PSN account first.");
  const running = await prisma.syncJob.findFirst({ where: { userId, status: "RUNNING" }, orderBy: { startedAt: "desc" } });
  if (running && Date.now() - running.startedAt.getTime() < 10 * 60_000) throw new Error("A sync is already running.");
  if (trigger === "MANUAL") {
    const at = await nextManualSyncAt(userId, psn.user.plan);
    if (at) throw new SyncCooldownError(`You can sync again in ${durationText(at.getTime() - Date.now())}.`);
  }
  return { ...psn, accountId: psn.accountId };
}

export async function syncUser(
  userId: string,
  { trigger = "MANUAL", titles: knownTitles }: { trigger?: SyncTrigger; titles?: PsnTitle[] } = {},
) {
  const psn = await checkCanSync(userId, trigger);
  const accountId = psn.accountId;

  const provider = getProvider();
  const job = await prisma.syncJob.create({ data: { userId, provider: provider.name, trigger } });
  let gamesSynced = 0;
  let trophiesSynced = 0;
  let remaining = 0;

  try {
    // Once a library is fully imported, only lists updated since the newest synced one can have changed.
    const [lastJob, newest] = await Promise.all([
      prisma.syncJob.findFirst({ where: { userId, status: "SUCCESS" }, orderBy: { startedAt: "desc" }, select: { remaining: true } }),
      prisma.psnTitleSync.aggregate({ where: { userId }, _max: { lastUpdated: true } }),
    ]);
    const since = lastJob && lastJob.remaining === 0 ? (newest._max.lastUpdated ?? undefined) : undefined;
    const [profile, titles] = await Promise.all([
      provider.getProfile(psn.onlineId),
      knownTitles ?? provider.getTitles(accountId, { since }),
    ]);

    // Only lists that changed since they were last synced. Mock titles always
    // report "now", so demo mode re-syncs everything (it's a small catalogue).
    const synced = new Map(
      (await prisma.psnTitleSync.findMany({ where: { userId }, select: { npCommunicationId: true, lastUpdated: true } })).map(
        (r) => [r.npCommunicationId, r.lastUpdated.getTime()],
      ),
    );
    const pending = titles.filter(
      (t) => provider.name !== "psn" || (synced.get(t.npCommunicationId) ?? -1) < t.lastUpdated.getTime(),
    );
    const batch = pending.slice(0, TITLES_PER_RUN);
    remaining = pending.length - batch.length;

    // Catalogue rows for the whole batch at once. Mock account ids are meaningless to Sony, so only real ones become samples.
    const slugs = await importTitles(batch, provider.name === "psn" ? accountId : null);
    const games = new Map(
      (await prisma.game.findMany({ where: { slug: { in: [...slugs.values()] } } })).map((g) => [g.npCommunicationId, g]),
    );

    await pool(batch, CONCURRENCY, async (title: PsnTitle) => {
      const game = games.get(title.npCommunicationId);
      if (!game) return;
      // The player's progress and (for new games) the list itself are fetched side by side.
      const earnedP = provider.getTitleEarned(accountId, title);
      earnedP.catch(() => {}); // awaited below; this only stops an early failure being reported as unhandled
      await ensureGameTrophies(provider, game, { earned: earnedP });
      const earned: PsnEarnedTrophy[] = await earnedP;

      const [trophies, already] = await Promise.all([
        prisma.trophy.findMany({ where: { gameId: game.id }, select: { id: true, psnTrophyId: true, earnedRate: true } }),
        prisma.userTrophy.findMany({ where: { userId, trophy: { gameId: game.id } }, select: { trophyId: true } }),
      ]);
      const byPsnId = new Map(trophies.map((t) => [t.psnTrophyId, t]));
      const have = new Set(already.map((r) => r.trophyId));

      const toCreate = earned
        .filter((e) => e.earnedAt && byPsnId.has(e.psnTrophyId) && !have.has(byPsnId.get(e.psnTrophyId)!.id))
        .map((e) => ({ userId, trophyId: byPsnId.get(e.psnTrophyId)!.id, earnedAt: e.earnedAt! }));
      if (toCreate.length) await prisma.userTrophy.createMany({ data: toCreate, skipDuplicates: true });

      // Global earn rates come back with the user's trophy data on PSN.
      if (provider.name === "psn") {
        await saveEarnRates(
          earned
            .filter((e) => e.earnedRate !== null && byPsnId.has(e.psnTrophyId) && byPsnId.get(e.psnTrophyId)!.earnedRate !== e.earnedRate)
            .map((e) => ({ id: byPsnId.get(e.psnTrophyId)!.id, rate: e.earnedRate! })),
        );
      }

      await recomputeUserGame(prisma, userId, game.id);
      await prisma.psnTitleSync.upsert({
        where: { userId_npCommunicationId: { userId, npCommunicationId: title.npCommunicationId } },
        create: { userId, npCommunicationId: title.npCommunicationId, lastUpdated: title.lastUpdated },
        update: { lastUpdated: title.lastUpdated },
      });
      gamesSynced++;
      trophiesSynced += toCreate.length;
    });

    // Sony's own totals feed the all-time leaderboards, even while a big library is still importing.
    if (profile?.earned && provider.name === "psn") {
      await recordPlayer({
        accountId,
        onlineId: profile.onlineId,
        avatarUrl: profile.avatarUrl,
        country: profile.country ?? null,
        isPlus: !!profile.isPlus,
        trophyLevel: profile.trophyLevel,
        levelProgress: profile.levelProgress,
        earned: profile.earned,
      });
    }

    await prisma.psnAccount.update({
      where: { userId },
      data: {
        lastSyncedAt: new Date(),
        ...(profile && provider.name === "psn"
          ? { trophyLevel: profile.trophyLevel, levelProgress: profile.levelProgress, avatarUrl: profile.avatarUrl }
          : {}),
      },
    });
    const done = await prisma.syncJob.update({
      where: { id: job.id },
      data: { status: "SUCCESS", finishedAt: new Date(), gamesSynced, trophiesSynced, remaining },
    });
    return Object.assign(done, { titles });
  } catch (err) {
    await prisma.syncJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        gamesSynced,
        trophiesSynced,
        remaining,
        error: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }
}

/**
 * Keeps syncing until the library is fully imported (or maxRuns is hit), so a
 * big library fills in without anyone pressing Sync now dozens of times.
 * Used after linking, after Sync now and by the background schedule.
 */
export async function syncUntilDone(
  userId: string,
  { trigger = "IMPORT", maxRuns = 100, pauseMs = 500 }: { trigger?: SyncTrigger; maxRuns?: number; pauseMs?: number } = {},
) {
  let job = await syncUser(userId, { trigger });
  for (let run = 1; run < maxRuns && job.remaining > 0; run++) {
    await new Promise((r) => setTimeout(r, pauseMs));
    // Same game list as the first run: only the not-yet-imported lists are left in it.
    job = await syncUser(userId, { trigger: trigger === "MANUAL" ? "IMPORT" : trigger, titles: job.titles });
  }
  return job;
}
