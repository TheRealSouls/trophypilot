import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isAdmin } from "@/lib/forum";
import { unreadConversations } from "@/lib/community";

export const dynamic = "force-dynamic";

/**
 * Who is signed in, for the navbar and theme (src/components/session.tsx).
 * Pages don't read the session themselves, so they can be served from cache;
 * this small request fills in the account parts afterwards.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null }, { headers: { "Cache-Control": "private, no-store" } });
  const admin = isAdmin(user);
  const [pending, unread, reports] = await Promise.all([
    prisma.friendship.count({ where: { addresseeId: user.id, status: "PENDING" } }),
    unreadConversations(user.id),
    // Staff see how many reports are waiting.
    admin ? prisma.report.count({ where: { status: "OPEN" } }).then(async (n) => n + (await prisma.guide.count({ where: { status: "PENDING" } }))) : 0,
  ]);
  return NextResponse.json(
    {
      user: {
        id: user.id,
        username: user.username,
        name: user.psn?.verified ? user.psn.onlineId : user.username,
        avatar: user.avatar,
        avatarUrl: user.psn?.avatarUrl ?? null,
        avatarHue: user.avatarHue,
        psnVerified: !!user.psn?.verified,
        admin,
        pending,
        unread,
        reports,
        theme: user.theme === "dark" ? "dark" : "light",
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
