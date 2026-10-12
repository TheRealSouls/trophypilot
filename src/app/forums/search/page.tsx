import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { FORUM_TABS } from "@/lib/forum";
import { plainText } from "@/lib/rich-text";
import { timeAgo } from "@/lib/utils";
import { EmptyState, PageHeader, TabLinks } from "@/components/ui";
import { ForumSearchBox } from "../ForumSearchBox";

export const metadata: Metadata = { title: "Search the forums", robots: { index: false } };

/** Threads whose title matches, and posts whose text matches, newest first. */
export default async function ForumSearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim().slice(0, 100);
  const [threads, posts] =
    q.length >= 2
      ? await Promise.all([
          prisma.forumThread.findMany({
            where: { title: { contains: q, mode: "insensitive" } },
            orderBy: { lastPostAt: "desc" },
            take: 30,
            select: { id: true, title: true, postCount: true, lastPostAt: true, section: { select: { name: true, slug: true } } },
          }),
          prisma.forumPost.findMany({
            where: { body: { contains: q, mode: "insensitive" } },
            orderBy: { createdAt: "desc" },
            take: 30,
            select: {
              id: true,
              body: true,
              createdAt: true,
              threadId: true,
              author: { select: { username: true } },
              thread: { select: { title: true } },
            },
          }),
        ])
      : [[], []];

  return (
    <div>
      <PageHeader kicker="Community" title="Search the forums">
        Find threads by title and posts by what they say.
      </PageHeader>
      <div className="mb-6">
        <TabLinks tabs={FORUM_TABS} active="forums" />
      </div>
      <ForumSearchBox q={q} />
      {q.length < 2 ? (
        <p className="text-sm text-muted">Type at least two letters.</p>
      ) : threads.length === 0 && posts.length === 0 ? (
        <EmptyState title={`Nothing found for "${q}"`}>Try a shorter word or a game's name.</EmptyState>
      ) : (
        <div className="grid gap-8 lg:grid-cols-2">
          <section aria-labelledby="hits-threads">
            <h2 id="hits-threads" className="mb-3 text-sm font-bold uppercase tracking-wider">
              Threads ({threads.length})
            </h2>
            <ul className="card divide-y divide-line">
              {threads.map((t) => (
                <li key={t.id} className="px-4 py-3">
                  <Link href={`/forums/thread/${t.id}`} className="font-semibold hover:underline hover:underline-offset-4">
                    {t.title}
                  </Link>
                  <div className="text-xs text-muted">
                    {t.section.name} · {t.postCount} post{t.postCount === 1 ? "" : "s"} · {timeAgo(t.lastPostAt)}
                  </div>
                </li>
              ))}
              {threads.length === 0 && <li className="px-4 py-3 text-sm text-muted">No thread titles match.</li>}
            </ul>
          </section>
          <section aria-labelledby="hits-posts">
            <h2 id="hits-posts" className="mb-3 text-sm font-bold uppercase tracking-wider">
              Posts ({posts.length})
            </h2>
            <ul className="card divide-y divide-line">
              {posts.map((p) => (
                <li key={p.id} className="px-4 py-3">
                  <Link href={`/forums/thread/${p.threadId}#post-${p.id}`} className="font-semibold hover:underline hover:underline-offset-4">
                    {p.thread.title}
                  </Link>
                  <p className="line-clamp-2 text-sm text-muted">{plainText(p.body)}</p>
                  <div className="text-xs text-faint">
                    {p.author?.username ?? "deleted member"} · {timeAgo(p.createdAt)}
                  </div>
                </li>
              ))}
              {posts.length === 0 && <li className="px-4 py-3 text-sm text-muted">No posts mention it.</li>}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
