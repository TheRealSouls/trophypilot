import { PrismaClient } from "@prisma/client";

/**
 * Supabase's session pooler (port 5432) only lets 15 clients in at once, and
 * the build renders pages in several processes that each open their own pool.
 * So the app talks to the transaction pooler (port 6543) on the same host,
 * which shares a few real connections between many clients. DATABASE_URL
 * stays on 5432 because `prisma db push` needs a session connection.
 */
function databaseUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.hostname.endsWith(".pooler.supabase.com") && url.port === "5432") {
      url.port = "6543";
      url.searchParams.set("pgbouncer", "true");
      if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", "5");
    }
    return url.toString();
  } catch {
    return raw;
  }
}

/**
 * PsnPlayer.rareLists (the ultra rare tally, thousands of entries for big
 * libraries) is left out of every query unless one selects it by name, so
 * leaderboards and feeds never haul it around.
 */
const create = () => new PrismaClient({ datasourceUrl: databaseUrl(), omit: { psnPlayer: { rareLists: true } } });

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof create> };

export const prisma = globalForPrisma.prisma ?? create();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
