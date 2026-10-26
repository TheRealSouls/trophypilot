import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { friendState } from "./social";
import { blockBetween } from "./blocks";

/**
 * Follows, private messages and community reputation.
 */

export const POST_MAX = 1000;
/** The reactions members can put on club and community updates. */
export const REACTIONS = [
  ["👍", "thumbs up"],
  ["❤️", "heart"],
  ["😂", "laughing"],
  ["🏆", "trophy"],
  ["🔥", "fire"],
  ["😮", "wow"],
] as const;
export const MESSAGE_MAX = 2000;
/** Most people a group chat can hold, the starter included. */
export const GROUP_MAX = 20;

// ─── Messages ────────────────────────────────────────────────────────────────

/** Null if the sender may message this member, otherwise the reason they can't. */
export async function whyCantMessage(senderId: string, recipient: { id: string; username: string; allowMessages: string }) {
  if (recipient.id === senderId) return "You can't message yourself.";
  const block = await blockBetween(senderId, recipient.id);
  if (block === "YOU") return `You've blocked ${recipient.username}. Unblock them in Settings to message them.`;
  if (block === "THEM" || recipient.allowMessages === "NOBODY") return `${recipient.username} isn't accepting messages.`;
  if (recipient.allowMessages === "FRIENDS") {
    const [friends, follows] = await Promise.all([
      friendState(senderId, recipient.id),
      prisma.follow.findUnique({ where: { followerId_followingId: { followerId: recipient.id, followingId: senderId } } }),
    ]);
    if (friends !== "FRIENDS" && !follows) return `${recipient.username} only accepts messages from friends and people they follow.`;
  }
  return null;
}

/** The one-to-one conversation between two members, created on first use. */
export async function directConversation(a: string, b: string) {
  const existing = await prisma.conversation.findFirst({
    where: { isGroup: false, system: false, AND: [{ members: { some: { userId: a } } }, { members: { some: { userId: b } } }] },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.conversation.create({
    data: { isGroup: false, members: { create: [{ userId: a }, { userId: b }] } },
    select: { id: true },
  });
  return created.id;
}

/** Adds a message and marks the conversation read for its author. */
export async function addMessage(conversationId: string, authorId: string, body: string) {
  const now = new Date();
  await prisma.$transaction([
    prisma.message.create({ data: { conversationId, authorId, body, createdAt: now } }),
    prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: now } }),
    prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId: authorId } },
      data: { lastReadAt: now },
    }),
  ]);
}

/**
 * A notice from TrophyPilot in the member's Messages (it counts as unread
 * like any message). Each member has one TrophyPilot conversation.
 */
export async function sendNotice(userId: string, body: string) {
  const now = new Date();
  const existing = await prisma.conversation.findFirst({ where: { system: true, members: { some: { userId } } }, select: { id: true } });
  const conversationId =
    existing?.id ??
    (
      await prisma.conversation.create({
        // Read up to a moment ago, so the notice shows as new.
        data: { system: true, title: "TrophyPilot", members: { create: { userId, lastReadAt: new Date(now.getTime() - 1000) } } },
        select: { id: true },
      })
    ).id;
  await prisma.$transaction([
    prisma.message.create({ data: { conversationId, authorId: null, body, createdAt: now } }),
    prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: now } }),
  ]);
}

/** Conversations with something newer than the member last read. */
export async function unreadConversations(userId: string) {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM "ConversationMember" m
    JOIN "Conversation" c ON c.id = m."conversationId"
    WHERE m."userId" = ${userId} AND c."lastMessageAt" > m."lastReadAt"`;
  return Number(rows[0]?.n ?? 0);
}

// ─── Reputation ──────────────────────────────────────────────────────────────

const POINTS = { thread: 5, reply: 2, guide: 25, tip: 3, tipUpvote: 2, update: 1, session: 3 } as const;

export const RANKS = [
  { min: 1000, name: "Legend" },
  { min: 300, name: "Veteran" },
  { min: 100, name: "Regular" },
  { min: 25, name: "Member" },
  { min: 0, name: "Newcomer" },
] as const;

type Counts = { threads: number; replies: number; guides: number; tips: number; tipUpvotes: number; updates: number; sessions: number };

const BADGES: { name: string; hint: string; earned: (c: Counts) => boolean }[] = [
  { name: "First post", hint: "Posted on the forums", earned: (c) => c.threads + c.replies >= 1 },
  { name: "Conversation starter", hint: "Started 5 forum threads", earned: (c) => c.threads >= 5 },
  { name: "Forum regular", hint: "Made 50 forum posts", earned: (c) => c.threads + c.replies >= 50 },
  { name: "Forum veteran", hint: "Made 250 forum posts", earned: (c) => c.threads + c.replies >= 250 },
  { name: "Guide writer", hint: "Published a guide", earned: (c) => c.guides >= 1 },
  { name: "Guide master", hint: "Published 5 guides", earned: (c) => c.guides >= 5 },
  { name: "Tipster", hint: "Shared 10 tips", earned: (c) => c.tips >= 10 },
  { name: "Helpful", hint: "Tips upvoted 10 times", earned: (c) => c.tipUpvotes >= 10 },
  { name: "Session host", hint: "Hosted 5 sessions", earned: (c) => c.sessions >= 5 },
  { name: "Town crier", hint: "Posted 25 community updates", earned: (c) => c.updates >= 25 },
];

export type Reputation = { points: number; rank: string; badges: { name: string; hint: string }[]; counts: Counts };

function score(c: Counts): Reputation {
  const points =
    c.threads * POINTS.thread +
    c.replies * POINTS.reply +
    c.guides * POINTS.guide +
    c.tips * POINTS.tip +
    c.tipUpvotes * POINTS.tipUpvote +
    c.updates * POINTS.update +
    c.sessions * POINTS.session;
  return {
    points,
    rank: RANKS.find((r) => points >= r.min)!.name,
    badges: BADGES.filter((b) => b.earned(c)).map(({ name, hint }) => ({ name, hint })),
    counts: c,
  };
}

/**
 * Reputation for several members at once (a forum page shows one per
 * author). Points come from what a member contributes: threads, replies,
 * guides, tips and the upvotes on them, community updates and sessions
 * hosted. Nothing is stored; it's counted from the content itself, so
 * deleting content takes its points away.
 */
export async function reputations(userIds: string[]): Promise<Map<string, Reputation>> {
  const ids = [...new Set(userIds)];
  const out = new Map<string, Reputation>();
  if (!ids.length) return out;
  const where = { authorId: { in: ids } };
  const [threads, posts, guides, tips, updates, sessions, upvotes] = await Promise.all([
    prisma.forumThread.groupBy({ by: ["authorId"], where, _count: { _all: true } }),
    prisma.forumPost.groupBy({ by: ["authorId"], where, _count: { _all: true } }),
    prisma.guide.groupBy({ by: ["authorId"], where: { ...where, status: "PUBLISHED" }, _count: { _all: true } }),
    prisma.tip.groupBy({ by: ["authorId"], where, _count: { _all: true } }),
    prisma.post.groupBy({ by: ["authorId"], where, _count: { _all: true } }),
    prisma.session.groupBy({ by: ["hostId"], where: { hostId: { in: ids } }, _count: { _all: true } }),
    prisma.$queryRaw<{ authorId: string; n: bigint }[]>`
      SELECT t."authorId", count(*) AS n FROM "TipVote" v JOIN "Tip" t ON t.id = v."tipId"
      WHERE v.value = 1 AND t."authorId" IN (${Prisma.join(ids)}) GROUP BY t."authorId"`,
  ]);
  const get = (rows: { authorId?: string | null; hostId?: string; _count: { _all: number } }[], id: string) =>
    rows.find((r) => (r.authorId ?? r.hostId) === id)?._count._all ?? 0;
  for (const id of ids) {
    const t = get(threads, id);
    out.set(
      id,
      score({
        threads: t,
        // Every thread's opening post is a forum post too; count replies separately.
        replies: Math.max(0, get(posts, id) - t),
        guides: get(guides, id),
        tips: get(tips, id),
        tipUpvotes: Number(upvotes.find((u) => u.authorId === id)?.n ?? 0),
        updates: get(updates, id),
        sessions: get(sessions, id),
      }),
    );
  }
  return out;
}

export async function reputationOf(userId: string) {
  return (await reputations([userId])).get(userId)!;
}

/** What a conversation is called for one of its members. */
export function conversationName(
  c: { title: string | null; isGroup: boolean; system?: boolean; members: { userId: string; user: { username: string; psn: { onlineId: string } | null } }[] },
  viewerId: string,
) {
  if (c.system) return "TrophyPilot";
  const others = c.members.filter((m) => m.userId !== viewerId).map((m) => m.user.psn?.onlineId ?? m.user.username);
  if (c.isGroup) return c.title || (others.length ? others.slice(0, 3).join(", ") + (others.length > 3 ? ` +${others.length - 3}` : "") : "Group chat");
  return others[0] ?? "Member who left";
}
