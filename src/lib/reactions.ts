import { prisma } from "./db";
import { REACTIONS } from "./reaction-emojis";

/**
 * Emoji reactions on updates (PostReaction), comments under them and forum
 * replies (Reaction). The bar under each shows the counts and which ones are
 * the viewer's own (ReactionBar).
 */
export type ReactionKind = "POST" | "COMMENT" | "FORUM_POST";
export type ReactionCount = { emoji: string; n: number; mine: boolean };

export const isReactionEmoji = (e: string) => REACTIONS.some(([x]) => x === e);

/** Counts per emoji for each id, in REACTIONS order. */
export async function reactionCounts(kind: ReactionKind, ids: string[], viewerId: string | null): Promise<Map<string, ReactionCount[]>> {
  const out = new Map<string, ReactionCount[]>();
  if (!ids.length) return out;
  const rows =
    kind === "POST"
      ? await prisma.postReaction.findMany({ where: { postId: { in: ids } }, select: { postId: true, emoji: true, userId: true } }).then((r) => r.map((x) => ({ id: x.postId, emoji: x.emoji, userId: x.userId })))
      : await prisma.reaction.findMany({ where: { targetType: kind, targetId: { in: ids } }, select: { targetId: true, emoji: true, userId: true } }).then((r) => r.map((x) => ({ id: x.targetId, emoji: x.emoji, userId: x.userId })));
  for (const id of ids) {
    const mine = rows.filter((r) => r.id === id);
    out.set(
      id,
      REACTIONS.map(([emoji]) => ({ emoji, n: mine.filter((r) => r.emoji === emoji).length, mine: !!viewerId && mine.some((r) => r.emoji === emoji && r.userId === viewerId) })),
    );
  }
  return out;
}
