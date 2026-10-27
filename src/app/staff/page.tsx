import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canSetRole, isAdmin, isOwner, MODERATOR_MAX_SUSPEND_DAYS, outranks, STAFF_BADGES, type Role } from "@/lib/roles";
import { ACTION_NAMES } from "@/lib/staff";
import { DEFAULT_FORUM_RULES } from "@/lib/forum-rules";
import { FORUM_RULES_KEY, getSetting } from "@/lib/site-settings";
import { formatNumber, timeAgo } from "@/lib/utils";
import { trophyHref } from "@/lib/trophy-slug";
import { reviewOnlineFlag, setRole, unsuspendMember } from "@/actions/staff";
import { SubmitButton } from "@/components/client";
import { LocalTime } from "@/components/LocalTime";
import { StaffBadge } from "@/components/StaffBadge";
import { Avatar, EmptyState, PageHeader } from "@/components/ui";
import { DeleteAccountForm, RulesForm, SuspendForm, WarnForm } from "./forms";

export const metadata: Metadata = { title: "Staff dashboard", robots: { index: false } };

type Tab = "overview" | "online" | "members" | "staff" | "rules" | "log";

/**
 * The staff dashboard. Moderators see the community tools (reports, online
 * flags, warnings and short suspensions); admins also manage moderators and
 * the forum rules; the owner also appoints admins and can delete accounts.
 */
export default async function StaffPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const me = await requireUser("/staff");
  if (!(me.role === "MODERATOR" || isAdmin(me))) notFound();
  const sp = await searchParams;
  const tabs: [Tab, string][] = [
    ["overview", "Overview"],
    ["online", "Online flags"],
    ["members", "Members"],
    ...(isAdmin(me) ? ([["staff", "Staff"], ["rules", "Forum rules"]] as [Tab, string][]) : []),
    ["log", "Audit log"],
  ];
  const tab = (tabs.find(([k]) => k === sp.tab)?.[0] ?? "overview") as Tab;
  const role = STAFF_BADGES[me.role]?.label ?? "Staff";

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader kicker={role} title={isOwner(me) ? "Owner dashboard" : isAdmin(me) ? "Admin dashboard" : "Moderation centre"}>
        {isOwner(me)
          ? "Full access: everything admins can do, plus appointing admins and deleting accounts."
          : isAdmin(me)
            ? "Manage members, moderators, content and the forum rules. Appointing admins and deleting accounts are for the owner."
            : "Review reports and online flags, warn members and give short suspensions. Site settings are for admins."}
      </PageHeader>
      <nav aria-label="Dashboard sections" className="mb-6 flex flex-wrap gap-1.5">
        {tabs.map(([k, l]) => (
          <Link key={k} href={`/staff?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={clsx("chip min-h-8 px-3", tab === k && "chip-active")}>
            {l}
          </Link>
        ))}
        <Link href="/reports" className="chip min-h-8 px-3">
          Reports and guide reviews
        </Link>
      </nav>

      {tab === "overview" && <Overview />}
      {tab === "online" && <OnlineFlags />}
      {tab === "members" && <Members me={me} q={sp.q ?? ""} />}
      {tab === "staff" && isAdmin(me) && <StaffList me={me} />}
      {tab === "rules" && isAdmin(me) && <RulesForm rules={(await getSetting(FORUM_RULES_KEY)) ?? DEFAULT_FORUM_RULES} />}
      {tab === "log" && <AuditLog />}
    </div>
  );
}

async function Overview() {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const [reports, guides, flags, members, newMembers, posts, suspended] = await Promise.all([
    prisma.report.count({ where: { status: "OPEN" } }),
    prisma.guide.count({ where: { status: "PENDING" } }),
    prisma.onlineFlag.count({ where: { status: "PENDING" } }),
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gt: weekAgo } } }),
    prisma.post.count({ where: { createdAt: { gt: weekAgo } } }),
    prisma.user.count({ where: { suspendedUntil: { gt: new Date() } } }),
  ]);
  const cards: [string, number, string?][] = [
    ["Open reports", reports, "/reports"],
    ["Guides waiting", guides, "/reports"],
    ["Online flags waiting", flags, "/staff?tab=online"],
    ["Members", members, "/staff?tab=members"],
    ["New members this week", newMembers],
    ["Updates this week", posts],
    ["Suspended now", suspended, "/staff?tab=members"],
  ];
  return (
    <div className="space-y-8">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map(([label, n, href]) => {
          const body = (
            <>
              <span className="block text-2xl font-bold tabular-nums">{formatNumber(n)}</span>
              <span className="text-xs text-muted">{label}</span>
            </>
          );
          return (
            <li key={label}>
              {href ? (
                <Link href={href} className="card block p-4 hover:border-line-strong">
                  {body}
                </Link>
              ) : (
                <div className="card p-4">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider">Recent staff actions</h2>
        <AuditLog take={10} />
      </section>
    </div>
  );
}

async function OnlineFlags() {
  const flags = await prisma.onlineFlag.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: 100,
    include: {
      user: { select: { username: true } },
      trophy: { select: { id: true, name: true, description: true, online: true, slug: true, game: { select: { slug: true, title: true } } } },
    },
  });
  if (!flags.length) return <EmptyState title="No online flags waiting">When members say a trophy needs online play, it shows up here.</EmptyState>;
  return (
    <ol className="space-y-3">
      {flags.map((f) => (
        <li key={f.id} className="card p-4">
          <div className="flex flex-wrap items-baseline gap-2 text-sm">
            <Link href={f.trophy.slug ? trophyHref(f.trophy.game.slug, f.trophy.slug) : `/trophies/${f.trophy.id}`} className="font-semibold underline underline-offset-2">
              {f.trophy.name}
            </Link>
            <span className="text-muted">{f.trophy.game.title}</span>
            <span className={clsx("chip", f.online ? "border-rare/50 text-rare" : "")}>{f.online ? "Says: needs online" : "Says: doesn't need online"}</span>
            <span className="ml-auto text-xs text-muted">
              by {f.user.username} · {timeAgo(f.createdAt)}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">{f.trophy.description}</p>
          {f.note && <p className="mt-2 text-sm">“{f.note}”</p>}
          <div className="mt-3 flex gap-2">
            {(["approve", "reject"] as const).map((d) => (
              <form key={d} action={reviewOnlineFlag}>
                <input type="hidden" name="flagId" value={f.id} />
                <input type="hidden" name="decision" value={d} />
                <SubmitButton className={d === "approve" ? "btn-primary px-3 py-1.5 text-xs" : "btn-ghost px-3 py-1.5 text-xs"}>
                  {d === "approve" ? (f.online ? "Approve: mark online" : "Approve: not online") : "Reject"}
                </SubmitButton>
              </form>
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}

type Me = { id: string; role: string };

async function Members({ me, q }: { me: Me; q: string }) {
  const needle = q.trim();
  const [found, suspended] = await Promise.all([
    needle
      ? prisma.user.findMany({
          where: { OR: [{ username: { contains: needle.toLowerCase() } }, { psn: { onlineId: { contains: needle, mode: "insensitive" } } }] },
          take: 10,
          select: memberSelect,
        })
      : [],
    prisma.user.findMany({ where: { suspendedUntil: { gt: new Date() } }, orderBy: { suspendedUntil: "asc" }, take: 50, select: memberSelect }),
  ]);
  return (
    <div className="space-y-8">
      <form action="/staff" className="flex gap-2" role="search">
        <input type="hidden" name="tab" value="members" />
        <label htmlFor="member-q" className="sr-only">
          Find a member
        </label>
        <input id="member-q" name="q" defaultValue={q} placeholder="Username or PSN ID" className="input max-w-sm" />
        <button className="btn-primary">Find</button>
      </form>
      {needle && (found.length ? <ul className="space-y-3">{found.map((u) => <MemberCard key={u.id} u={u} me={me} />)}</ul> : <EmptyState title={`No member matching "${needle}"`} />)}
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider">Suspended now ({suspended.length})</h2>
        {suspended.length ? (
          <ul className="space-y-3">
            {suspended.map((u) => (
              <MemberCard key={u.id} u={u} me={me} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Nobody is suspended.</p>
        )}
      </section>
    </div>
  );
}

const memberSelect = {
  id: true,
  username: true,
  role: true,
  createdAt: true,
  suspendedUntil: true,
  suspendReason: true,
  avatarHue: true,
  avatar: true,
  psn: { select: { onlineId: true, avatarUrl: true } },
  _count: { select: { reportsFiled: true, posts: true, forumPosts: true } },
} as const;

type MemberRow = Awaited<ReturnType<typeof prisma.user.findMany<{ select: typeof memberSelect }>>>[number];

function MemberCard({ u, me }: { u: MemberRow; me: Me }) {
  const name = u.psn?.onlineId ?? u.username;
  const suspended = u.suspendedUntil && u.suspendedUntil > new Date();
  const canAct = outranks(me, u);
  const roles = (["USER", "MODERATOR", "ADMIN"] as Role[]).filter((r) => r !== u.role && canSetRole(me, u, r));
  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={name} hue={u.avatarHue} url={u.psn?.avatarUrl} avatar={u.avatar} size={36} />
        <Link href={`/u/${u.username}`} className="font-semibold hover:underline hover:underline-offset-4">
          {name}
        </Link>
        <StaffBadge role={u.role} />
        <span className="text-xs text-muted">
          joined <LocalTime date={u.createdAt} /> · {u._count.posts + u._count.forumPosts} posts
        </span>
        {suspended && (
          <span className="chip border-bad/50 text-bad">
            Suspended until <LocalTime date={u.suspendedUntil!} />
          </span>
        )}
      </div>
      {suspended && u.suspendReason && <p className="mt-2 text-sm text-muted">Reason: {u.suspendReason}</p>}
      {canAct ? (
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          <WarnForm userId={u.id} username={name} />
          {suspended ? (
            <form action={unsuspendMember}>
              <input type="hidden" name="userId" value={u.id} />
              <span className="label">Suspension</span>
              <SubmitButton className="btn-ghost px-3 py-1.5 text-xs">Lift the suspension</SubmitButton>
            </form>
          ) : (
            <SuspendForm userId={u.id} username={name} maxDays={isAdmin(me) ? 365 : MODERATOR_MAX_SUSPEND_DAYS} />
          )}
          {roles.length > 0 && (
            <div>
              <span className="label">Role</span>
              <div className="flex flex-wrap gap-2">
                {roles.map((r) => (
                  <form key={r} action={setRole}>
                    <input type="hidden" name="userId" value={u.id} />
                    <input type="hidden" name="role" value={r} />
                    <SubmitButton className="btn-ghost px-3 py-1.5 text-xs">{r === "USER" ? "Remove from staff" : `Make ${STAFF_BADGES[r].label.toLowerCase()}`}</SubmitButton>
                  </form>
                ))}
              </div>
            </div>
          )}
          {isOwner(me) && <DeleteAccountForm userId={u.id} username={u.username} />}
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted">Staff at your level or above can only be managed by someone ranked higher.</p>
      )}
    </li>
  );
}

async function StaffList({ me }: { me: Me }) {
  const staff = await prisma.user.findMany({
    where: { role: { in: ["OWNER", "ADMIN", "MODERATOR"] } },
    orderBy: [{ role: "asc" }, { username: "asc" }],
    select: memberSelect,
  });
  const order = ["OWNER", "ADMIN", "MODERATOR"];
  staff.sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        {isOwner(me) ? "You can appoint and remove admins and moderators." : "You can appoint and remove moderators. Only the owner can appoint admins."} To
        appoint someone, find them on the <Link href="/staff?tab=members" className="link">Members</Link> tab.
      </p>
      <ul className="space-y-3">
        {staff.map((u) => (
          <MemberCard key={u.id} u={u} me={me} />
        ))}
      </ul>
    </div>
  );
}

async function AuditLog({ take = 100 }: { take?: number }) {
  const rows = await prisma.staffAction.findMany({ orderBy: { createdAt: "desc" }, take, include: { actor: { select: { username: true } } } });
  if (!rows.length) return <p className="text-sm text-muted">No staff actions yet.</p>;
  return (
    <ul className="card divide-y divide-line text-sm">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5">
          <span className="font-semibold">{r.actor?.username ?? "former staff"}</span>
          <span>{ACTION_NAMES[r.action] ?? r.action}</span>
          {r.detail && <span className="min-w-0 truncate text-muted">{r.detail}</span>}
          <span className="ml-auto text-xs text-muted">
            <LocalTime date={r.createdAt} />
          </span>
        </li>
      ))}
    </ul>
  );
}
