import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { flag } from "@/lib/countries";
import { formatDate } from "@/lib/utils";
import { toggleSession } from "@/actions/community";
import { GameArt } from "@/components/art";
import { Avatar, EmptyState, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { LocalTime, TimeZoneNote } from "@/components/LocalTime";
import { SessionForm } from "./SessionForm";

export const metadata: Metadata = { title: "Sessions", description: "Boosting and co-op sessions for online trophies." };

export default async function SessionsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const sp = await searchParams;
  const viewerId = await getSessionUserId();
  const [sessions, initialGame] = await Promise.all([
    prisma.session.findMany({
      where: { startsAt: { gte: new Date(Date.now() - 2 * 3600_000) } },
      orderBy: { startsAt: "asc" },
      include: {
        game: true,
        host: { include: { psn: true } },
        members: { include: { user: { include: { psn: true } } } },
        _count: { select: { trophies: true, comments: true } },
      },
    }),
    viewerId && sp.new ? prisma.game.findUnique({ where: { id: sp.new }, select: { id: true, title: true, platforms: true } }) : null,
  ]);

  return (
    <div>
      <PageHeader kicker="Online trophies" title="Sessions">
        Team up for online, co-op and multiplayer trophies. Join a session or host your own.
      </PageHeader>
      <TimeZoneNote className="mb-4 text-sm text-muted" />
      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="space-y-3">
          {sessions.length === 0 && <EmptyState title="No upcoming sessions">Be the first to host one.</EmptyState>}
          {sessions.map((s) => {
            const joined = s.members.some((m) => m.userId === viewerId);
            const full = s.members.length >= s.slots;
            return (
              <article key={s.id} id={s.id} className="card scroll-mt-24 p-5 target:border-accent-text">
                <div className="flex flex-wrap items-start gap-4">
                  <Link href={`/games/${s.game.slug}`} aria-label={s.game.title}>
                    <GameArt title={s.game.title} hue={s.game.coverHue} iconUrl={s.game.iconUrl} size="sm" className="w-14" />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold uppercase tracking-wider text-accent-text">
                      {s.game.title} · {s.platform}
                    </div>
                    <h2 className="text-lg font-semibold">
                      <Link href={`/sessions/${s.id}`} className="hover:underline hover:underline-offset-4">
                        {s.title}
                      </Link>
                    </h2>
                    {s.description && <p className="text-sm text-muted">{s.description}</p>}
                    <div className="mt-2 text-sm">
                      <LocalTime date={s.startsAt} weekday className="font-semibold" />{" "}
                      <span className="text-muted">
                        · hosted by{" "}
                        <Link href={`/u/${s.host.username}`} className="underline underline-offset-2 hover:text-text">{s.host.psn?.onlineId ?? s.host.username}</Link>{" "}
                        {flag(s.host.country)}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={`chip ${full ? "border-bad/40 text-bad" : "border-good/40 text-good"}`}>
                      {s.members.length}/{s.slots} {full ? "full" : "joined"}
                    </span>
                    {viewerId ? (
                      (joined || !full) && (
                        <form action={toggleSession}>
                          <input type="hidden" name="sessionId" value={s.id} />
                          <SubmitButton className={joined ? "btn-ghost" : "btn-primary"}>
                            {joined ? (s.hostId === viewerId ? "Cancel session" : "Leave") : "Join"}
                          </SubmitButton>
                        </form>
                      )
                    ) : (
                      <Link href="/login?next=/sessions" className="btn-ghost">Log in to join</Link>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                  {s._count.trophies > 0 && (
                    <span className="chip">
                      {s._count.trophies} target troph{s._count.trophies === 1 ? "y" : "ies"}
                    </span>
                  )}
                  <Link href={`/sessions/${s.id}`} className="chip hover:text-text">
                    {s._count.comments} comment{s._count.comments === 1 ? "" : "s"} · open
                  </Link>
                </div>
                <div className="mt-3 flex -space-x-2">
                  {s.members.map((m) => (
                    <Link
                      key={m.userId}
                      href={`/u/${m.user.username}`}
                      title={m.user.psn?.onlineId ?? m.user.username}
                      aria-label={m.user.psn?.onlineId ?? m.user.username}
                    >
                      <Avatar name={m.user.psn?.onlineId ?? m.user.username} hue={m.user.avatarHue} url={m.user.psn?.avatarUrl} avatar={m.user.avatar} size={30} className="ring-surface" />
                    </Link>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
        <aside>
          <section className="card sticky top-24 p-5">
            <h2 className="mb-4 font-bold">Host a session</h2>
            {viewerId ? (
              <SessionForm initialGame={initialGame} />
            ) : (
              <p className="text-sm text-muted">
                <Link href="/login?next=/sessions" className="link">Log in</Link> to host a session.
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
