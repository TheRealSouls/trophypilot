import { PrismaClient } from "@prisma/client";

/**
 * PsnPlayer.rareLists (the ultra rare tally, thousands of entries for big
 * libraries) is left out of every query unless one selects it by name, so
 * leaderboards and feeds never haul it around.
 */
const create = () => new PrismaClient({ omit: { psnPlayer: { rareLists: true } } });

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof create> };

export const prisma = globalForPrisma.prisma ?? create();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
