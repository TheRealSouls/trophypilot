import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isDemoMode } from "@/lib/psn/sync";

export const dynamic = "force-dynamic";

/**
 * Site and database check for uptime monitors. Render's own health check uses /api/ping instead,
 * which doesn't wait on the database. This one answers within 4 seconds either way.
 */
export async function GET() {
  const started = Date.now();
  const db = await Promise.race([
    prisma.$queryRaw`SELECT 1`.then(() => "ok" as const, () => "down" as const),
    new Promise<"slow">((r) => setTimeout(() => r("slow"), 4000)),
  ]);
  const body = { ok: db === "ok", mode: isDemoMode() ? "demo" : "live", database: db, ms: Date.now() - started };
  return NextResponse.json(body, { status: db === "down" ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}
