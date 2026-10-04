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
 * Games imported from a PSN profile arrive without trophies. The first visit
 * fetches the list from PSN; `trophyError` is set if that fails.
 */
export const loadGame = cache(async (slug: string) => {
  // Shared by everyone viewing the game for a minute (bust("game:<slug>") after changing it).
  let game = await cached(`game:${slug}`, () => query(slug), { ttlMs: 60_000, tags: ["games"] });
  if (!game) notFound();
  let trophyError: string | null = null;
  if (game.trophies.length === 0 && game.npCommunicationId && !isDemoMode()) {
    try {
      if (await ensureGameTrophies(getProvider(), game)) {
        // This list and its other platforms' pages ("list not loaded") change.
        bust(`game:${slug}`, `lists:${game.titleKey || game.id}`);
        game = (await query(slug))!;
      }
    } catch (err) {
      console.error(`[catalogue] trophy list for ${slug} failed`, err);
      trophyError = "We couldn't load this trophy list from PlayStation Network. Refresh to try again.";
    }
  }
  return { ...game, trophyError };
});
