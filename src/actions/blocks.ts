"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

/**
 * Blocks or unblocks a member. Blocking also ends any friendship, friend
 * request and follow between the two of you, in both directions.
 */
export async function toggleBlock(fd: FormData) {
  const me = await requireUser();
  const target = await prisma.user.findUnique({ where: { id: String(fd.get("userId")) }, select: { id: true, username: true } });
  if (!target || target.id === me.id) return;
  const key = { blockerId_blockedId: { blockerId: me.id, blockedId: target.id } };
  if (fd.get("block") === "0") {
    await prisma.block.deleteMany({ where: key.blockerId_blockedId });
  } else {
    const pair = (a: string, b: string) => [
      { requesterId: a, addresseeId: b },
      { requesterId: b, addresseeId: a },
    ];
    await prisma.$transaction([
      prisma.block.upsert({ where: key, create: key.blockerId_blockedId, update: {} }),
      prisma.friendship.deleteMany({ where: { OR: pair(me.id, target.id) } }),
      prisma.follow.deleteMany({
        where: {
          OR: [
            { followerId: me.id, followingId: target.id },
            { followerId: target.id, followingId: me.id },
          ],
        },
      }),
    ]);
  }
  revalidatePath(`/u/${target.username}`);
  revalidatePath("/messages", "layout");
  revalidatePath("/settings");
  revalidatePath("/friends");
}
