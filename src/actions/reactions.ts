"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { blockBetween } from "@/lib/blocks";
import { verifyFirst } from "@/lib/email";
import { clubActive } from "@/lib/idle-clubs";
import { rateLimit } from "@/lib/rate-limit";
import { isReactionEmoji, type ReactionKind } from "@/lib/reactions";

/**
 * Turns one reaction on or off. The browser says which it wants (rather than
 * "toggle"), so a double tap or a slow connection can't add it twice or undo
 * it by accident. The page isn't re-rendered: ReactionBar already shows it.
 */
export async function setReaction(kind: ReactionKind, id: string, emoji: string, on: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Log in to react." };
  const blocked = verifyFirst(me);
  if (blocked) return { ok: false, error: blocked };
  if (!isReactionEmoji(emoji) || !["POST", "COMMENT", "FORUM_POST"].includes(kind)) return { ok: false, error: "That reaction isn't available." };
  if (!(await rateLimit("reaction", 90, 60_000, me.id))) return { ok: false, error: "Slow down a little." };

  // Who wrote it (to respect blocks), and the club an update or comment belongs to (reactions count as club activity).
  const target =
    kind === "POST"
      ? await prisma.post.findUnique({ where: { id }, select: { authorId: true, clubId: true } })
      : kind === "COMMENT"
        ? await prisma.postComment.findUnique({ where: { id }, select: { authorId: true, post: { select: { clubId: true } } } }).then((c) => (c ? { authorId: c.authorId, clubId: c.post.clubId } : null))
        : await prisma.forumPost.findUnique({ where: { id }, select: { authorId: true } }).then((p) => (p ? { authorId: p.authorId, clubId: null } : null));
  if (!target) return { ok: false, error: "That was deleted." };
  if (on && target.authorId && (await blockBetween(me.id, target.authorId))) return { ok: false, error: "You can't react to this." };

  if (kind === "POST") {
    const key = { postId: id, userId: me.id, emoji };
    if (on) await prisma.postReaction.upsert({ where: { postId_userId_emoji: key }, create: key, update: {} });
    else await prisma.postReaction.deleteMany({ where: key });
  } else {
    const key = { targetType: kind, targetId: id, userId: me.id, emoji };
    if (on) await prisma.reaction.upsert({ where: { targetType_targetId_userId_emoji: key }, create: key, update: {} });
    else await prisma.reaction.deleteMany({ where: key });
  }
  if (on && target.clubId) await clubActive(target.clubId);
  return { ok: true };
}
