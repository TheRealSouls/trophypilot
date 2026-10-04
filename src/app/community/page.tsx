import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { loadFeed, PostList, type FeedScope } from "@/components/community";
import { PostComposer } from "@/components/community-forms";
import { Avatar, PageHeader, TabLinks } from "@/components/ui";
import { toggleFollow } from "@/actions/social";
import { SubmitButton } from "@/components/client";

export const metadata: Metadata = { title: "Community", description: "Updates from members, the people you follow and your clubs." };

const EMPTY: Record<FeedScope, string> = {
  everyone: "Nobody has posted yet. Be the first.",
  following: "Nothing yet from you, your friends or the people you follow. Follow a few members and their updates show up here.",
  clubs: "No updates in your clubs yet. Join a club, or post in one you're in.",
};

export default async function CommunityPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const viewer = await getCurrentUser();
  const scope: FeedScope = viewer && (tab === "following" || tab === "clubs") ? tab : "everyone";

  const [posts, myClubs, suggestions] = await Promise.all([
    loadFeed({ scope, viewerId: viewer?.id ?? null }),
    viewer
      ? prisma.club.findMany({ where: { members: { some: { userId: viewer.id } } }, orderBy: { name: "asc" }, select: { id: true, name: true, slug: true } })
      : [],
    // People worth following: the most followed members the viewer doesn't follow yet.
    prisma.user.findMany({
      where: {
        profileVisibility: "PUBLIC",
        ...(viewer ? { id: { not: viewer.id }, followers: { none: { followerId: viewer.id } } } : {}),
      },
      orderBy: [{ followers: { _count: "desc" } }, { posts: { _count: "desc" } }],
      take: 5,
      select: { id: true, username: true, avatarHue: true, avatar: true, psn: { select: { onlineId: true, avatarUrl: true } }, _count: { select: { followers: true } } },
    }),
  ]);

  const tabs = [
    { key: "everyone", label: "Everyone", href: "/community" },
    ...(viewer
      ? [
          { key: "following", label: "Friends and following", href: "/community?tab=following" },
          { key: "clubs", label: "My clubs", href: "/community?tab=clubs" },
        ]
      : []),
  ];

  return (
    <div>
      <PageHeader kicker="Community" title="Community activity">
        Updates from members: new platinums, games they&apos;re stuck on, sessions they&apos;re planning.
      </PageHeader>
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-5">
          {viewer ? (
            <PostComposer clubs={myClubs} />
          ) : (
            <p className="card p-4 text-sm text-muted">
              <Link href="/login?next=/community" className="link">Log in</Link> to post updates and follow other members.
            </p>
          )}
          <TabLinks tabs={tabs} active={scope} />
          <PostList posts={posts} viewer={viewer} empty={EMPTY[scope]} />
        </div>

        <aside className="space-y-6">
          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold">Your clubs</h2>
              <Link href="/clubs" className="link text-sm">All clubs</Link>
            </div>
            {myClubs.length === 0 ? (
              <p className="text-sm text-muted">Clubs are groups around an interest, like game collecting or online shooters. Join one or start your own.</p>
            ) : (
              <ul className="space-y-1">
                {myClubs.map((c) => (
                  <li key={c.id}>
                    <Link href={`/clubs/${c.slug}`} className="block rounded-md px-2 py-1.5 text-sm font-semibold hover:bg-surface-2">
                      {c.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {suggestions.length > 0 && (
            <section className="card p-5">
              <h2 className="mb-3 font-bold">Members to follow</h2>
              <ul className="space-y-3">
                {suggestions.map((u) => {
                  const name = u.psn?.onlineId ?? u.username;
                  return (
                    <li key={u.id} className="flex items-center gap-3 text-sm">
                      <Avatar name={name} hue={u.avatarHue} url={u.psn?.avatarUrl} avatar={u.avatar} size={32} />
                      <div className="min-w-0 flex-1">
                        <Link href={`/u/${u.username}`} className="block truncate font-semibold hover:underline hover:underline-offset-4">{name}</Link>
                        <div className="text-xs text-muted">
                          {u._count.followers} follower{u._count.followers === 1 ? "" : "s"}
                        </div>
                      </div>
                      {viewer && (
                        <form action={toggleFollow}>
                          <input type="hidden" name="userId" value={u.id} />
                          <SubmitButton className="btn-ghost px-3 py-1 text-xs">Follow</SubmitButton>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {viewer && (
            <section className="card p-5">
              <h2 className="mb-2 font-bold">Messages</h2>
              <p className="mb-3 text-sm text-muted">Talk to one member privately, or start a group chat.</p>
              <Link href="/messages" className="btn-ghost w-full">Open messages</Link>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
