import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getFriendIds } from "@/lib/social";
import { flag } from "@/lib/countries";
import { pointsFor } from "@/lib/trophies";
import { formatNumber, timeAgo } from "@/lib/utils";
import { removeFriend, respondToRequest } from "@/actions/friends";
import { Avatar, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { TrophyIcon } from "@/components/TrophyIcon";
import { ConfirmButton, SubmitButton } from "@/components/client";
import { AddFriendForm } from "./AddFriendForm";

export const metadata: Metadata = { title: "Friends" };

export default async function FriendsPage() {
  const me = await requireUser("/friends");
  const [incoming, outgoing, ids] = await Promise.all([
    prisma.friendship.findMany({ where: { addresseeId: me.id, status: "PENDING" }, include: { requester: { include: { psn: true } } } }),
    prisma.friendship.findMany({ where: { requesterId: me.id, status: "PENDING" }, include: { addressee: { include: { psn: true } } } }),
    getFriendIds(me.id),
  ]);

  // Friend comparison table: aggregate each friend's trophies in one query.
  const all = [me.id, ...ids];
  const [users, sums, plats] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: all } }, include: { psn: true } }),
    prisma.userGame.groupBy({
      by: ["userId"],
      where: { userId: { in: all } },
      _sum: { earnedGold: true, earnedSilver: true, earnedBronze: true, earnedCount: true },
      _avg: { progress: true },
      _max: { lastEarned: true },
    }),
    prisma.userGame.groupBy({ by: ["userId"], where: { userId: { in: all }, hasPlatinum: true }, _count: true }),
  ]);
  const rows = users
    .map((u) => {
      const s = sums.find((x) => x.userId === u.id);
      const platinum = plats.find((x) => x.userId === u.id)?._count ?? 0;
      const visible = u.id === me.id || u.profileVisibility !== "PRIVATE";
      return {
        u,
        visible,
        platinum,
        total: s?._sum.earnedCount ?? 0,
        avg: Math.round(s?._avg.progress ?? 0),
        last: s?._max.lastEarned ?? null,
        points: pointsFor({ platinum, gold: s?._sum.earnedGold ?? 0, silver: s?._sum.earnedSilver ?? 0, bronze: s?._sum.earnedBronze ?? 0 }),
      };
    })
    .sort((a, b) => b.points - a.points);

  return (
    <div>
      <PageHeader kicker="Social" title="Friends">
        Compare progress, chase each other up the boards, and team up for online trophies.
      </PageHeader>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px] [&>*]:min-w-0">
        <section>
          <SectionTitle>Friends leaderboard</SectionTitle>
          {ids.length === 0 ? (
            <EmptyState title="No friends yet">Add hunters by username or PSN ID to compare trophies.</EmptyState>
          ) : (
            <div className="card overflow-x-auto" role="region" aria-label="Friends leaderboard table" tabIndex={0}>
              <table className="w-full min-w-[560px] text-sm">
                <thead className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-4 py-3 font-semibold">#</th>
                    <th className="px-4 py-3 font-semibold">Hunter</th>
                    <th className="px-4 py-3 text-right font-semibold">Points</th>
                    <th className="px-4 py-3 text-right font-semibold">Plats</th>
                    <th className="px-4 py-3 text-right font-semibold">Trophies</th>
                    <th className="px-4 py-3 text-right font-semibold">Avg %</th>
                    <th className="px-4 py-3 text-right font-semibold">Last trophy</th>
                    <th className="px-2 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r, i) => (
                    <tr key={r.u.id} className={r.u.id === me.id ? "bg-accent/10" : undefined}>
                      <td className="px-4 py-3 font-bold text-muted">{i + 1}</td>
                      <td className="px-4 py-3">
                        <Link href={`/u/${r.u.username}`} className="flex items-center gap-2.5 font-semibold hover:text-accent-text">
                          <Avatar name={r.u.psn?.onlineId ?? r.u.username} hue={r.u.avatarHue} url={r.u.psn?.avatarUrl} avatar={r.u.avatar} size={30} />
                          {r.u.psn?.onlineId ?? r.u.username} <span className="text-xs">{flag(r.u.country)}</span>
                          {r.u.id === me.id && <span className="chip">You</span>}
                        </Link>
                      </td>
                      {r.visible ? (
                        <>
                          <td className="px-4 py-3 text-right tabular-nums">{formatNumber(r.points)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            <span className="inline-flex items-center gap-1"><TrophyIcon type="PLATINUM" size={14} />{r.platinum}</span>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">{formatNumber(r.total)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{r.avg}%</td>
                          <td className="px-4 py-3 text-right text-muted">{r.last ? timeAgo(r.last) : "n/a"}</td>
                        </>
                      ) : (
                        <td colSpan={5} className="px-4 py-3 text-right text-muted">Private profile</td>
                      )}
                      <td className="px-2 py-3">
                        {r.u.id !== me.id && (
                          <form action={removeFriend}>
                            <input type="hidden" name="userId" value={r.u.id} />
                            <ConfirmButton message={`Remove ${r.u.username} from friends?`} className="text-xs text-faint hover:text-bad">
                              Remove
                            </ConfirmButton>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-3 font-bold">Add a friend</h2>
            <AddFriendForm />
          </section>

          <section className="card p-5">
            <h2 className="mb-3 font-bold">Requests {incoming.length > 0 && <span className="chip ml-1">{incoming.length}</span>}</h2>
            {incoming.length === 0 && <p className="text-sm text-muted">No pending requests.</p>}
            <ul className="space-y-3">
              {incoming.map((r) => (
                <li key={r.id} className="flex items-center gap-3">
                  <Avatar name={r.requester.username} hue={r.requester.avatarHue} avatar={r.requester.avatar} size={34} />
                  <Link href={`/u/${r.requester.username}`} className="min-w-0 flex-1 truncate text-sm font-semibold hover:text-accent-text">
                    {r.requester.psn?.onlineId ?? r.requester.username}
                  </Link>
                  <form action={respondToRequest}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="accept" value="1" />
                    <SubmitButton className="btn-primary px-3 py-1 text-xs">Accept</SubmitButton>
                  </form>
                  <form action={respondToRequest}>
                    <input type="hidden" name="id" value={r.id} />
                    <SubmitButton className="btn-ghost px-3 py-1 text-xs">Decline</SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
            {outgoing.length > 0 && (
              <>
                <h3 className="label mt-5">Sent</h3>
                <ul className="space-y-1 text-sm text-muted">
                  {outgoing.map((r) => (
                    <li key={r.id}>
                      <Link href={`/u/${r.addressee.username}`} className="hover:text-text">
                        {r.addressee.psn?.onlineId ?? r.addressee.username}
                      </Link>{" "}
                      · {timeAgo(r.createdAt)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
