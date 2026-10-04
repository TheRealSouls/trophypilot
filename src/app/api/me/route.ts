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
  const [pending, unread] = await Promise.all([
    prisma.friendship.count({ where: { addresseeId: user.id, status: "PENDING" } }),
    unreadConversations(user.id),
  ]);
  return NextResponse.json(
    {
      user: {
        username: user.username,
        name: user.psn?.verified ? user.psn.onlineId : user.username,
        avatar: user.avatar,
        avatarUrl: user.psn?.avatarUrl ?? null,
        avatarHue: user.avatarHue,
        psnVerified: !!user.psn?.verified,
        admin: isAdmin(user),
        pending,
        unread,
        theme: user.theme === "dark" ? "dark" : "light",
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
