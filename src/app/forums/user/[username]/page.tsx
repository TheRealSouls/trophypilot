import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { reputationOf } from "@/lib/community";
import { formatNumber, timeAgo } from "@/lib/utils";
import { Avatar, EmptyState, PageHeader, Stat, StatGrid } from "@/components/ui";

type Params = { username: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  return { title: `${(await params).username} on the forums` };
}

/** A member's forum profile: reputation, badges, threads started and recent posts. */
export default async function ForumUserPage({ params }: { params: Promise<Params> }) {
  const { username } = await params;
  const user = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
    select: { id: true, username: true, avatarHue: true, avatar: true, role: true, psn: { select: { onlineId: true, avatarUrl: true } } },
  });
  if (!user) notFound();
  const name = user.psn?.onlineId ?? user.username;

  const [rep, threads, posts] = await Promise.all([
    reputationOf(user.id),
    prisma.forumThread.findMany({
      where: { authorId: user.id },
      orderBy: { lastPostAt: "desc" },
      take: 20,
      include: { section: { select: { name: true, slug: true } } },
    }),
    prisma.forumPost.findMany({
      where: { authorId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { thread: { select: { id: true, title: true } } },
    }),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <nav className="mb-4 text-sm text-muted">
        <Link href="/forums" className="hover:text-text">Forums</Link>
        <span className="mx-1">/</span> Members
      </nav>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Avatar name={name} hue={user.avatarHue} url={user.psn?.avatarUrl} avatar={user.avatar} size={64} />
        <div className="min-w-0 flex-1">
          <PageHeader title={name}>
            {rep.rank}
            {user.role === "ADMIN" && " · Forum staff"}
          </PageHeader>
        </div>
        <Link href={`/u/${user.username}`} className="btn-ghost">Trophy profile</Link>
      </div>

      <StatGrid className="mb-8 grid-cols-2 sm:grid-cols-4">
        <Stat label="Reputation" value={formatNumber(rep.points)} sub={rep.rank} />
        <Stat label="Threads" value={formatNumber(rep.counts.threads)} />
        <Stat label="Replies" value={formatNumber(rep.counts.replies)} />
        <Stat label="Guides and tips" value={formatNumber(rep.counts.guides + rep.counts.tips)} />
      </StatGrid>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide">Badges</h2>
        {rep.badges.length === 0 ? (
          <p className="text-sm text-muted">No badges yet. They come from posting, starting threads, writing guides and sharing tips.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {rep.badges.map((b) => (
              <li key={b.name} className="rounded-lg border border-line bg-surface-2 px-3 py-2">
                <div className="text-sm font-semibold">{b.name}</div>
                <div className="text-xs text-muted">{b.hint}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide">Threads started</h2>
          {threads.length === 0 ? (
            <EmptyState title="No threads yet" />
          ) : (
            <ul className="card divide-y divide-line">
              {threads.map((t) => (
                <li key={t.id} className="px-4 py-3">
                  <Link href={`/forums/thread/${t.id}`} className="block truncate font-semibold hover:underline hover:underline-offset-4">
                    {t.title}
                  </Link>
                  <div className="text-xs text-muted">
                    <Link href={`/forums/${t.section.slug}`} className="hover:text-text">{t.section.name}</Link> · {t.postCount - 1} replies ·{" "}
                    {timeAgo(t.lastPostAt)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide">Recent posts</h2>
          {posts.length === 0 ? (
            <EmptyState title="No posts yet" />
          ) : (
            <ul className="card divide-y divide-line">
              {posts.map((p) => (
                <li key={p.id} className="px-4 py-3">
                  <Link href={`/forums/thread/${p.thread.id}#post-${p.id}`} className="block truncate text-sm font-semibold hover:underline hover:underline-offset-4">
                    {p.thread.title}
                  </Link>
                  <p className="line-clamp-2 text-sm text-muted">{p.body}</p>
                  <div className="text-xs text-faint">{timeAgo(p.createdAt)}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
