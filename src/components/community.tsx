import { isStaff } from "@/lib/roles";
import Link from "next/link";
import { RichText } from "./RichText";
import { ReportButton } from "./ReportButton";
import clsx from "clsx";
import { cardClass } from "@/lib/profile-themes";
import { ProfileCardArt } from "./ProfileCardArt";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getFriendIds } from "@/lib/social";
import { timeAgo } from "@/lib/utils";
import { deleteComment, deletePost } from "@/actions/social";
import { CommentForm } from "./community-forms";
import { REACTIONS } from "@/lib/reaction-emojis";
import { reactionCounts, type ReactionCount } from "@/lib/reactions";
import { ReactionBar } from "./ReactionBar";
import { GameArt } from "./art";
import { TrophyIcon } from "./TrophyIcon";
import { ConfirmButton } from "./client";
import { Avatar } from "./ui";

/**
 * Community updates: short posts on the community page and in clubs.
 */

const postInclude = {
  author: { select: { id: true, username: true, avatarHue: true, avatar: true, profileCard: true, psn: { select: { onlineId: true, avatarUrl: true } } } },
  club: { select: { name: true, slug: true } },
  // The game of an automatic platinum post.
  game: { select: { slug: true, title: true, iconUrl: true, coverHue: true } },
  reactions: { select: { emoji: true, userId: true } },
  // The newest replies, shown oldest first under the update.
  comments: {
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, body: true, createdAt: true, author: { select: { id: true, username: true, avatarHue: true, avatar: true, psn: { select: { onlineId: true, avatarUrl: true } } } } },
  },
  _count: { select: { comments: true } },
} satisfies Prisma.PostInclude;

export type FeedScope = "everyone" | "following" | "clubs";

/** Posts for the community page. "following" is the viewer, their friends and the people they follow. */
export async function loadFeed({ scope, viewerId, clubId, take = 40 }: { scope: FeedScope; viewerId: string | null; clubId?: string; take?: number }) {
  let where: Prisma.PostWhereInput = {};
  if (clubId) where = { clubId };
  else if (scope === "following" && viewerId) {
    const [friends, follows] = await Promise.all([
      getFriendIds(viewerId),
      prisma.follow.findMany({ where: { followerId: viewerId }, select: { followingId: true } }),
    ]);
    where = { authorId: { in: [...new Set([viewerId, ...friends, ...follows.map((f) => f.followingId)])] } };
  } else if (scope === "clubs" && viewerId) {
    where = { club: { members: { some: { userId: viewerId } } } };
  }
  return prisma.post.findMany({ where, orderBy: { createdAt: "desc" }, take, include: postInclude });
}

type FeedPost = Awaited<ReturnType<typeof loadFeed>>[number];

/** An update's reactions as counts per emoji, for ReactionBar. */
const postCounts = (p: FeedPost, viewerId: string | null): ReactionCount[] =>
  REACTIONS.map(([emoji]) => ({
    emoji,
    n: p.reactions.filter((r) => r.emoji === emoji).length,
    mine: !!viewerId && p.reactions.some((r) => r.emoji === emoji && r.userId === viewerId),
  }));

export async function PostList({ posts, viewer, empty }: { posts: FeedPost[]; viewer: { id: string; role: string } | null; empty: string }) {
  if (!posts.length) return <p className="card p-5 text-sm text-muted">{empty}</p>;
  const commentReactions = await reactionCounts("COMMENT", posts.flatMap((p) => p.comments.map((c) => c.id)), viewer?.id ?? null);
  return (
    <ol className="space-y-3">
      {posts.map((p) => {
        const name = p.author.psn?.onlineId ?? p.author.username;
        const canDelete = viewer && (viewer.id === p.author.id || isStaff(viewer));
        return (
          // Each update wears its author's profile card theme.
          <li key={p.id} className={clsx("card relative flex gap-3 overflow-hidden p-4", cardClass(p.author.profileCard))}>
            <ProfileCardArt card={p.author.profileCard} part="body" />
            <Avatar name={name} hue={p.author.avatarHue} url={p.author.psn?.avatarUrl} avatar={p.author.avatar} size={40} className="relative" />
            <div className="relative min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Link href={`/u/${p.author.username}`} className="font-semibold hover:underline hover:underline-offset-4">
                  {name}
                </Link>
                {p.club && (
                  <Link href={`/clubs/${p.club.slug}`} className="chip hover:text-text">
                    {p.club.name}
                  </Link>
                )}
                <span className="text-xs text-muted">{timeAgo(p.createdAt)}</span>
                <span className="ml-auto" />
                <ReportButton type="POST" id={p.id} authorId={p.author.id} what={`update by ${name}`} />
                {canDelete && (
                  <form action={deletePost}>
                    <input type="hidden" name="postId" value={p.id} />
                    <ConfirmButton message="Delete this update?" className="text-xs text-muted hover:text-bad">
                      Delete
                    </ConfirmButton>
                  </form>
                )}
              </div>
              {p.kind === "PLATINUM" && p.game && (
                <Link href={`/games/${p.game.slug}`} className="mt-2 flex items-center gap-3 rounded-lg border border-plat/40 bg-plat/5 p-2.5 hover:border-plat">
                  <GameArt title={p.game.title} hue={p.game.coverHue} iconUrl={p.game.iconUrl} size="sm" className="w-12" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold uppercase tracking-wider text-plat">Platinum earned</span>
                    <span className="block truncate font-semibold">{p.game.title}</span>
                  </span>
                  <TrophyIcon type="PLATINUM" size={28} />
                </Link>
              )}
              {p.kind !== "PLATINUM" && <RichText text={p.body} className="mt-1" />}
              <ReactionBar kind="POST" id={p.id} initial={postCounts(p, viewer?.id ?? null)} signedIn={!!viewer} />
              <Comments post={p} viewer={viewer} reactions={commentReactions} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Replies under an update, and the box to add one. */
function Comments({ post, viewer, reactions }: { post: FeedPost; viewer: { id: string; role: string } | null; reactions: Map<string, ReactionCount[]> }) {
  const comments = [...post.comments].reverse();
  if (!comments.length && !viewer) return null;
  return (
    <div className="mt-3 border-t border-line pt-2">
      {post._count.comments > comments.length && (
        <p className="mb-1 text-xs text-muted">Showing the newest {comments.length} of {post._count.comments} comments.</p>
      )}
      {comments.length > 0 && (
        <ul className="space-y-2" aria-label="Comments">
          {comments.map((c) => {
            const name = c.author.psn?.onlineId ?? c.author.username;
            const canDelete = viewer && (viewer.id === c.author.id || viewer.id === post.author.id || isStaff(viewer));
            return (
              <li key={c.id} className="flex gap-2 text-sm">
                <Avatar name={name} hue={c.author.avatarHue} url={c.author.psn?.avatarUrl} avatar={c.author.avatar} size={24} />
                <div className="min-w-0 flex-1 rounded-lg bg-surface-2 px-2.5 py-1.5">
                  <div className="flex flex-wrap items-baseline gap-2 text-xs">
                    <Link href={`/u/${c.author.username}`} className="font-semibold text-text hover:underline hover:underline-offset-2">
                      {name}
                    </Link>
                    <span className="text-muted">{timeAgo(c.createdAt)}</span>
                    <span className="ml-auto" />
                    <ReportButton type="POST_COMMENT" id={c.id} authorId={c.author.id} what={`comment by ${name}`} />
                    {canDelete && (
                      <form action={deleteComment}>
                        <input type="hidden" name="commentId" value={c.id} />
                        <ConfirmButton message="Delete this comment?" className="text-muted hover:text-bad">
                          Delete
                        </ConfirmButton>
                      </form>
                    )}
                  </div>
                  <p className="whitespace-pre-line break-words">{c.body}</p>
                  <ReactionBar kind="COMMENT" id={c.id} initial={reactions.get(c.id) ?? []} signedIn={!!viewer} small />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {viewer && <CommentForm postId={post.id} />}
    </div>
  );
}
