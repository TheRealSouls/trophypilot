import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { flag } from "@/lib/countries";
import { trophyHref } from "@/lib/trophy-slug";
import { timeAgo } from "@/lib/utils";
import { deleteSessionComment, toggleSession } from "@/actions/community";
import { GameArt } from "@/components/art";
import { ConfirmButton, SubmitButton } from "@/components/client";
import { LocalTime, TimeZoneNote } from "@/components/LocalTime";
import { TrophyIcon } from "@/components/TrophyIcon";
import { Avatar, RarityBadge } from "@/components/ui";
import { CommentForm } from "./CommentForm";

type Params = { id: string };

const load = cache((id: string) =>
  prisma.session.findUnique({
    where: { id },
    include: {
      game: true,
      host: { include: { psn: true } },
      members: { orderBy: { joinedAt: "asc" }, include: { user: { include: { psn: true } } } },
      trophies: { include: { trophy: true }, orderBy: { trophy: { psnTrophyId: "asc" } } },
      comments: { orderBy: { createdAt: "asc" }, include: { author: { include: { psn: true } } } },
    },
  }),
);

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const s = await load((await params).id);
  return s ? { title: `${s.title} · ${s.game.title} session` } : {};
}

export default async function SessionPage({ params }: { params: Promise<Params> }) {
  const session = await load((await params).id);
  if (!session) notFound();
  const viewer = await getCurrentUser();
  const joined = session.members.some((m) => m.userId === viewer?.id);
  const full = session.members.length >= session.slots;
  const isHost = session.hostId === viewer?.id;
  const past = session.startsAt.getTime() < Date.now();
  // Which target trophies the viewer already has.
  const earned = viewer
    ? new Set(
        (
          await prisma.userTrophy.findMany({
            where: { userId: viewer.id, trophyId: { in: session.trophies.map((t) => t.trophyId) } },
            select: { trophyId: true },
          })
        ).map((r) => r.trophyId),
      )
    : new Set<string>();

  return (
    <div className="mx-auto max-w-5xl">
      <nav className="mb-4 text-sm text-muted">
        <Link href="/sessions" className="hover:text-text">Sessions</Link>
        <span className="mx-1">/</span>
        <Link href={`/games/${session.game.slug}`} className="hover:text-text">{session.game.title}</Link>
      </nav>

      <header className="card mb-8 flex flex-wrap items-start gap-5 p-5 sm:p-6">
        <Link href={`/games/${session.game.slug}`} aria-label={session.game.title} className="shrink-0">
          <GameArt title={session.game.title} hue={session.game.coverHue} iconUrl={session.game.iconUrl} size="sm" className="w-20" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-wider text-accent-text">
            {session.game.title} · {session.platform}
          </div>
          <h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">{session.title}</h1>
          {session.description && <p className="mt-2 text-muted">{session.description}</p>}
          <p className="mt-3 text-sm">
            <span className="font-semibold">{past ? "Started" : "Starts"} </span>
            <LocalTime date={session.startsAt} weekday className="font-semibold" />
            <span className="text-muted">
              {" "}
              · hosted by{" "}
              <Link href={`/u/${session.host.username}`} className="underline underline-offset-2 hover:text-text">
                {session.host.psn?.onlineId ?? session.host.username}
              </Link>
            </span>
          </p>
          <TimeZoneNote className="mt-1 text-xs text-muted" />
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`chip ${full ? "border-bad/40 text-bad" : "border-good/40 text-good"}`}>
            {session.members.length}/{session.slots} {full ? "full" : "joined"}
          </span>
          {viewer ? (
            (joined || !full) && (
              <form action={toggleSession}>
                <input type="hidden" name="sessionId" value={session.id} />
                {isHost ? (
                  <ConfirmButton message="Cancel this session for everyone?">Cancel session</ConfirmButton>
                ) : (
                  <SubmitButton className={joined ? "btn-ghost" : "btn-primary"}>{joined ? "Leave" : "Join session"}</SubmitButton>
                )}
              </form>
            )
          ) : (
            <Link href={`/login?next=/sessions/${session.id}`} className="btn-ghost">Log in to join</Link>
          )}
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-10">
          <section>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide">Trophies this session is for</h2>
            {session.trophies.length === 0 ? (
              <p className="text-sm text-muted">The host didn&apos;t pick specific trophies. Ask in the comments.</p>
            ) : (
              <ul className="card divide-y divide-line">
                {session.trophies.map(({ trophy: t }) => {
                  const got = earned.has(t.id);
                  const secret = t.hidden && !got;
                  return (
                    <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                      <TrophyIcon type={t.type} size={28} />
                      <div className="min-w-0 flex-1">
                        <Link
                          href={t.slug ? trophyHref(session.game.slug, t.slug) : `/trophies/${t.id}`}
                          className="block truncate font-semibold hover:underline hover:underline-offset-4"
                        >
                          {secret ? "Hidden trophy" : t.name}
                        </Link>
                        {!secret && <div className="truncate text-sm text-muted">{t.description}</div>}
                      </div>
                      {got && <span className="text-xs font-semibold text-good">You have it</span>}
                      <RarityBadge rate={t.earnedRate} />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section id="comments">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide">
              Comments ({session.comments.length})
            </h2>
            {session.comments.length === 0 ? (
              <p className="mb-4 text-sm text-muted">No comments yet. Say when you&apos;re free, whether you have a mic, or what you still need.</p>
            ) : (
              <ol className="mb-6 space-y-3">
                {session.comments.map((c) => {
                  const name = c.author.psn?.onlineId ?? c.author.username;
                  const canDelete = viewer && (c.authorId === viewer.id || isHost || viewer.role === "ADMIN");
                  return (
                    <li key={c.id} className="card flex gap-3 p-4">
                      <Avatar name={name} hue={c.author.avatarHue} url={c.author.psn?.avatarUrl} avatar={c.author.avatar} size={36} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <Link href={`/u/${c.author.username}`} className="font-semibold hover:underline hover:underline-offset-4">{name}</Link>
                          {c.authorId === session.hostId && <span className="chip border-accent-text/50 text-accent-text">Host</span>}
                          <span className="text-xs text-muted">{timeAgo(c.createdAt)}</span>
                          {canDelete && (
                            <form action={deleteSessionComment} className="ml-auto">
                              <input type="hidden" name="commentId" value={c.id} />
                              <ConfirmButton message="Delete this comment?" className="text-xs text-muted hover:text-bad">Delete</ConfirmButton>
                            </form>
                          )}
                        </div>
                        <p className="prose-guide mt-1 break-words">{c.body}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            {viewer ? (
              <CommentForm sessionId={session.id} />
            ) : (
              <Link href={`/login?next=/sessions/${session.id}`} className="btn-ghost">Log in to comment</Link>
            )}
          </section>
        </div>

        <aside>
          <section className="card p-5">
            <h2 className="mb-3 font-bold">
              Who&apos;s in ({session.members.length}/{session.slots})
            </h2>
            <ul className="space-y-3">
              {session.members.map((m) => {
                const name = m.user.psn?.onlineId ?? m.user.username;
                return (
                  <li key={m.userId} className="flex items-center gap-3 text-sm">
                    <Avatar name={name} hue={m.user.avatarHue} url={m.user.psn?.avatarUrl} avatar={m.user.avatar} size={36} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/u/${m.user.username}`} className="block truncate font-semibold hover:underline hover:underline-offset-4">
                        {name} <span className="text-xs">{flag(m.user.country)}</span>
                      </Link>
                      <div className="text-xs text-muted">
                        {m.userId === session.hostId ? "Host" : `Joined ${timeAgo(m.joinedAt)}`}
                        {m.user.psn ? ` · Level ${m.user.psn.trophyLevel}` : ""}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            {!full && <p className="mt-4 text-xs text-muted">{session.slots - session.members.length} spot{session.slots - session.members.length === 1 ? "" : "s"} left.</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}
