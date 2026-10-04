import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { flag } from "@/lib/countries";
import { DELETED_USER, isAdmin, POSTS_PER_PAGE } from "@/lib/forum";
import { reputations } from "@/lib/community";
import { formatDate, timeAgo } from "@/lib/utils";
import { deletePost, moderateThread } from "@/actions/forum";
import { GameArt } from "@/components/art";
import { ConfirmButton } from "@/components/client";
import { Avatar, Notice } from "@/components/ui";
import { EditablePost, ReplyForm } from "../../forms";

type Params = { id: string };

const loadThread = cache((id: string) =>
  prisma.forumThread.findUnique({
    where: { id },
    include: {
      section: { include: { parent: { select: { slug: true, name: true } } } },
      game: { select: { title: true, slug: true, coverHue: true, iconUrl: true } },
    },
  }),
);

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const t = await loadThread((await params).id);
  return t ? { title: `${t.title} · ${t.section.name}` } : {};
}

export default async function ThreadPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<{ page?: string }> }) {
  const { id } = await params;
  const thread = await loadThread(id);
  if (!thread) notFound();
  const user = await getCurrentUser();
  const admin = isAdmin(user);
  const page = Math.max(1, Number.parseInt((await searchParams).page ?? "1", 10) || 1);

  const [posts, total, firstPost, moveTargets] = await Promise.all([
    prisma.forumPost.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * POSTS_PER_PAGE,
      take: POSTS_PER_PAGE,
      include: {
        author: {
          select: {
            id: true,
            username: true,
            country: true,
            avatarHue: true, avatar: true,
            role: true,
            psn: { select: { onlineId: true, avatarUrl: true, trophyLevel: true } },
          },
        },
      },
    }),
    prisma.forumPost.count({ where: { threadId: thread.id } }),
    prisma.forumPost.findFirst({ where: { threadId: thread.id }, orderBy: { createdAt: "asc" }, select: { id: true } }),
    admin ? prisma.forumSection.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }) : [],
  ]);
  const pages = Math.max(1, Math.ceil(total / POSTS_PER_PAGE));
  const rep = await reputations(posts.flatMap((p) => (p.author ? [p.author.id] : [])));
  if (page === 1) await prisma.forumThread.update({ where: { id: thread.id }, data: { views: { increment: 1 } } });

  const canReply = !!user && (!thread.locked || admin);

  return (
    <div className="mx-auto max-w-4xl">
      <nav className="mb-4 text-sm text-muted">
        <Link href="/forums" className="hover:text-text">Forums</Link>
        {thread.section.parent && (
          <>
            <span className="mx-1">/</span>
            <Link href={`/forums/${thread.section.parent.slug}`} className="hover:text-text">{thread.section.parent.name}</Link>
          </>
        )}
        <span className="mx-1">/</span>
        <Link href={`/forums/${thread.section.slug}`} className="hover:text-text">{thread.section.name}</Link>
      </nav>

      <header className="mb-6 flex flex-wrap items-start gap-4">
        {thread.game && (
          <Link href={`/games/${thread.game.slug}`} className="shrink-0" aria-label={thread.game.title}>
            <GameArt title={thread.game.title} hue={thread.game.coverHue} iconUrl={thread.game.iconUrl} size="sm" className="w-14" />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap gap-1.5">
            {thread.pinned && <span className="chip border-accent-text/50 text-accent-text">Pinned</span>}
            {thread.locked && <span className="chip">Locked</span>}
            {thread.game && (
              <Link href={`/games/${thread.game.slug}`} className="chip hover:text-text">{thread.game.title}</Link>
            )}
          </div>
          <h1 className="break-words text-2xl font-bold tracking-tight">{thread.title}</h1>
          <p className="text-xs text-muted">
            {total} post{total === 1 ? "" : "s"} · {thread.views} views · started {formatDate(thread.createdAt)}
          </p>
        </div>
      </header>

      {admin && (
        <div className="mb-6 flex flex-wrap items-center gap-2 border border-line p-3 text-sm">
          <span className="label mb-0 mr-2">Moderate</span>
          <ModButton threadId={thread.id} action={thread.pinned ? "unpin" : "pin"} label={thread.pinned ? "Unpin" : "Pin"} />
          <ModButton threadId={thread.id} action={thread.locked ? "unlock" : "lock"} label={thread.locked ? "Unlock" : "Lock"} />
          <form action={moderateThread} className="flex gap-2">
            <input type="hidden" name="threadId" value={thread.id} />
            <input type="hidden" name="action" value="move" />
            <select name="sectionId" defaultValue={thread.sectionId} className="input py-1 text-xs" aria-label="Move to section">
              {moveTargets.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <button className="btn-ghost px-3 py-1 text-xs">Move</button>
          </form>
          <form action={moderateThread} className="ml-auto">
            <input type="hidden" name="threadId" value={thread.id} />
            <input type="hidden" name="action" value="delete" />
            <ConfirmButton message="Delete this whole thread and every reply?" className="btn-danger px-3 py-1 text-xs">
              Delete thread
            </ConfirmButton>
          </form>
        </div>
      )}

      <ol className="space-y-4">
        {posts.map((p) => {
          const name = p.author ? p.author.psn?.onlineId ?? p.author.username : DELETED_USER;
          const mine = !!user && p.author?.id === user.id;
          return (
            <li key={p.id} id={`post-${p.id}`} className="card scroll-mt-24 target:border-accent-text sm:grid sm:grid-cols-[160px_1fr]">
              <aside className="flex items-center gap-3 border-b border-line bg-surface-2 p-3 sm:flex-col sm:items-start sm:border-b-0 sm:border-r">
                <Avatar name={name} hue={p.author?.avatarHue ?? 0} url={p.author?.psn?.avatarUrl} avatar={p.author?.avatar} size={40} />
                <div className="min-w-0 text-sm">
                  {p.author ? (
                    <Link href={`/forums/user/${p.author.username}`} className="block truncate font-semibold hover:underline hover:underline-offset-4">
                      {name}
                    </Link>
                  ) : (
                    <span className="text-muted">{name}</span>
                  )}
                  <div className="text-xs text-muted">
                    {p.author?.psn ? `Level ${p.author.psn.trophyLevel}` : ""} {flag(p.author?.country)}
                  </div>
                  {p.author && (
                    <div className="text-xs text-muted" title="Community reputation">
                      {rep.get(p.author.id)?.rank} · {rep.get(p.author.id)?.points ?? 0} rep
                    </div>
                  )}
                  {p.author?.role === "ADMIN" && <span className="chip mt-1 border-accent-text/50 text-accent-text">Staff</span>}
                </div>
              </aside>
              <div className="min-w-0 p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <a href={`#post-${p.id}`} className="hover:text-text">{timeAgo(p.createdAt)}</a>
                  {p.editedAt && <span>· edited {timeAgo(p.editedAt)}</span>}
                  {(mine || admin) && (
                    <form action={deletePost} className="ml-auto">
                      <input type="hidden" name="postId" value={p.id} />
                      <ConfirmButton
                        message={p.id === firstPost?.id ? "This is the first post, so the whole thread will be deleted. Continue?" : "Delete this post?"}
                        className="text-xs text-muted hover:text-bad"
                      >
                        Delete
                      </ConfirmButton>
                    </form>
                  )}
                </div>
                <EditablePost postId={p.id} body={p.body} canEdit={mine || admin} />
              </div>
            </li>
          );
        })}
      </ol>

      {pages > 1 && (
        <nav className="mt-6 flex items-center justify-between text-sm" aria-label="Pagination">
          {page > 1 ? <Link href={`/forums/thread/${thread.id}?page=${page - 1}`} className="btn-ghost">Previous</Link> : <span />}
          <span className="text-muted">Page {page} of {pages}</span>
          {page < pages ? <Link href={`/forums/thread/${thread.id}?page=${page + 1}`} className="btn-ghost">Next</Link> : <span />}
        </nav>
      )}

      <section className="mt-8 border-t border-line pt-6">
        {canReply ? (
          <ReplyForm threadId={thread.id} />
        ) : thread.locked ? (
          <Notice>This thread is locked, so it can&apos;t get new replies.</Notice>
        ) : (
          <Link href={`/login?next=/forums/thread/${thread.id}`} className="btn-ghost">Log in to reply</Link>
        )}
      </section>
    </div>
  );
}

function ModButton({ threadId, action, label }: { threadId: string; action: string; label: string }) {
  return (
    <form action={moderateThread}>
      <input type="hidden" name="threadId" value={threadId} />
      <input type="hidden" name="action" value={action} />
      <button className="btn-ghost px-3 py-1 text-xs">{label}</button>
    </form>
  );
}
