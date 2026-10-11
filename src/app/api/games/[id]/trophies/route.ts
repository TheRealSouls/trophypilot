import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isDemoMode } from "@/lib/psn/sync";
import { loadListFromPsn } from "@/app/games/[slug]/data";

/** Trophies of one list, for guide steps, trophy-by-trophy notes and session targets. Fetches the list from PSN first if we don't have it yet. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const game = await prisma.game.findUnique({ where: { id } });
  if (!game) return NextResponse.json({ error: "Unknown game" }, { status: 404 });

  let error: string | null = null;
  if (!isDemoMode()) {
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
