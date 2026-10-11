import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * The signed-in member's latest sync, for the Sync buttons to show progress:
 * running or done, games checked, new trophies, and games still to import.
 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ job: null }, { status: 401 });
  const job = await prisma.syncJob.findFirst({
    where: { userId },
    orderBy: { startedAt: "desc" },
    select: { status: true, gamesSynced: true, trophiesSynced: true, remaining: true, error: true, startedAt: true, finishedAt: true },
  });
  return NextResponse.json({ job }, { headers: { "Cache-Control": "private, no-store" } });
}
