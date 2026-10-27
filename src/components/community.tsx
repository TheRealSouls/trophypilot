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
import { deleteComment, deletePost, toggleReaction } from "@/actions/social";
import { CommentForm } from "./community-forms";
import { REACTIONS } from "@/lib/community";
import { ConfirmButton } from "./client";
import { Avatar } from "./ui";

/**
 * Community updates: short posts on the community page and in clubs.
 */

const postInclude = {
  author: { select: { id: true, username: true, avatarHue: true, avatar: true, profileCard: true, psn: { select: { onlineId: true, avatarUrl: true } } } },
  club: { select: { name: true, slug: true } },
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

export function PostList({ posts, viewer, empty }: { posts: FeedPost[]; viewer: { id: string; role: string } | null; empty: string }) {
  if (!posts.length) return <p className="card p-5 text-sm text-muted">{empty}</p>;
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
              <RichText text={p.body} className="mt-1" />
              <Reactions postId={p.id} reactions={p.reactions} viewerId={viewer?.id ?? null} />
              <Comments post={p} viewer={viewer} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Replies under an update, and the box to add one. */
function Comments({ post, viewer }: { post: FeedPost; viewer: { id: string; role: string } | null }) {
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

/**
 * Emoji reactions under an update: the ones used so far with their counts
 * (yours highlighted, click to take it back), and a React menu with the rest.
 * Plain forms, so they work before the page's scripts load.
 */
function Reactions({ postId, reactions, viewerId }: { postId: string; reactions: { emoji: string; userId: string }[]; viewerId: string | null }) {
  const counts = REACTIONS.map(([emoji, name]) => ({
    emoji,
    name,
    n: reactions.filter((r) => r.emoji === emoji).length,
    mine: !!viewerId && reactions.some((r) => r.emoji === emoji && r.userId === viewerId),
  }));
  const used = counts.filter((c) => c.n > 0);
  if (!viewerId && !used.length) return null;
  const button = (c: (typeof counts)[number], compact: boolean) => (
    <form key={c.emoji} action={toggleReaction}>
      <input type="hidden" name="postId" value={postId} />
      <input type="hidden" name="emoji" value={c.emoji} />
      <button
        type="submit"
        disabled={!viewerId}
        aria-pressed={c.mine}
        aria-label={`${c.name}, ${c.n} reaction${c.n === 1 ? "" : "s"}${c.mine ? ", including yours" : ""}`}
        title={c.name}
        className={clsx(
          "inline-flex items-center gap-1 rounded-full border text-sm disabled:cursor-default",
          compact ? "h-9 w-9 justify-center border-transparent hover:bg-surface-2" : "h-7 px-2",
          !compact && (c.mine ? "border-accent-text/60 bg-accent/10" : "border-line bg-surface-2 hover:border-line-strong"),
        )}
      >
        <span aria-hidden>{c.emoji}</span>
        {!compact && <span className="text-xs font-semibold tabular-nums">{c.n}</span>}
      </button>
    </form>
  );
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {used.map((c) => button(c, false))}
      {viewerId && (
        <details className="relative">
          <summary className="flex h-7 cursor-pointer list-none items-center gap-1 rounded-full border border-line px-2 text-xs text-muted hover:text-text [&::-webkit-details-marker]:hidden">
            <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden>
              <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <circle cx="7.5" cy="8.5" r="1" fill="currentColor" />
              <circle cx="12.5" cy="8.5" r="1" fill="currentColor" />
              <path d="M6.8 12a3.6 3.6 0 0 0 6.4 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            React
          </summary>
          {/* In the flow rather than floating: the update's card clips anything that spills out (that hid the picker on long posts). */}
          <div className="mt-1.5 flex flex-wrap gap-0.5 rounded-full border border-line bg-surface p-1">
            {counts.map((c) => button(c, true))}
          </div>
        </details>
      )}
    </div>
  );
}
