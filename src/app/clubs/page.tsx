import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { cardClass } from "@/lib/profile-themes";
import { ProfileCardArt } from "@/components/ProfileCardArt";
import { plainText } from "@/lib/rich-text";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { formatNumber } from "@/lib/utils";
import { ClubForm } from "@/components/community-forms";
import { Avatar, EmptyState, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Clubs", description: "Groups of members around an interest: game collecting, online shooters, retro and more." };

export default async function ClubsPage() {
  const viewerId = await getSessionUserId();
  const clubs = await prisma.club.findMany({
    orderBy: [{ members: { _count: "desc" } }, { name: "asc" }],
    include: {
      _count: { select: { members: true, posts: true } },
      members: viewerId ? { where: { userId: viewerId }, select: { userId: true } } : false,
    },
  });

  return (
    <div>
      <PageHeader kicker="Community" title="Clubs">
        Groups around the things you&apos;re into. Join one to see and post its updates, or start your own.
      </PageHeader>
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          {clubs.length === 0 ? (
            <EmptyState title="No clubs yet">Start the first one: game collecting, online shooters, a series you love.</EmptyState>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {clubs.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/clubs/${c.slug}`}
                    className={clsx("card relative flex h-full flex-col gap-2 overflow-hidden p-4 hover:border-muted", cardClass(c.theme), c.theme && "pt-16")}
                  >
                    {c.theme && (
                      <span className="absolute inset-x-0 top-0 h-12 overflow-hidden" aria-hidden>
                        <ProfileCardArt card={c.theme} part="banner" />
                      </span>
                    )}
                    <div className="relative flex items-start justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <Avatar name={c.name} hue={c.name.length * 37} avatar={c.avatar} size={36} />
                        <h2 className="truncate font-semibold">{c.name}</h2>
                      </span>
                      {Array.isArray(c.members) && c.members.length > 0 && <span className="chip border-good/50 text-good">Joined</span>}
                    </div>
                    {c.description && <p className="line-clamp-3 text-sm text-muted">{plainText(c.description)}</p>}
                    <div className="mt-auto text-xs text-muted">
                      {formatNumber(c._count.members)} member{c._count.members === 1 ? "" : "s"} · {formatNumber(c._count.posts)} update
                      {c._count.posts === 1 ? "" : "s"}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <aside>
          <section className="card p-5">
            <h2 className="mb-4 font-bold">Start a club</h2>
            {viewerId ? (
              <ClubForm />
            ) : (
              <p className="text-sm text-muted">
                <Link href="/login?next=/clubs" className="link">Log in</Link> to start or join a club.
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
