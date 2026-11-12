import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { trophyCounts } from "@/lib/games";

/** Game picker search: each trophy list separately, since guides and sessions belong to one list. */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 2) return NextResponse.json({ games: [] });
  const games = await prisma.game.findMany({
    where: { title: { contains: q, mode: "insensitive" } },
    // The stored player count, so typing doesn't make the database count players for every match.
    orderBy: [{ players: "desc" }, { title: "asc" }, { npServiceName: "desc" }],
    take: 20,
    select: { id: true, title: true, platforms: true, iconUrl: true, npCommunicationId: true },
  });
  const counts = await trophyCounts(games.map((g) => g.id));
  return NextResponse.json(
    { games: games.map((g) => ({ ...g, trophies: counts.get(g.id) ?? 0 })) },
    { headers: { "Cache-Control": "private, max-age=30" } },
  );
}
