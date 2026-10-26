import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { cardClass } from "@/lib/profile-themes";
import { ProfileCardArt } from "@/components/ProfileCardArt";
import { CardThemePicker } from "@/components/CardThemePicker";
import { ReportButton } from "@/components/ReportButton";
import { AVATAR_PRESETS } from "@/components/avatars";
import { RichText } from "@/components/RichText";
import { notFound } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { flag } from "@/lib/countries";
import { isStaff } from "@/lib/forum";
import { formatDate } from "@/lib/utils";
import { deleteClub, setClubTheme, toggleClubMembership } from "@/actions/social";
import { ConfirmButton, SubmitButton } from "@/components/client";
import { loadFeed, PostList } from "@/components/community";
import { PostComposer } from "@/components/community-forms";
import { Avatar, Notice } from "@/components/ui";
import { deletionDate, WARN_AFTER_DAYS } from "@/lib/idle-clubs";

type Params = { slug: string };

const load = cache((slug: string) =>
  prisma.club.findUnique({
    where: { slug },
    include: {
      owner: { select: { username: true, psn: { select: { onlineId: true } } } },
      members: {
        orderBy: { joinedAt: "asc" },
        take: 60,
        include: { user: { select: { id: true, username: true, country: true, avatarHue: true, avatar: true, psn: { select: { onlineId: true, avatarUrl: true } } } } },
      },
      _count: { select: { members: true } },
    },
  }),
);

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const c = await load((await params).slug);
  return c ? { title: `${c.name} · Clubs`, description: c.description || undefined } : {};
}

export default async function ClubPage({ params }: { params: Promise<Params> }) {
  const club = await load((await params).slug);
  if (!club) notFound();
  const viewer = await getCurrentUser();
  const member = viewer ? !!(await prisma.clubMember.findUnique({ where: { clubId_userId: { clubId: club.id, userId: viewer.id } } })) : false;
  const isOwner = viewer?.id === club.ownerId;
  const posts = await loadFeed({ scope: "everyone", viewerId: viewer?.id ?? null, clubId: club.id });

  return (
    <div>
      <nav className="mb-4 text-sm text-muted">
        <Link href="/community" className="hover:text-text">Community</Link>
        <span className="mx-1">/</span>
        <Link href="/clubs" className="hover:text-text">Clubs</Link>
      </nav>
      <section className={clsx("card relative mb-8 overflow-hidden", cardClass(club.theme))}>
        {club.theme && (
          <div className="relative h-24 overflow-hidden sm:h-32">
            <ProfileCardArt card={club.theme} part="banner" />
          </div>
        )}
        <ProfileCardArt card={club.theme} part="body" />
        <div className="relative flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
        <Avatar
          name={club.name}
          hue={club.name.length * 37}
          avatar={club.avatar}
          size={72}
          className={club.theme ? "-mt-12 border-4 border-surface" : "border border-line"}
        />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{club.name}</h1>
          <div className="mt-2 text-muted">{club.description ? <RichText text={club.description} /> : "A club on TrophyPilot."}</div>
          <span className="mt-2 block text-xs text-muted">
            {club._count.members} member{club._count.members === 1 ? "" : "s"} · started {formatDate(club.createdAt, { month: "short", year: "numeric" })} by{" "}
            <Link href={`/u/${club.owner.username}`} className="underline underline-offset-2">{club.owner.psn?.onlineId ?? club.owner.username}</Link>
          </span>
        </div>
        <div className="flex gap-2">
          {viewer && !isOwner && (
            <form action={toggleClubMembership}>
              <input type="hidden" name="clubId" value={club.id} />
              <SubmitButton className={member ? "btn-ghost" : "btn-primary"}>{member ? "Leave club" : "Join club"}</SubmitButton>
            </form>
          )}
          {!viewer && <Link href={`/login?next=/clubs/${club.slug}`} className="btn-primary">Log in to join</Link>}
          {!isOwner && <ReportButton type="CLUB" id={club.id} authorId={club.ownerId} what="this club" className="self-center px-1" />}
          {(isOwner || isStaff(viewer)) && (
            <form action={deleteClub}>
              <input type="hidden" name="clubId" value={club.id} />
              <ConfirmButton message={`Delete "${club.name}" and all of its updates?`}>Delete club</ConfirmButton>
            </form>
          )}
        </div>
        </div>
      </section>
      {club.idleWarnedAt && (
        <Notice tone="warn" className="mb-8">
          This club has been quiet for {WARN_AFTER_DAYS} days. It will be deleted on {formatDate(deletionDate(club.idleWarnedAt))} unless
          someone joins, posts an update or reacts to one.
        </Notice>
      )}
      {(isOwner || isStaff(viewer)) && (
        <details className="card mb-8 p-4">
          <summary className="cursor-pointer text-sm font-semibold">Club picture and theme</summary>
          <form action={setClubTheme} className="mt-4 space-y-5">
            <input type="hidden" name="clubId" value={club.id} />
            <fieldset>
              <legend className="label">Club picture</legend>
              <div className="flex flex-wrap gap-2">
                {["", ...Object.keys(AVATAR_PRESETS).map((k) => `preset:${k}`)].map((v) => (
                  <label key={v || "initial"} className="cursor-pointer">
                    <input type="radio" name="avatar" value={v} defaultChecked={(club.avatar ?? "") === v} className="peer sr-only" />
                    <span className="sr-only">{v ? AVATAR_PRESETS[v.slice(7)] : "The club's initial"}</span>
                    <span
                      aria-hidden
                      className="block rounded-lg border-2 border-line p-0.5 peer-checked:border-accent peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-text"
                    >
                      <Avatar name={club.name} hue={club.name.length * 37} avatar={v || "letter"} size={44} />
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <CardThemePicker value={club.theme} legend="Pick a theme for the club's header" />
            <SubmitButton className="btn-ghost">Save</SubmitButton>
          </form>
        </details>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-5">
          {member ? (
            <PostComposer clubId={club.id} />
          ) : (
            <p className="card p-4 text-sm text-muted">Join the club to post in it.</p>
          )}
          <PostList posts={posts} viewer={viewer} empty="No updates in this club yet." />
        </div>
        <aside>
          <section className="card p-5">
            <h2 className="mb-3 font-bold">Members ({club._count.members})</h2>
            <ul className="space-y-2.5">
              {club.members.map(({ user: u }) => {
                const name = u.psn?.onlineId ?? u.username;
                return (
                  <li key={u.id} className="flex items-center gap-2.5 text-sm">
                    <Avatar name={name} hue={u.avatarHue} url={u.psn?.avatarUrl} avatar={u.avatar} size={28} />
                    <Link href={`/u/${u.username}`} className="min-w-0 flex-1 truncate font-semibold hover:underline hover:underline-offset-4">
                      {name} <span className="text-xs">{flag(u.country)}</span>
                    </Link>
                    {u.id === club.ownerId && <span className="chip">Owner</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
