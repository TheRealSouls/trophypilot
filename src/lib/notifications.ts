import { prisma } from "./db";
import { blockedByMe } from "./blocks";
import { plainText } from "./rich-text";

/**
 * A member's notifications: replies to their forum threads, comments and
 * reactions on their updates and posts, tips and ratings on their guides, new
 * followers, the trophies they earned, and notices from staff (content a
 * moderator removed, with the reason).
 *
 * Only staff notices are stored (Notification). Everything else is read from
 * the tables it already lives in, newest first, so nothing extra is written
 * when someone reacts or comments. Each source is small and indexed by owner.
 */

export type NoticeKind = "reply" | "comment" | "reaction" | "tip" | "rating" | "follow" | "trophies" | "staff";
export type Person = { username: string; name: string; avatar: string | null; avatarUrl: string | null; avatarHue: number };
export type NoticeItem = {
  key: string;
  kind: NoticeKind;
  at: Date;
  who?: Person;
  /** The sentence after the name, or the whole line without one. */
  text: string;
  /** A short quote or detail under the line. */
  detail?: string;
  href?: string;
  /** For trophies: what was earned, by grade. */
  trophies?: { type: string; name: string }[];
  game?: { title: string; iconUrl: string | null; coverHue: number };
};

export const NOTICE_GROUPS = {
  all: "All",
  social: "Replies and comments",
  reactions: "Reactions",
  trophies: "Trophies",
  staff: "From staff",
} as const;
export type NoticeGroup = keyof typeof NOTICE_GROUPS;
export const groupOf = (k: NoticeKind): NoticeGroup =>
  k === "reaction" ? "reactions" : k === "trophies" ? "trophies" : k === "staff" ? "staff" : "social";

const PERSON = { username: true, avatar: true, avatarHue: true, psn: { select: { onlineId: true, avatarUrl: true } } } as const;
type PersonRow = { username: string; avatar: string | null; avatarHue: number; psn: { onlineId: string; avatarUrl: string | null } | null };
const person = (u: PersonRow): Person => ({ username: u.username, name: u.psn?.onlineId ?? u.username, avatar: u.avatar, avatarUrl: u.psn?.avatarUrl ?? null, avatarHue: u.avatarHue });
const quote = (s: string, n = 120) => {
  const t = plainText(s).replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

const TAKE = 25;

export async function notificationsFor(userId: string): Promise<NoticeItem[]> {
  const notMe = { not: userId };
  const [replies, comments, postReactions, tips, ratings, follows, earned, staff, myPosts, myComments, blocked] = await Promise.all([
    prisma.forumPost.findMany({
      where: { thread: { authorId: userId }, authorId: notMe },
      orderBy: { createdAt: "desc" },
      take: TAKE,
      select: { id: true, body: true, createdAt: true, threadId: true, thread: { select: { title: true } }, author: { select: { id: true, ...PERSON } } },
    }),
    prisma.postComment.findMany({
      where: { post: { authorId: userId }, authorId: notMe },
      orderBy: { createdAt: "desc" },
      take: TAKE,
      select: { id: true, body: true, createdAt: true, post: { select: { club: { select: { slug: true } } } }, author: { select: { id: true, ...PERSON } } },
    }),
    prisma.postReaction.findMany({
      where: { post: { authorId: userId }, userId: notMe },
      orderBy: { createdAt: "desc" },
      take: TAKE,
      select: { postId: true, emoji: true, createdAt: true, post: { select: { body: true, kind: true, club: { select: { slug: true } } } }, user: { select: { id: true, ...PERSON } } },
    }),
    prisma.tip.findMany({
      where: { guide: { authorId: userId }, authorId: notMe },
      orderBy: { createdAt: "desc" },
      take: TAKE,
      select: { id: true, body: true, createdAt: true, guide: { select: { slug: true, title: true } }, author: { select: { id: true, ...PERSON } } },
    }),
    prisma.guideRating.findMany({
      where: { guide: { authorId: userId }, userId: notMe },
      orderBy: { updatedAt: "desc" },
      take: TAKE,
      select: { stars: true, updatedAt: true, guide: { select: { slug: true, title: true } }, user: { select: { id: true, ...PERSON } } },
    }),
    prisma.follow.findMany({
      where: { followingId: userId },
      orderBy: { createdAt: "desc" },
      take: TAKE,
      select: { createdAt: true, follower: { select: { id: true, ...PERSON } } },
    }),
    prisma.userTrophy.findMany({
      where: { userId },
      orderBy: { earnedAt: "desc" },
      take: 60,
      select: { earnedAt: true, trophy: { select: { name: true, type: true, hidden: true, game: { select: { slug: true, title: true, iconUrl: true, coverHue: true } } } } },
    }),
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: TAKE }),
    // Their newest forum posts and update comments, for the reactions on them.
    prisma.forumPost.findMany({ where: { authorId: userId }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, threadId: true, body: true } }),
    prisma.postComment.findMany({ where: { authorId: userId }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, body: true } }),
    blockedByMe(userId),
  ]);

  const otherReactions =
    myPosts.length || myComments.length
      ? await prisma.reaction.findMany({
          where: {
            userId: notMe,
            OR: [
              ...(myPosts.length ? [{ targetType: "FORUM_POST", targetId: { in: myPosts.map((p) => p.id) } }] : []),
              ...(myComments.length ? [{ targetType: "COMMENT", targetId: { in: myComments.map((c) => c.id) } }] : []),
            ],
          },
          orderBy: { createdAt: "desc" },
          take: TAKE,
          select: { targetType: true, targetId: true, emoji: true, createdAt: true, user: { select: { id: true, ...PERSON } } },
        })
      : [];
  const postOf = new Map(myPosts.map((p) => [p.id, p]));
  const commentOf = new Map(myComments.map((c) => [c.id, c]));

  const items: NoticeItem[] = [];
  const hidden = (id: string | null | undefined) => !!id && blocked.has(id);

  for (const r of replies) {
    if (!r.author || hidden(r.author.id)) continue;
    items.push({ key: `reply:${r.id}`, kind: "reply", at: r.createdAt, who: person(r.author), text: `replied to your thread "${r.thread.title}"`, detail: quote(r.body), href: `/forums/thread/${r.threadId}#post-${r.id}` });
  }
  for (const c of comments) {
    if (hidden(c.author.id)) continue;
    items.push({ key: `comment:${c.id}`, kind: "comment", at: c.createdAt, who: person(c.author), text: "commented on your update", detail: quote(c.body), href: c.post.club ? `/clubs/${c.post.club.slug}` : "/community" });
  }
  for (const r of postReactions) {
    if (hidden(r.user.id)) continue;
    items.push({
      key: `preact:${r.postId}:${r.user.username}:${r.emoji}`,
      kind: "reaction",
      at: r.createdAt,
      who: person(r.user),
      text: `reacted ${r.emoji} to your ${r.post.kind === "PLATINUM" ? "platinum" : "update"}`,
      detail: r.post.kind === "PLATINUM" ? undefined : quote(r.post.body, 80),
      href: r.post.club ? `/clubs/${r.post.club.slug}` : "/community",
    });
  }
  for (const r of otherReactions) {
    if (hidden(r.user.id)) continue;
    const post = r.targetType === "FORUM_POST" ? postOf.get(r.targetId) : undefined;
    const comment = r.targetType === "COMMENT" ? commentOf.get(r.targetId) : undefined;
    items.push({
      key: `react:${r.targetType}:${r.targetId}:${r.user.username}:${r.emoji}`,
      kind: "reaction",
      at: r.createdAt,
      who: person(r.user),
      text: `reacted ${r.emoji} to your ${post ? "forum post" : "comment"}`,
      detail: quote((post ?? comment)?.body ?? "", 80) || undefined,
      href: post ? `/forums/thread/${post.threadId}#post-${post.id}` : "/community",
    });
  }
  for (const t of tips) {
    if (hidden(t.author.id)) continue;
    items.push({ key: `tip:${t.id}`, kind: "tip", at: t.createdAt, who: person(t.author), text: `left a tip on your guide "${t.guide?.title}"`, detail: quote(t.body), href: t.guide ? `/guides/${t.guide.slug}` : undefined });
  }
  for (const r of ratings) {
    if (hidden(r.user.id)) continue;
    items.push({ key: `rating:${r.guide.slug}:${r.user.username}`, kind: "rating", at: r.updatedAt, who: person(r.user), text: `rated your guide "${r.guide.title}" ${r.stars} out of 5`, href: `/guides/${r.guide.slug}` });
  }
  for (const f of follows) {
    if (hidden(f.follower.id)) continue;
    items.push({ key: `follow:${f.follower.username}`, kind: "follow", at: f.createdAt, who: person(f.follower), text: "started following you", href: `/u/${f.follower.username}` });
  }
  for (const s of staff) {
    items.push({ key: `staff:${s.id}`, kind: "staff", at: s.createdAt, text: s.title, detail: s.body ?? undefined, href: s.url ?? undefined });
  }

  // Trophies: one line per game per day, as a sync brings them in.
  const days = new Map<string, NoticeItem>();
  for (const e of earned) {
    const g = e.trophy.game;
    const key = `trophies:${g.slug}:${e.earnedAt.toISOString().slice(0, 10)}`;
    const item = days.get(key) ?? {
      key,
      kind: "trophies" as const,
      at: e.earnedAt,
      text: "",
      href: `/games/${g.slug}`,
      trophies: [],
      game: { title: g.title, iconUrl: g.iconUrl, coverHue: g.coverHue },
    };
    item.trophies!.push({ type: e.trophy.type, name: e.trophy.name });
    days.set(key, item);
  }
  for (const item of days.values()) {
    const n = item.trophies!.length;
    item.text = `You earned ${n} troph${n === 1 ? "y" : "ies"} in ${item.game!.title}`;
    items.push(item);
  }

  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 80);
}

/**
 * Unread counts, kept apart from the shared cache (which is small and holds the expensive boards) in
 * their own little map: per member, for two minutes.
 */
const g = globalThis as unknown as { __tpUnread?: Map<string, { n: number; at: number }> };
const unread = (g.__tpUnread ??= new Map());

/** How many notifications (not counting your own trophies) are newer than the member last looked. */
export async function unreadNotifications(user: { id: string; notificationsSeenAt: Date | null; createdAt: Date }) {
  const hit = unread.get(user.id);
  if (hit && Date.now() - hit.at < 2 * 60_000) return hit.n;
  const since = user.notificationsSeenAt ?? user.createdAt;
  const n = (await notificationsFor(user.id)).filter((i) => i.kind !== "trophies" && i.at > since).length;
  if (unread.size > 2000) unread.clear();
  unread.set(user.id, { n, at: Date.now() });
  return n;
}

/** Marks everything read, after the page has shown which items were new. */
export async function markNotificationsSeen(userId: string) {
  await prisma.user.update({ where: { id: userId }, data: { notificationsSeenAt: new Date() } });
  unread.delete(userId);
}
