import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { reputations } from "@/lib/community";
import { flag } from "@/lib/countries";
import { FORUM_TABS } from "@/lib/forum";
import { formatDate } from "@/lib/utils";
import { Avatar, EmptyState, PageHeader, TabLinks } from "@/components/ui";

export const metadata: Metadata = { title: "Forum staff", description: "The people who look after the forums." };

export default async function ForumStaffPage() {
  const [staff, viewerId] = await Promise.all([
    prisma.user.findMany({
      where: { role: "ADMIN" },
      orderBy: { createdAt: "asc" },
      select: { id: true, username: true, country: true, avatarHue: true, avatar: true, createdAt: true, psn: { select: { onlineId: true, avatarUrl: true } } },
    }),
    getSessionUserId(),
  ]);
  const rep = await reputations(staff.map((s) => s.id));

  return (
    <div>
      <PageHeader kicker="Community" title="Forum staff">
        The people who keep the forums tidy. Message one of them if a post breaks the rules or you need a hand.
      </PageHeader>
      <div className="mb-6">
        <TabLinks tabs={FORUM_TABS} active="staff" />
      </div>
      {staff.length === 0 ? (
        <EmptyState title="No staff listed yet" />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {staff.map((s) => {
            const name = s.psn?.onlineId ?? s.username;
            return (
              <li key={s.id} className="card flex items-center gap-4 p-4">
                <Avatar name={name} hue={s.avatarHue} url={s.psn?.avatarUrl} avatar={s.avatar} size={52} />
                <div className="min-w-0 flex-1">
                  <Link href={`/u/${s.username}`} className="block truncate font-semibold hover:underline hover:underline-offset-4">
                    {name} <span className="text-xs">{flag(s.country)}</span>
                  </Link>
                  <div className="text-xs text-muted">
                    Admin · {rep.get(s.id)?.counts.threads ?? 0} threads · joined {formatDate(s.createdAt, { month: "short", year: "numeric" })}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Link href={`/forums/user/${s.username}`} className="chip hover:text-text">Posts</Link>
                    {viewerId && viewerId !== s.id && (
                      <Link href={`/messages?to=${s.username}`} className="chip hover:text-text">Message</Link>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
