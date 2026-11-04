import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * When the newest message in any of the member's conversations arrived (ms), for the Messages page's
 * live updates (LiveRefresh in src/app/messages/forms.tsx). The page polls this one small query and
 * only re-renders when it changes, instead of reloading every conversation every few seconds.
 */
export async function GET() {
  const me = await getSessionUserId();
  if (!me) return NextResponse.json({ at: null }, { status: 401 });
  const r = await prisma.conversation.aggregate({ where: { members: { some: { userId: me } } }, _max: { lastMessageAt: true } });
  return NextResponse.json({ at: r._max.lastMessageAt?.getTime() ?? 0 }, { headers: { "Cache-Control": "private, no-store" } });
}
