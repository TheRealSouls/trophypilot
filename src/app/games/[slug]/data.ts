import { cache } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { bust, cached } from "@/lib/cache";
import { ensureGameTrophies } from "@/lib/psn/catalogue";
import { getProvider, isDemoMode } from "@/lib/psn/sync";

const query = (slug: string) =>
  prisma.game.findUnique({
    where: { slug },
    include: {
      groups: { orderBy: { psnGroupId: "asc" } },
      trophies: { include: { _count: { select: { tips: true } } } },
      _count: { select: { userGames: true } },
    },
  });

/**
 * A game and its trophy list, from the database only, so the page never waits
 * for PlayStation Network. Games imported from a PSN profile arrive without
 * trophies: `needsList` tells the page to fetch the list in the browser
 * (ListLoader), which shows the page at once and fills the list in.
 */
export const loadGame = cache(async (slug: string) => {
  // Shared by everyone viewing the game for a minute (bust("game:<slug>") after changing it).
  const game = await cached(`game:${slug}`, () => query(slug), { ttlMs: 60_000, tags: ["games"] });
  if (!game) notFound();
  return { ...game, needsList: game.trophies.length === 0 && !!game.npCommunicationId && !isDemoMode() };
});

/**
 * Fetches a game's trophy list from PSN if we don't have it (or it grew).
 * Used by /api/games/[id]/trophies, which ListLoader calls.
 */
export async function loadListFromPsn(game: Parameters<typeof ensureGameTrophies>[1] & { slug: string; titleKey: string }) {
  if (isDemoMode()) return false;
  const loaded = await ensureGameTrophies(getProvider(), game);
  // This list and its other platforms' pages ("list not loaded") change.
  if (loaded) bust(`game:${game.slug}`, `lists:${game.titleKey || game.id}`);
  return loaded;
}
