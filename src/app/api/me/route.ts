import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isAdmin, isStaff } from "@/lib/roles";
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
  const admin = isStaff(user);
  const [pending, unread, reports] = await Promise.all([
    prisma.friendship.count({ where: { addresseeId: user.id, status: "PENDING" } }),
    unreadConversations(user.id),
    // Staff see how much is waiting for them: reports, guides to review and online flags.
    admin
      ? Promise.all([
          prisma.report.count({ where: { status: "OPEN" } }),
          prisma.guide.count({ where: { status: "PENDING" } }),
          prisma.onlineFlag.count({ where: { status: "PENDING" } }),
        ]).then((n) => n.reduce((a, b) => a + b, 0))
      : 0,
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
        siteAdmin: isAdmin(user),
        pending,
        unread,
        reports,
        theme: user.theme === "dark" ? "dark" : "light",
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
