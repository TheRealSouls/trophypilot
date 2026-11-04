import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Member name suggestions for the Messages "To" box: usernames and verified
 * PSN IDs starting with what's typed. Signed-in members only, at most 8, and
 * only people who accept messages.
 */
export async function GET(req: Request) {
  const me = await getSessionUserId();
  if (!me) return NextResponse.json({ members: [] }, { status: 401 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 30);
  // Usernames and PSN IDs only use letters, numbers, "_" and "-"; anything else matches nobody.
  if (q.length < 2 || !/^[A-Za-z0-9_-]+$/.test(q)) return NextResponse.json({ members: [] });
  const lower = q.toLowerCase();
  // In a database prefix search "_" means any one character, so a typed "_" can match a little too
  // much: ask for a few extra and keep only real matches.
  const users = await prisma.user.findMany({
    where: {
      id: { not: me },
      allowMessages: { not: "NOBODY" },
      OR: [{ username: { startsWith: lower } }, { psn: { verified: true, onlineId: { startsWith: q, mode: "insensitive" } } }],
    },
    take: q.includes("_") ? 40 : 8,
    orderBy: { username: "asc" },
    select: { username: true, psn: { select: { onlineId: true, verified: true } } },
  });
  const matches = users
    .filter((u) => u.username.startsWith(lower) || (u.psn?.verified && u.psn.onlineId.toLowerCase().startsWith(lower)))
    .slice(0, 8);
  return NextResponse.json(
    { members: matches.map((u) => ({ username: u.username, name: u.psn?.verified ? u.psn.onlineId : u.username })) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
