import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getFriendIds } from "@/lib/social";
import { timeAgo } from "@/lib/utils";
import { deletePost } from "@/actions/social";
import { ConfirmButton } from "./client";
import { Avatar } from "./ui";

/**
 * Community updates: short posts on the community page and in clubs.
 */

const postInclude = {
  author: { select: { id: true, username: true, avatarHue: true, avatar: true, psn: { select: { onlineId: true, avatarUrl: true } } } },
  club: { select: { name: true, slug: true } },
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
        const canDelete = viewer && (viewer.id === p.author.id || viewer.role === "ADMIN");
        return (
          <li key={p.id} className="card flex gap-3 p-4">
            <Avatar name={name} hue={p.author.avatarHue} url={p.author.psn?.avatarUrl} avatar={p.author.avatar} size={40} />
            <div className="min-w-0 flex-1">
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
                {canDelete && (
                  <form action={deletePost} className="ml-auto">
                    <input type="hidden" name="postId" value={p.id} />
                    <ConfirmButton message="Delete this update?" className="text-xs text-muted hover:text-bad">
                      Delete
                    </ConfirmButton>
                  </form>
                )}
              </div>
              <p className="prose-guide mt-1 break-words">{p.body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
