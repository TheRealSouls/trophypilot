import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";

/** Game picker search: each trophy list separately, since guides and sessions belong to one list. */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 2) return NextResponse.json({ games: [] });
  const games = await prisma.game.findMany({
    where: { title: { contains: q, mode: "insensitive" } },
    // The stored player count, so typing doesn't make the database count players for every match.
    orderBy: [{ players: "desc" }, { title: "asc" }, { npServiceName: "desc" }],
    take: 20,
    select: { id: true, title: true, platforms: true, iconUrl: true, npCommunicationId: true, _count: { select: { trophies: true } } },
  });
  return NextResponse.json(
    { games: games.map(({ _count, ...g }) => ({ ...g, trophies: _count.trophies })) },
    { headers: { "Cache-Control": "private, max-age=30" } },
  );
}
