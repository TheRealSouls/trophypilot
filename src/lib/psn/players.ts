import {
  getProfileFromAccountId,
  getProfileFromUserName,
  getUserFriendsAccountIds,
  getUserTitles,
  getUserTrophiesEarnedForTitle,
  type ProfileFromUserNameResponse,
} from "psn-api";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { pointsFor, ULTRA_RARE_MAX } from "../trophies";
import { importTitles } from "./catalogue";
import { countryFromNpId } from "./npid";
import { psnAuth, sumCounts, toPsnError, withTimeout } from "./real";
import type { PsnTitle } from "./types";

export { countryFromNpId };

export type PlayerSnapshot = {
  accountId: string;
  onlineId: string;
  avatarUrl: string | null;
  country: string | null;
  isPlus: boolean;
  trophyLevel: number;
  levelProgress: number;
  earned: { platinum: number; gold: number; silver: number; bronze: number };
};

/** At most one stored snapshot per player per hour keeps the table small. */
const SNAPSHOT_EVERY_MS = 60 * 60_000;

/** Stores the latest public summary of a PSN player for the leaderboards. */
export async function recordPlayer(p: PlayerSnapshot) {
  const points = pointsFor(p.earned);
  const data = {
    onlineId: p.onlineId,
    avatarUrl: p.avatarUrl,
    isPlus: p.isPlus,
    trophyLevel: p.trophyLevel,
    levelProgress: p.levelProgress,
    ...p.earned,
    points,
    // PSN leaves out the trophy summary (level 0 here) when a player's trophies are private.
    trophiesPrivate: p.trophyLevel <= 0,
    // Keep a known country if this response didn't include one.
    ...(p.country ? { country: p.country } : {}),
  };
  await prisma.psnPlayer.upsert({
    where: { accountId: p.accountId },
    create: { accountId: p.accountId, country: p.country, ...data },
    update: data,
  });

  if (p.trophyLevel > 0) {
    const last = await prisma.psnPlayerSnapshot.findFirst({
      where: { accountId: p.accountId },
      orderBy: { takenAt: "desc" },
      select: { takenAt: true, points: true },
    });
    if (!last || Date.now() - last.takenAt.getTime() > SNAPSHOT_EVERY_MS || last.points !== points) {
      const { platinum, gold, silver, bronze } = p.earned;
      await prisma.psnPlayerSnapshot.create({
        data: { accountId: p.accountId, points, platinum, trophies: platinum + gold + silver + bronze },
      });
    }
  }
}

/** Records a player without letting a database hiccup break the page that saw them. */
export function recordPlayerQuietly(p: PlayerSnapshot) {
  return recordPlayer(p).catch((err) => console.error("[players] record failed", err));
}

export async function markTrophiesPrivate(accountId: string, isPrivate: boolean) {
  await prisma.psnPlayer
    .updateMany({ where: { accountId, trophiesPrivate: !isPrivate }, data: { trophiesPrivate: isPrivate } })
    .catch(() => {});
}

export function snapshotFromProfile(profile: ProfileFromUserNameResponse["profile"]): PlayerSnapshot {
  const e = profile.trophySummary?.earnedTrophies;
  return {
    accountId: profile.accountId,
    onlineId: profile.onlineId,
    avatarUrl: profile.avatarUrls?.find((a) => a.size === "l")?.avatarUrl ?? profile.avatarUrls?.at(-1)?.avatarUrl ?? null,
    country: countryFromNpId(profile.npId),
    isPlus: profile.plus === 1,
    // No summary means the player's trophies are private.
    trophyLevel: profile.trophySummary?.level ?? 0,
    levelProgress: profile.trophySummary?.progress ?? 0,
    earned: { platinum: e?.platinum ?? 0, gold: e?.gold ?? 0, silver: e?.silver ?? 0, bronze: e?.bronze ?? 0 },
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** PSN's largest page of trophy lists. */
const TITLES_PAGE = 800;

/** Every trophy list a player has, newest first: one PSN request per 800 lists. */
async function allTitles(accountId: string) {
  const out: RawTitle[] = [];
  let offset = 0;
  for (let page = 0; page < 25; page++) {
    const res = await withTimeout(getUserTitles(await psnAuth(), accountId, { limit: TITLES_PAGE, offset }));
    out.push(...(res.trophyTitles as unknown as RawTitle[]));
    if (!res.trophyTitles.length || out.length >= res.totalItemCount || !res.nextOffset) break;
    offset = res.nextOffset;
  }
  return out;
}

/**
 * Re-reads a player's summary and their full games list (for games played and
 * average completion), dates a few new platinums and counts ultra rares in a
 * few more lists. Each part is capped per run to stay polite to PSN. Returns
 * null if PSN has no such player.
 */
export async function refreshPlayer(onlineId: string, { platinumLookups = 5, rareLookups = 40 } = {}) {
  let profile: ProfileFromUserNameResponse["profile"];
  try {
    ({ profile } = await withTimeout(getProfileFromUserName(await psnAuth(), onlineId)));
  } catch (err) {
    const e = toPsnError(err);
    if (e.kind === "not_found") return null;
    throw e;
  }
  const snap = snapshotFromProfile(profile);
  await recordPlayer(snap);
  const player = await prisma.psnPlayer.findUniqueOrThrow({ where: { accountId: snap.accountId } });
  if (player.trophiesPrivate || player.hidden) return { player, titles: 0, platinumsDated: 0 };

  let raw: RawTitle[];
  try {
    raw = await allTitles(snap.accountId);
  } catch (err) {
    const e = toPsnError(err);
    if (e.kind === "private") {
      await markTrophiesPrivate(snap.accountId, true);
      return { player, titles: 0, platinumsDated: 0, ultraRaresCounted: 0 };
    }
    throw e;
  }

  const titles = await storePlayerTitles(snap.accountId, raw);
  const platinumsDated = await datePlatinums(snap.accountId, platinumLookups);
  const rares = await countUltraRares(snap.accountId, rareLookups);
  await prisma.psnPlayer.update({
    where: { accountId: snap.accountId },
    data: {
      titlesRefreshedAt: new Date(),
      gamesPlayed: raw.length,
      avgCompletion: raw.length ? Math.round(raw.reduce((s, t) => s + (t.progress ?? 0), 0) / raw.length) : null,
    },
  });
  return { player, titles, platinumsDated, ultraRaresCounted: rares.counted };
}

type RawTitle = {
  npCommunicationId: string;
  npServiceName: "trophy" | "trophy2";
  trophyTitleName: string;
  trophyTitleIconUrl?: string | null;
  trophyTitlePlatform: string;
  progress?: number;
  earnedTrophies?: { platinum: number };
  definedTrophies?: { bronze: number; silver: number; gold: number; platinum: number };
  lastUpdatedDateTime: string;
};

/** Saves a player's recently played lists (and adds any new games to the catalogue). */
export async function storePlayerTitles(accountId: string, raw: RawTitle[]) {
  const titles: PsnTitle[] = raw.map((t) => ({
    npCommunicationId: t.npCommunicationId,
    npServiceName: t.npServiceName,
    title: t.trophyTitleName,
    iconUrl: t.trophyTitleIconUrl ?? null,
    platforms: String(t.trophyTitlePlatform).split(","),
    lastUpdated: new Date(t.lastUpdatedDateTime),
    definedTrophies: sumCounts(t.definedTrophies),
  }));
  // Only lists that changed since we last stored them need writing.
  const stored = new Map(
    (
      await prisma.psnPlayerTitle.findMany({
        where: { accountId, npCommunicationId: { in: titles.map((t) => t.npCommunicationId) } },
        select: { npCommunicationId: true, lastUpdated: true, progress: true },
      })
    ).map((s) => [s.npCommunicationId, s]),
  );
  const changed = raw.filter((t) => {
    const s = stored.get(t.npCommunicationId);
    return !s || s.lastUpdated.getTime() !== new Date(t.lastUpdatedDateTime).getTime() || s.progress !== (t.progress ?? 0);
  });
  if (!changed.length) return titles.length;
  await importTitles(
    titles.filter((t) => changed.some((c) => c.npCommunicationId === t.npCommunicationId)),
    accountId,
  );
  const games = new Map(
    (
      await prisma.game.findMany({
        where: { npCommunicationId: { in: titles.map((t) => t.npCommunicationId) } },
        select: { id: true, npCommunicationId: true },
      })
    ).map((g) => [g.npCommunicationId!, g.id]),
  );
  const rows = changed.flatMap((t) => {
    const gameId = games.get(t.npCommunicationId);
    if (!gameId) return [];
    return [
      {
        accountId,
        npCommunicationId: t.npCommunicationId,
        gameId,
        progress: t.progress ?? 0,
        hasPlatinum: (t.earnedTrophies?.platinum ?? 0) > 0,
        lastUpdated: new Date(t.lastUpdatedDateTime),
      },
    ];
  });
  // New lists in one statement (a big library's first refresh is thousands of them), changed ones one by one.
  const fresh = rows.filter((r) => !stored.has(r.npCommunicationId));
  for (let i = 0; i < fresh.length; i += 1000) {
    await prisma.psnPlayerTitle.createMany({ data: fresh.slice(i, i + 1000), skipDuplicates: true });
  }
  for (const { accountId: _a, npCommunicationId, ...data } of rows.filter((r) => stored.has(r.npCommunicationId))) {
    await prisma.psnPlayerTitle.update({ where: { accountId_npCommunicationId: { accountId, npCommunicationId } }, data });
  }
  return titles.length;
}

/**
 * Counts the ultra rare trophies (earned by ULTRA_RARE_MAX% of players or
 * fewer) a tracked player has, list by list, and stores the running total on
 * PsnPlayer. Lists they haven't started count as 0 and finished lists we hold
 * in full (with rarity) are counted from the catalogue, both for free; the
 * rest cost one PSN request each, at most `maxLookups` per call. A list is
 * counted again when it changes. `ultraRarePending` is how many are left.
 */
export async function countUltraRares(accountId: string, maxLookups = 40) {
  const titles = await prisma.psnPlayerTitle.findMany({
    where: { accountId },
    select: {
      npCommunicationId: true,
      gameId: true,
      progress: true,
      lastUpdated: true,
      rareCheckedAt: true,
      game: { select: { npServiceName: true, definedTrophies: true } },
    },
    orderBy: { lastUpdated: "desc" },
  });
  const due = titles.filter((t) => !t.rareCheckedAt || t.rareCheckedAt < t.lastUpdated);

  // What the catalogue knows about the finished lists: how many trophies, how many with a rarity, how many ultra rare.
  const finished = [...new Set(due.filter((t) => t.progress === 100).map((t) => t.gameId))];
  const [held, ultra] = finished.length
    ? await Promise.all([
        prisma.trophy.groupBy({ by: ["gameId"], where: { gameId: { in: finished } }, _count: { _all: true, earnedRate: true } }),
        prisma.trophy.groupBy({ by: ["gameId"], where: { gameId: { in: finished }, earnedRate: { lte: ULTRA_RARE_MAX } }, _count: { _all: true } }),
      ])
    : [[], []];
  const heldBy = new Map(held.map((h) => [h.gameId, h._count]));
  const ultraBy = new Map(ultra.map((u) => [u.gameId, u._count._all]));

  const counted: { id: string; n: number }[] = [];
  const toFetch: typeof due = [];
  for (const t of due) {
    const h = heldBy.get(t.gameId);
    if (t.progress === 0) counted.push({ id: t.npCommunicationId, n: 0 });
    else if (t.progress === 100 && h && t.game.definedTrophies && h._all >= t.game.definedTrophies && h.earnedRate === h._all)
      counted.push({ id: t.npCommunicationId, n: ultraBy.get(t.gameId) ?? 0 });
    else toFetch.push(t);
  }

  let lookups = 0;
  let stopped = false;
  // A few at a time: quicker than one by one, still gentle on PSN.
  for (let i = 0; i < toFetch.length && lookups < maxLookups && !stopped; i += 4) {
    const batch = toFetch.slice(i, Math.min(i + 4, i + maxLookups - lookups));
    lookups += batch.length;
    await Promise.all(
      batch.map(async (t) => {
        try {
          const opts = t.game.npServiceName === "trophy" ? { npServiceName: "trophy" as const } : {};
          const res = await withTimeout(getUserTrophiesEarnedForTitle(await psnAuth(), accountId, t.npCommunicationId, "all", opts));
          const n = res.trophies.filter((x) => x.earned && Number(x.trophyEarnedRate) <= ULTRA_RARE_MAX).length;
          counted.push({ id: t.npCommunicationId, n });
        } catch (err) {
          // Rate limited: stop for now. Anything else: try this list again next time.
          if (toPsnError(err).kind === "rate_limited") stopped = true;
        }
      }),
    );
    await sleep(150);
  }

  // Write the counts in a few statements rather than one per list.
  const now = new Date();
  for (let i = 0; i < counted.length; i += 500) {
    const chunk = counted.slice(i, i + 500);
    await prisma.$executeRaw`
      UPDATE "PsnPlayerTitle" AS t SET "ultraRare" = v.n, "rareCheckedAt" = ${now}
      FROM (VALUES ${Prisma.join(chunk.map((c) => Prisma.sql`(${c.id}, ${c.n}::int)`))}) AS v(id, n)
      WHERE t."accountId" = ${accountId} AND t."npCommunicationId" = v.id`;
  }

  const total = await prisma.psnPlayerTitle.aggregate({ where: { accountId, rareCheckedAt: { not: null } }, _sum: { ultraRare: true } });
  const pending = due.length - counted.length;
  const anyCounted = titles.length - due.length + counted.length > 0;
  await prisma.psnPlayer.update({
    where: { accountId },
    data: { ultraRare: anyCounted ? (total._sum.ultraRare ?? 0) : null, ultraRarePending: pending },
  });
  return { counted: counted.length, lookups, pending };
}

/** Looks up the exact date of the newest platinums we only know exist (one PSN request each). */
export async function datePlatinums(accountId: string, max = 5) {
  const undated = await prisma.psnPlayerTitle.findMany({
    where: { accountId, hasPlatinum: true, platinumAt: null },
    orderBy: { lastUpdated: "desc" },
    take: max,
    include: { game: { select: { npServiceName: true } } },
  });
  let dated = 0;
  for (const u of undated) {
    try {
      const opts = u.game.npServiceName === "trophy" ? { npServiceName: "trophy" as const } : {};
      const earned = await withTimeout(
        getUserTrophiesEarnedForTitle(await psnAuth(), accountId, u.npCommunicationId, "all", opts),
      );
      const plat = earned.trophies.find((t) => t.trophyType === "platinum" && t.earned && t.earnedDateTime);
      if (plat?.earnedDateTime) {
        await prisma.psnPlayerTitle.update({
          where: { accountId_npCommunicationId: { accountId, npCommunicationId: u.npCommunicationId } },
          data: { platinumAt: new Date(plat.earnedDateTime) },
        });
        dated++;
      }
    } catch (err) {
      if (toPsnError(err).kind === "rate_limited") break;
      // Otherwise leave it undated; the next refresh tries again.
    }
    await sleep(250);
  }
  return dated;
}

/**
 * Finds new players through the public friends lists of tracked players,
 * best-ranked first (top hunters tend to be friends with other top hunters).
 * Each new player costs two PSN requests. Players whose friends list is
 * private are skipped.
 */
export async function discoverPlayers({ maxNew = 50, seeds = 5, pauseMs = 300 } = {}) {
  const sources = await prisma.psnPlayer.findMany({
    where: { friendsCheckedAt: null, hidden: false, trophiesPrivate: false },
    orderBy: { points: "desc" },
    take: seeds,
    select: { accountId: true, onlineId: true },
  });
  let added = 0;
  const checked: string[] = [];
  for (const src of sources) {
    if (added >= maxNew) break;
    let friends: string[] = [];
    try {
      friends = (await withTimeout(getUserFriendsAccountIds(await psnAuth(), src.accountId, { limit: 1000 }))).friends;
    } catch {
      // Friends list not visible to us.
    }
    await prisma.psnPlayer.update({ where: { accountId: src.accountId }, data: { friendsCheckedAt: new Date() } });
    checked.push(src.onlineId);

    const known = new Set(
      (await prisma.psnPlayer.findMany({ where: { accountId: { in: friends } }, select: { accountId: true } })).map(
        (p) => p.accountId,
      ),
    );
    for (const id of friends) {
      if (added >= maxNew) break;
      if (known.has(id)) continue;
      try {
        const { onlineId } = await withTimeout(getProfileFromAccountId(await psnAuth(), id));
        const { profile } = await withTimeout(getProfileFromUserName(await psnAuth(), onlineId));
        await recordPlayer(snapshotFromProfile(profile));
        added++;
      } catch (err) {
        if (toPsnError(err).kind === "rate_limited") return { added, checked, stoppedEarly: true };
      }
      await sleep(pauseMs);
    }
  }
  return { added, checked, stoppedEarly: false };
}
