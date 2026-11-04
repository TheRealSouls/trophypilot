import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import clsx from "clsx";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { DELETED_USER, isStaff, THREADS_PER_PAGE } from "@/lib/forum";
import { formatNumber, timeAgo } from "@/lib/utils";
import { EmptyState, PageHeader } from "@/components/ui";
import { GAME_FORUMS_SLUG, gameOfSection } from "@/lib/game-forum";

type Params = { slug: string };

const loadSection = cache((slug: string) =>
  prisma.forumSection.findUnique({
    where: { slug },
    include: {
      parent: { select: { slug: true, name: true } },
      // Game forums list only the games that have threads (every game has a forum, most still empty).
      children: {
        where: { OR: [{ gameKey: null }, { threads: { some: {} } }] },
        orderBy: [{ order: "asc" }, { name: "asc" }],
        take: 500,
        include: { _count: { select: { threads: true } } },
      },
    },
  }),
);

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const s = await loadSection((await params).slug);
  return s ? { title: `${s.name} · Forums`, description: s.description || undefined } : {};
}

export default async function SectionPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<{ page?: string }> }) {
  const { slug } = await params;
  const section = await loadSection(slug);
  if (!section) notFound();
  const user = await getCurrentUser();
  const page = Math.max(1, Number.parseInt((await searchParams).page ?? "1", 10) || 1);

  const [threads, total] = await Promise.all([
    prisma.forumThread.findMany({
      where: { sectionId: section.id },
      orderBy: [{ pinned: "desc" }, { lastPostAt: "desc" }],
      skip: (page - 1) * THREADS_PER_PAGE,
      take: THREADS_PER_PAGE,
      include: {
        author: { select: { username: true, psn: { select: { onlineId: true } } } },
        game: { select: { title: true, slug: true } },
      },
    }),
    prisma.forumThread.count({ where: { sectionId: section.id } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / THREADS_PER_PAGE));
  // Threads can't go straight into "Game forums"; they go into a game's own forum.
  const canPost = !!user && (!section.adminOnly || isStaff(user)) && section.slug !== GAME_FORUMS_SLUG;
  const game = section.gameKey ? await gameOfSection(section.gameKey) : null;
  const newThread = game ? `/forums/new?game=${game.id}` : `/forums/new?section=${section.slug}`;

  return (
    <div>
      <nav className="mb-4 text-sm text-muted">
        <Link href="/forums" className="hover:text-text">Forums</Link>
        {section.parent && (
          <>
            <span className="mx-1">/</span>
            <Link href={`/forums/${section.parent.slug}`} className="hover:text-text">{section.parent.name}</Link>
          </>
        )}
      </nav>
      <PageHeader title={section.name}>
        {section.description}
        {game && (
          <>
            {" "}
            <Link href={`/games/${game.slug}`} className="link">
              See the trophy list
            </Link>
            .
          </>
        )}
      </PageHeader>

      <div className="mb-6 flex flex-wrap gap-2">
        {canPost ? (
          <Link href={newThread} className="btn-primary">New thread</Link>
        ) : !user ? (
          <Link href={`/login?next=/forums/${section.slug}`} className="btn-ghost">Log in to post</Link>
        ) : section.slug === GAME_FORUMS_SLUG ? (
          <span className="text-sm text-muted">To start a thread about a game, open the game and press Start a discussion.</span>
        ) : (
          <span className="text-sm text-muted">Only admins can start threads here.</span>
        )}
      </div>

      {section.children.length > 0 && (
        <ul className="card mb-8 divide-y divide-line">
          {section.children.map((c) => (
            <li key={c.id} className="flex flex-wrap items-baseline gap-x-4 px-4 py-3">
              <Link href={`/forums/${c.slug}`} className="font-semibold hover:underline hover:underline-offset-4">{c.name}</Link>
              {c.description && <span className="text-sm text-muted">{c.description}</span>}
              <span className="ml-auto text-xs text-muted">{formatNumber(c._count.threads)} threads</span>
            </li>
          ))}
        </ul>
      )}

      {threads.length === 0 ? (
        section.children.length === 0 && (
          <EmptyState title="No threads yet">{canPost ? "Start the first one." : "Nobody has posted here yet."}</EmptyState>
        )
      ) : (
        <ul className="card divide-y divide-line">
          {threads.map((t) => (
            <li key={t.id} className={clsx("grid gap-1 px-4 py-3 sm:grid-cols-[1fr_110px_140px] sm:items-center", t.pinned && "bg-surface-2")}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  {t.pinned && <span className="chip border-accent-text/50 text-accent-text">Pinned</span>}
                  {t.locked && <span className="chip">Locked</span>}
                  <Link href={`/forums/thread/${t.id}`} className="font-semibold hover:underline hover:underline-offset-4">
                    {t.title}
                  </Link>
                </div>
                <div className="text-xs text-muted">
                  by {t.author ? t.author.psn?.onlineId ?? t.author.username : DELETED_USER} · {timeAgo(t.createdAt)}
                  {t.game && (
                    <>
                      {" · "}
                      <Link href={`/games/${t.game.slug}`} className="hover:text-text">{t.game.title}</Link>
                    </>
                  )}
                </div>
              </div>
              <div className="text-xs text-muted">{formatNumber(t.postCount - 1)} replies</div>
              <div className="text-xs text-muted">last post {timeAgo(t.lastPostAt)}</div>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav className="mt-6 flex items-center justify-between text-sm" aria-label="Pagination">
          {page > 1 ? <Link href={`/forums/${section.slug}?page=${page - 1}`} className="btn-ghost">Previous</Link> : <span />}
          <span className="text-muted">Page {page} of {pages}</span>
          {page < pages ? <Link href={`/forums/${section.slug}?page=${page + 1}`} className="btn-ghost">Next</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
