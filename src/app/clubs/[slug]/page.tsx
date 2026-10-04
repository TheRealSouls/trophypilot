import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { flag } from "@/lib/countries";
import { isAdmin } from "@/lib/forum";
import { formatDate } from "@/lib/utils";
import { deleteClub, toggleClubMembership } from "@/actions/social";
import { ConfirmButton, SubmitButton } from "@/components/client";
import { loadFeed, PostList } from "@/components/community";
import { PostComposer } from "@/components/community-forms";
import { Avatar, PageHeader } from "@/components/ui";

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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title={club.name}>
          {club.description || "A club on TrophyPilot."}
          <span className="mt-1 block text-xs">
            {club._count.members} member{club._count.members === 1 ? "" : "s"} · started {formatDate(club.createdAt, { month: "short", year: "numeric" })} by{" "}
            <Link href={`/u/${club.owner.username}`} className="underline underline-offset-2">{club.owner.psn?.onlineId ?? club.owner.username}</Link>
          </span>
        </PageHeader>
        <div className="flex gap-2">
          {viewer && !isOwner && (
            <form action={toggleClubMembership}>
              <input type="hidden" name="clubId" value={club.id} />
              <SubmitButton className={member ? "btn-ghost" : "btn-primary"}>{member ? "Leave club" : "Join club"}</SubmitButton>
            </form>
          )}
          {!viewer && <Link href={`/login?next=/clubs/${club.slug}`} className="btn-primary">Log in to join</Link>}
          {(isOwner || isAdmin(viewer)) && (
            <form action={deleteClub}>
              <input type="hidden" name="clubId" value={club.id} />
              <ConfirmButton message={`Delete "${club.name}" and all of its updates?`}>Delete club</ConfirmButton>
            </form>
          )}
        </div>
      </div>

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
