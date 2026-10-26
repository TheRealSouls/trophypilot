"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { verifyFirst } from "@/lib/email";
import { blockBetween } from "@/lib/blocks";
import type { FormState } from "./auth";

export async function sendFriendRequest(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireUser();
  const unverified = verifyFirst(me);
  if (unverified) return { error: unverified };
  const handle = String(fd.get("username") ?? "").trim();
  if (!handle) return { error: "Enter a username or PSN ID." };

  const target = await prisma.user.findFirst({
    where: { OR: [{ username: handle.toLowerCase() }, { psn: { onlineId: handle } }] },
  });
  if (!target) return { error: `No member called "${handle}".` };
  if (target.id === me.id) return { error: "You can't friend yourself (we checked)." };
  const block = await blockBetween(me.id, target.id);
  if (block === "YOU") return { error: `You've blocked ${target.username}. Unblock them in Settings first.` };
  if (block === "THEM") return { error: `${target.username} isn't taking friend requests.` };

  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: me.id, addresseeId: target.id },
        { requesterId: target.id, addresseeId: me.id },
      ],
    },
  });
  if (existing?.status === "ACCEPTED") return { error: `You're already friends with ${target.username}.` };
  if (existing && existing.requesterId === me.id) return { error: "Request already sent." };
  if (existing) {
    // They already asked us, so sending one back means accepting.
    await prisma.friendship.update({ where: { id: existing.id }, data: { status: "ACCEPTED" } });
    revalidatePath("/friends");
    return { ok: `You and ${target.username} are now friends.` };
  }

  await prisma.friendship.create({ data: { requesterId: me.id, addresseeId: target.id } });
  revalidatePath("/friends");
  revalidatePath(`/u/${target.username}`);
  return { ok: `Friend request sent to ${target.username}.` };
}

export async function addFriend(fd: FormData) {
  await sendFriendRequest(null, fd);
}

export async function respondToRequest(fd: FormData) {
  const me = await requireUser();
  const id = String(fd.get("id"));
  const accept = fd.get("accept") === "1";
  const req = await prisma.friendship.findUnique({ where: { id } });
  if (!req || req.addresseeId !== me.id || req.status !== "PENDING") return;
  if (accept) await prisma.friendship.update({ where: { id }, data: { status: "ACCEPTED" } });
  else await prisma.friendship.delete({ where: { id } });
  revalidatePath("/friends");
  revalidatePath("/", "layout");
}

export async function removeFriend(fd: FormData) {
  const me = await requireUser();
  const other = String(fd.get("userId"));
  await prisma.friendship.deleteMany({
    where: {
      OR: [
        { requesterId: me.id, addresseeId: other },
        { requesterId: other, addresseeId: me.id },
      ],
    },
  });
  revalidatePath("/friends");
  revalidatePath("/", "layout");
}
