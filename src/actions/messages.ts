"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { verifyFirst } from "@/lib/email";
import { formText, hateSpeechError } from "@/lib/moderation";
import { addMessage, directConversation, GROUP_MAX, MESSAGE_MAX, whyCantMessage } from "@/lib/community";
import { rateLimit } from "@/lib/rate-limit";
import type { FormState } from "./auth";

function cleanBody(fd: FormData) {
  const body = String(fd.get("body") ?? "").trim();
  if (body.length < 1) return { error: "Write a message first." };
  if (body.length > MESSAGE_MAX) return { error: `Keep messages under ${MESSAGE_MAX.toLocaleString("en-GB")} characters.` };
  return { body };
}

const findMember = (handle: string) =>
  prisma.user.findFirst({
    where: { OR: [{ username: handle.toLowerCase() }, { psn: { onlineId: { equals: handle, mode: "insensitive" } } }] },
    select: { id: true, username: true, allowMessages: true },
  });

/**
 * Starts a conversation from the Messages page. One recipient opens (or
 * reuses) a private conversation; several make a group chat.
 */
export async function startConversation(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireUser("/messages");
  const unverified = verifyFirst(me);
  if (unverified) return { error: unverified };
  const hate = hateSpeechError(...formText(fd));
  if (hate) return { error: hate };
  if (!(await rateLimit("message-start", 10, 10 * 60_000, me.id))) return { error: "You've started a lot of conversations just now. Try again in a few minutes." };
  const msg = cleanBody(fd);
  if ("error" in msg) return msg;

  const handles = [...new Set(String(fd.get("to") ?? "").split(/[\s,]+/).map((h) => h.trim()).filter(Boolean))];
  if (!handles.length) return { error: "Say who it's for: a username or PSN ID." };
  if (handles.length > GROUP_MAX - 1) return { error: `A group chat can have up to ${GROUP_MAX} people.` };

  const recipients = [];
  for (const h of handles) {
    const u = await findMember(h);
    if (!u) return { error: `No member called "${h}".` };
    const blocked = await whyCantMessage(me.id, u);
    if (blocked) return { error: blocked };
    recipients.push(u);
  }

  let conversationId: string;
  if (recipients.length === 1) {
    conversationId = await directConversation(me.id, recipients[0].id);
  } else {
    const title = String(fd.get("title") ?? "").trim().slice(0, 60) || null;
    conversationId = (
      await prisma.conversation.create({
        data: { isGroup: true, title, members: { create: [{ userId: me.id }, ...recipients.map((r) => ({ userId: r.id }))] } },
        select: { id: true },
      })
    ).id;
  }
  await addMessage(conversationId, me.id, msg.body);
  revalidatePath("/messages", "layout");
  redirect(`/messages/${conversationId}`);
}

/** A message in a conversation the sender already belongs to. */
export async function sendMessage(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireUser("/messages");
  const unverified = verifyFirst(me);
  if (unverified) return { error: unverified };
  const hate = hateSpeechError(...formText(fd));
  if (hate) return { error: hate };
  if (!(await rateLimit("message", 30, 60_000, me.id))) return { error: "Slow down a little and try again in a minute." };
  const msg = cleanBody(fd);
  if ("error" in msg) return msg;
  const conversationId = String(fd.get("conversationId"));
  const member = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId: me.id } },
    include: { conversation: { include: { members: { include: { user: { select: { id: true, username: true, allowMessages: true } } } } } } },
  });
  if (!member) return { error: "You're not in this conversation." };
  if (member.conversation.system) return { error: "This is a notice from TrophyPilot, so it can't be replied to." };
  // In a one-to-one conversation the other person may have closed their messages since.
  if (!member.conversation.isGroup) {
    const other = member.conversation.members.find((m) => m.userId !== me.id)?.user;
    if (!other) return { error: "The other person has left this conversation." };
    const blocked = await whyCantMessage(me.id, other);
    if (blocked) return { error: blocked };
  }
  await addMessage(conversationId, me.id, msg.body);
  revalidatePath("/messages", "layout");
  return null;
}

/** Sends something (a guide link, say) straight to one member, from anywhere on the site. */
export async function sendDirect(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireUser();
  const unverified = verifyFirst(me);
  if (unverified) return { error: unverified };
  const hate = hateSpeechError(...formText(fd));
  if (hate) return { error: hate };
  if (!(await rateLimit("message", 30, 60_000, me.id))) return { error: "Slow down a little and try again in a minute." };
  const msg = cleanBody(fd);
  if ("error" in msg) return msg;
  const recipient = await prisma.user.findUnique({
    where: { id: String(fd.get("recipientId")) },
    select: { id: true, username: true, allowMessages: true },
  });
  if (!recipient) return { error: "That member doesn't exist any more." };
  const blocked = await whyCantMessage(me.id, recipient);
  if (blocked) return { error: blocked };
  await addMessage(await directConversation(me.id, recipient.id), me.id, msg.body);
  revalidatePath("/messages", "layout");
  return { ok: `Sent to ${recipient.username}.` };
}

/** Leaves a conversation. It's deleted once nobody is left in it. */
export async function leaveConversation(fd: FormData) {
  const me = await requireUser("/messages");
  const conversationId = String(fd.get("conversationId"));
  await prisma.conversationMember.deleteMany({ where: { conversationId, userId: me.id } });
  if ((await prisma.conversationMember.count({ where: { conversationId } })) === 0) {
    await prisma.conversation.deleteMany({ where: { id: conversationId } });
  }
  revalidatePath("/messages", "layout");
  redirect("/messages");
}
