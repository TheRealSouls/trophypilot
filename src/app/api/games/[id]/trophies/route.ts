import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isDemoMode } from "@/lib/psn/sync";
import { loadListFromPsn } from "@/app/games/[slug]/data";
import { rateLimit } from "@/lib/rate-limit";

/** Trophies of one list, for guide steps, trophy-by-trophy notes and session targets. Fetches the list from PSN first if we don't have it yet. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const game = await prisma.game.findUnique({ where: { id } });
  if (!game) return NextResponse.json({ error: "Unknown game" }, { status: 404 });

  let error: string | null = null;
  // Loading a list from PSN adds its trophies to the database: a few per visitor, and a cap for the
  // whole site each hour, so nobody can walk the catalogue and fill the database with every list.
  const mayLoad =
    !isDemoMode() &&
    (await prisma.trophy.count({ where: { gameId: id } })) === 0
      ? (await rateLimit("list-load", 20, 10 * 60_000)) && (await rateLimit("list-load-site", 300, 60 * 60_000, "all"))
      : !isDemoMode();
  if (!mayLoad) error = "This trophy list can't be loaded right now. Try again in a little while.";
  if (mayLoad) {
    try {
      await loadListFromPsn(game);
    } catch (err) {
      console.error("[trophies] loading list failed", err);
      error = "Couldn't load this trophy list from PSN right now. You can still publish without linking trophies.";
    }
  }
  const trophies = await prisma.trophy.findMany({
    where: { gameId: id },
    orderBy: { psnTrophyId: "asc" },
    select: { id: true, name: true, description: true, type: true, hidden: true },
  });
  return NextResponse.json({ trophies, error });
}
