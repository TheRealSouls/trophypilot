import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { recomputeUserGame } from "../progress";
import { trophySlugs } from "../trophy-slug";
import { cleanTitle, hashString, slugify, titleKey } from "../utils";
import type { PsnEarnedTrophy, PsnTitle, TrophyProvider } from "./types";

/**
 * The game catalogue is built from PSN itself: every title seen on a synced
 * or looked-up profile gets a Game row. Trophy lists are fetched lazily the
 * first time someone needs them.
 */

const slugTaken = async (slug: string) => !!(await prisma.game.findUnique({ where: { slug }, select: { id: true } }));

/** "rainbow-six-siege", then "rainbow-six-siege-ps4", then "rainbow-six-siege-ps4-2" for regional stacks. */
async function uniqueGameSlug(title: string, platforms: string[], npCommunicationId: string) {
  // Non-Latin titles slugify to nothing, so fall back to the list id (npwr12345-00).
  const base = slugify(title) || slugify(npCommunicationId);
  if (!(await slugTaken(base))) return base;
  const withPlatform = `${base}-${slugify(platforms[0] ?? "")}`.replace(/-$/, "");
  if (!(await slugTaken(withPlatform))) return withPlatform;
  let i = 2;
  while (await slugTaken(`${withPlatform}-${i}`)) i++;
  return `${withPlatform}-${i}`;
}

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

async function createGame(title: PsnTitle, sampleAccountId: string | null) {
  // Two concurrent imports can race for the same slug or npCommunicationId.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.game.create({
        data: {
          slug: await uniqueGameSlug(cleanTitle(title.title), title.platforms, title.npCommunicationId),
          npCommunicationId: title.npCommunicationId,
          npServiceName: title.npServiceName,
          title: cleanTitle(title.title),
          titleKey: titleKey(title.title),
          platforms: title.platforms.join(","),
          iconUrl: title.iconUrl,
          definedTrophies: title.definedTrophies ?? null,
          coverHue: hashString(title.title) % 360,
          psnSampleAccountId: sampleAccountId,
        },
        select: { id: true, slug: true, npCommunicationId: true },
      });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      const existing = await prisma.game.findUnique({
        where: { npCommunicationId: title.npCommunicationId },
        select: { id: true, slug: true, npCommunicationId: true },
      });
      if (existing) return existing;
    }
  }
  throw new Error(`Couldn't create a catalogue entry for ${title.title}`);
}

/**
 * Makes sure every title has a Game row. Returns npCommunicationId → slug.
 * Only missing titles are written, so repeat calls are one read.
 */
export async function importTitles(titles: PsnTitle[], sampleAccountId: string | null): Promise<Map<string, string>> {
  const ids = titles.map((t) => t.npCommunicationId);
  const existing = await prisma.game.findMany({
    where: { npCommunicationId: { in: ids } },
    select: { slug: true, npCommunicationId: true, iconUrl: true, psnSampleAccountId: true, definedTrophies: true },
  });
  const slugs = new Map(existing.map((g) => [g.npCommunicationId!, g.slug]));

  // Remember PSN's trophy total, so a list that grows (new DLC) gets fetched again.
  for (const g of existing) {
    const defined = titles.find((x) => x.npCommunicationId === g.npCommunicationId)?.definedTrophies;
    if (defined && defined !== g.definedTrophies) {
      await prisma.game.update({ where: { slug: g.slug }, data: { definedTrophies: defined } });
    }
  }

  // Backfill details that older rows might be missing.
  const stale = existing.filter((g) => (!g.iconUrl || !g.psnSampleAccountId) && sampleAccountId);
  for (const g of stale) {
    const t = titles.find((x) => x.npCommunicationId === g.npCommunicationId);
    await prisma.game.update({
      where: { slug: g.slug },
      data: { iconUrl: g.iconUrl ?? t?.iconUrl ?? null, psnSampleAccountId: g.psnSampleAccountId ?? sampleAccountId },
    });
  }

  const missing = titles.filter((t, i) => !slugs.has(t.npCommunicationId) && titles.findIndex((x) => x.npCommunicationId === t.npCommunicationId) === i);
  // A big library brings hundreds of new games at once: work out their addresses in memory and insert them together.
  if (missing.length > 20) {
    await createGamesInBulk(missing, sampleAccountId);
    const made = await prisma.game.findMany({
      where: { npCommunicationId: { in: missing.map((t) => t.npCommunicationId) } },
      select: { slug: true, npCommunicationId: true },
    });
    for (const g of made) slugs.set(g.npCommunicationId!, g.slug);
  }
  // One by one: small batches, and anything the bulk insert skipped.
  for (const t of missing) {
    if (slugs.has(t.npCommunicationId)) continue;
    slugs.set(t.npCommunicationId, (await createGame(t, sampleAccountId)).slug);
  }
  return slugs;
}

/** Same addresses as uniqueGameSlug, checked against every slug in one read instead of a query each. */
async function createGamesInBulk(titles: PsnTitle[], sampleAccountId: string | null) {
  const taken = new Set((await prisma.game.findMany({ select: { slug: true } })).map((g) => g.slug));
  const pick = (t: PsnTitle) => {
    const base = slugify(cleanTitle(t.title)) || slugify(t.npCommunicationId);
    if (!taken.has(base)) return base;
    const withPlatform = `${base}-${slugify(t.platforms[0] ?? "")}`.replace(/-$/, "");
    if (!taken.has(withPlatform)) return withPlatform;
    let i = 2;
    while (taken.has(`${withPlatform}-${i}`)) i++;
    return `${withPlatform}-${i}`;
  };
  const rows = titles.map((t) => {
    const slug = pick(t);
    taken.add(slug);
    return {
      slug,
      npCommunicationId: t.npCommunicationId,
      npServiceName: t.npServiceName,
      title: cleanTitle(t.title),
      titleKey: titleKey(t.title),
      platforms: t.platforms.join(","),
      iconUrl: t.iconUrl,
      definedTrophies: t.definedTrophies ?? null,
      coverHue: hashString(t.title) % 360,
      psnSampleAccountId: sampleAccountId,
    };
  });
  for (let i = 0; i < rows.length; i += 500) {
    await prisma.game.createMany({ data: rows.slice(i, i + 500), skipDuplicates: true });
  }
}

type CatalogueGame = {
  id: string;
  title: string;
  npCommunicationId: string | null;
  npServiceName: string | null;
  platforms: string;
  iconUrl: string | null;
  psnSampleAccountId: string | null;
  definedTrophies?: number | null;
};

export function gameAsTitle(g: CatalogueGame): PsnTitle | null {
  if (!g.npCommunicationId) return null;
  return {
    npCommunicationId: g.npCommunicationId,
    npServiceName: g.npServiceName === "trophy" ? "trophy" : "trophy2",
    title: g.title,
    iconUrl: g.iconUrl,
    platforms: g.platforms.split(","),
    lastUpdated: new Date(),
  };
}

/**
 * Fetches and stores the trophy groups and trophies for a game if it has none
 * yet, or fetches the list again if PSN reports more trophies than we have (a
 * DLC pack was added; its group is marked addedLater).
 * Pass `earned` when you're fetching a player's progress on this list anyway:
 * its earn rates fill in rarity, and it saves a second call for the same data.
 */
export async function ensureGameTrophies(
  provider: TrophyProvider,
  game: CatalogueGame,
  { earned }: { earned?: Promise<PsnEarnedTrophy[]> } = {},
) {
  const title = gameAsTitle(game);
  if (!title) return false;
  const have = await prisma.trophy.count({ where: { gameId: game.id } });
  const refresh = have > 0;
  if (refresh && !(game.definedTrophies && have < game.definedTrophies)) return false;

  // Global earn rates only come back on per-user calls, so borrow them from
  // an account we know owns the title (or the player being synced).
  const ratesFrom =
    earned ??
    (game.psnSampleAccountId && provider.name === "psn" ? provider.getTitleEarned(game.psnSampleAccountId, title) : null);
  const [def, rates] = await Promise.all([
    provider.getTitleDefinition(title),
    // Rarity is a nice-to-have; the list is still useful without it.
    (ratesFrom ?? Promise.resolve([]))
      .then((list) => new Map(list.filter((e) => e.earnedRate !== null).map((e) => [e.psnTrophyId, e.earnedRate!])))
      .catch(() => new Map<number, number>()),
  ]);

  await prisma.trophyGroup.createMany({
    data: def.groups.map((g) => ({
      gameId: game.id,
      psnGroupId: g.psnGroupId,
      name: g.name,
      iconUrl: g.iconUrl ?? null,
      isDlc: g.psnGroupId !== "default",
      addedLater: refresh,
    })),
    skipDuplicates: true,
  });
  // Packs stored before we kept their pictures get them now.
  for (const g of def.groups) {
    if (g.iconUrl) {
      await prisma.trophyGroup.updateMany({ where: { gameId: game.id, psnGroupId: g.psnGroupId, iconUrl: null }, data: { iconUrl: g.iconUrl } });
    }
  }
  const groupIds = new Map(
    (await prisma.trophyGroup.findMany({ where: { gameId: game.id }, select: { id: true, psnGroupId: true } })).map((g) => [
      g.psnGroupId,
      g.id,
    ]),
  );

  // Readable addresses for the trophies we don't have yet, without taking any existing one.
  const existing = await prisma.trophy.findMany({ where: { gameId: game.id }, select: { psnTrophyId: true, slug: true } });
  const stored = new Set(existing.map((t) => t.psnTrophyId));
  const fresh = def.trophies.filter((t) => groupIds.has(t.psnGroupId) && !stored.has(t.psnTrophyId));
  const slugs = trophySlugs(fresh, existing.flatMap((t) => (t.slug ? [t.slug] : [])));

  // One insert for the whole list; a concurrent import of the same game just skips.
  await prisma.trophy.createMany({
    data: fresh
      .map((t) => ({
        gameId: game.id,
        groupId: groupIds.get(t.psnGroupId)!,
        psnTrophyId: t.psnTrophyId,
        slug: slugs.get(t.psnTrophyId)!,
        name: t.name,
        description: t.description,
        type: t.type,
        hidden: t.hidden,
        iconUrl: t.iconUrl,
        earnedRate: rates.get(t.psnTrophyId) ?? null,
      })),
    skipDuplicates: true,
  });

  if (refresh) {
    // Everyone's completion on this list changes when it gains trophies.
    const players = await prisma.userGame.findMany({ where: { gameId: game.id }, select: { userId: true } });
    for (const p of players) await recomputeUserGame(prisma, p.userId, game.id);
  }
  // Stop asking if PSN's total counts something the definition doesn't list.
  if (game.definedTrophies && def.trophies.length < game.definedTrophies) {
    await prisma.game.update({ where: { id: game.id }, data: { definedTrophies: def.trophies.length } });
  }
  return true;
}

/**
 * Keeps the home page's "New trophy lists" and "New DLC" current: loads the
 * trophy lists of the newest games (highest NPWR ids) that nobody has opened
 * yet, and fetches again lists that PSN says have grown (new DLC).
 * Each list costs two or three PSN requests. A list PSN refuses is skipped;
 * rate limits and sign-in problems stop the run.
 */
export async function keepListsFresh(provider: TrophyProvider, { newest = 5, grown = 5 } = {}) {
  const [fresh, grownIds] = await Promise.all([
    prisma.game.findMany({
      where: { npCommunicationId: { startsWith: "NPWR" }, trophies: { none: {} } },
      orderBy: { npCommunicationId: "desc" },
      // Extra candidates, so a few lists PSN refuses don't block the rest.
      take: newest * 2,
    }),
    prisma.$queryRaw<{ id: string }[]>`
      SELECT g.id FROM "Game" g
      WHERE g."definedTrophies" > (SELECT count(*) FROM "Trophy" t WHERE t."gameId" = g.id)
        AND EXISTS (SELECT 1 FROM "Trophy" t WHERE t."gameId" = g.id)
      LIMIT ${grown}`,
  ]);
  const grownGames = grownIds.length ? await prisma.game.findMany({ where: { id: { in: grownIds.map((r) => r.id) } } }) : [];
  let loaded = 0;
  let refreshed = 0;
  let failed = 0;
  const attempt = async (g: (typeof fresh)[number]) => {
    try {
      return await ensureGameTrophies(provider, g);
    } catch (err) {
      const kind = (err as { kind?: string }).kind;
      if (kind === "rate_limited" || kind === "auth") throw err;
      failed++;
      return false;
    }
  };
  for (const g of fresh) {
    if (loaded >= newest) break;
    if (await attempt(g)) loaded++;
  }
  for (const g of grownGames) if (await attempt(g)) refreshed++;
  return { loaded, refreshed, failed };
}
