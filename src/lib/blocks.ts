import { prisma } from "./db";

/**
 * Blocking. A block works both ways: neither member can message, friend or
 * follow the other. The blocked member isn't told; they just see that the
 * other person isn't accepting messages.
 */

/** "YOU" when the viewer blocked them, "THEM" when they blocked the viewer, else null. */
export async function blockBetween(viewerId: string, otherId: string): Promise<"YOU" | "THEM" | null> {
  const rows = await prisma.block.findMany({
    where: {
      OR: [
        { blockerId: viewerId, blockedId: otherId },
        { blockerId: otherId, blockedId: viewerId },
      ],
    },
    select: { blockerId: true },
  });
  if (rows.some((r) => r.blockerId === viewerId)) return "YOU";
  return rows.length ? "THEM" : null;
}

/** Everyone the member has blocked, for hiding their messages in group chats. */
export async function blockedByMe(userId: string) {
  const rows = await prisma.block.findMany({ where: { blockerId: userId }, select: { blockedId: true } });
  return new Set(rows.map((r) => r.blockedId));
}
