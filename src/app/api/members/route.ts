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
  if (q.length < 2) return NextResponse.json({ members: [] });
  const users = await prisma.user.findMany({
    where: {
      id: { not: me },
      allowMessages: { not: "NOBODY" },
      OR: [
        { username: { startsWith: q.toLowerCase() } },
        { psn: { verified: true, onlineId: { startsWith: q, mode: "insensitive" } } },
      ],
    },
    take: 8,
    orderBy: { username: "asc" },
    select: { username: true, psn: { select: { onlineId: true, verified: true } } },
  });
  return NextResponse.json(
    { members: users.map((u) => ({ username: u.username, name: u.psn?.verified ? u.psn.onlineId : u.username })) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
