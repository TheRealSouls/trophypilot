import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { canViewProfile } from "@/lib/social";
import { getUserStats, type UserStats } from "@/lib/stats";
import { formatNumber } from "@/lib/utils";
import { GameArt } from "@/components/art";
import { TrophyCounts, TrophyIcon } from "@/components/TrophyIcon";
import { Avatar, EmptyState, PageHeader, ProgressBar, SectionTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Compare hunters", robots: { index: false } };

type Search = { a?: string; b?: string; show?: string };

type Loaded = NonNullable<Awaited<ReturnType<typeof loadUser>>>;
type SideResult = { username: string; missing: true } | { username: string; hidden: true } | { user: Loaded; stats: UserStats };

const loadUser = (username: string) =>
  prisma.user.findUnique({ where: { username: username.trim().toLowerCase() }, include: { psn: true } });

async function loadSide(username: string | undefined, viewerId: string | null): Promise<SideResult | null> {
  if (!username) return null;
  const user = await loadUser(username);
  if (!user) return { username, missing: true as const };
  if (!(await canViewProfile(viewerId, user))) return { username: user.username, hidden: true as const };
  return { user, stats: await getUserStats(user.id) };
}

export default async function ComparePage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const viewerId = await getSessionUserId();
  const me = viewerId ? await prisma.user.findUnique({ where: { id: viewerId }, select: { username: true } }) : null;
  const aName = sp.a ?? me?.username;
  const [a, b] = await Promise.all([loadSide(aName, viewerId), loadSide(sp.b, viewerId)]);

  const form = (
    <form action="/compare" className="card mb-8 grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <div>
        <label htmlFor="ca" className="label">
          Hunter
        </label>
        <input id="ca" name="a" defaultValue={aName} required placeholder="username" className="input" />
      </div>
      <div>
        <label htmlFor="cb" className="label">
          Compare with
        </label>
        <input id="cb" name="b" defaultValue={sp.b} required placeholder="username" className="input" />
      </div>
      <button className="btn-primary">Compare</button>
    </form>
  );

  const problem = [a, b].find((s) => s && !("user" in s));
  if (!a || !b || problem) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader kicker="Head to head" title="Compare hunters">
          Put two members side by side: levels, platinums, and progress on every game you both play.
        </PageHeader>
        {form}
        {problem && "missing" in problem && (
          <EmptyState title={`No member called ${problem.username}`}>
            Check the username. Only members with a linked PSN account have trophies to compare.
          </EmptyState>
        )}
        {problem && "hidden" in problem && (
          <EmptyState title={`${problem.username}'s profile isn't visible to you`}>
            Their trophies are private or friends only.
          </EmptyState>
        )}
      </div>
    );
  }
  if (!("user" in a) || !("user" in b)) return null;

  const show = sp.show === "all" ? "all" : "shared";
  const [aGames, bGames] = await Promise.all([
    prisma.userGame.findMany({ where: { userId: a.user.id }, include: { game: true } }),
    prisma.userGame.findMany({ where: { userId: b.user.id }, include: { game: true } }),
  ]);
  const bByGame = new Map(bGames.map((g) => [g.gameId, g]));
  const aByGame = new Map(aGames.map((g) => [g.gameId, g]));
  const shared = aGames.filter((g) => bByGame.has(g.gameId));
  const rows = (show === "all" ? [...aGames, ...bGames.filter((g) => !aByGame.has(g.gameId))] : shared)
    .map((g) => ({ game: g.game, a: aByGame.get(g.gameId), b: bByGame.get(g.gameId) }))
    .sort(
      (x, y) =>
        Math.max(y.a?.lastEarned?.getTime() ?? 0, y.b?.lastEarned?.getTime() ?? 0) -
        Math.max(x.a?.lastEarned?.getTime() ?? 0, x.b?.lastEarned?.getTime() ?? 0),
    );
  const aAhead = shared.filter((g) => g.progress > bByGame.get(g.gameId)!.progress).length;
  const bAhead = shared.filter((g) => bByGame.get(g.gameId)!.progress > g.progress).length;

  const nameA = a.user.psn?.onlineId ?? a.user.username;
  const nameB = b.user.psn?.onlineId ?? b.user.username;
  const qs = (o: Partial<Search>) =>
    `/compare?${new URLSearchParams({ a: a.user.username, b: b.user.username, ...o } as Record<string, string>)}`;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader kicker="Head to head" title={`${nameA} vs ${nameB}`} />
      {form}

      <section className="mb-10 grid border border-line bg-surface md:grid-cols-2">
        <Side user={a.user} stats={a.stats} />
        <Side user={b.user} stats={b.stats} className="border-t border-line md:border-l md:border-t-0" />
        <table className="w-full text-sm md:col-span-2">
          <tbody className="divide-y divide-line border-t border-line">
            <Row label="Trophy points" a={a.stats.points} b={b.stats.points} />
            <Row label="Platinums" a={a.stats.platinum} b={b.stats.platinum} />
            <Row label="Trophies" a={a.stats.total} b={b.stats.total} />
            <Row label="100% games" a={a.stats.completed} b={b.stats.completed} />
            <Row label="Ultra rares" a={a.stats.ultraRare} b={b.stats.ultraRare} />
            <Row label="Avg completion" a={a.stats.avgCompletion} b={b.stats.avgCompletion} suffix="%" />
            <Row label="Games ahead (shared)" a={aAhead} b={bAhead} />
          </tbody>
        </table>
      </section>

      <SectionTitle
        action={
          <div className="flex gap-1.5">
            <Link href={qs({ show: "shared" })} className={clsx("chip min-h-6", show === "shared" && "chip-active")}>
              Shared ({shared.length})
            </Link>
            <Link href={qs({ show: "all" })} className={clsx("chip min-h-6", show === "all" && "chip-active")}>
              All games
            </Link>
          </div>
        }
      >
        Games
      </SectionTitle>
      {rows.length === 0 ? (
        <EmptyState title="No games in common">
          Neither of you has synced a game the other plays. PS4 and PS5 versions count as different games because they have
          separate trophy lists.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {rows.map(({ game, a: ga, b: gb }) => (
            <li
              key={game.id}
              className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 py-3 sm:grid-cols-[auto_1fr_1fr_1fr]"
            >
              <GameArt
                title={game.title}
                hue={game.coverHue}
                iconUrl={game.iconUrl}
                size="sm"
                className="row-span-2 w-11 sm:row-span-1"
              />
              <Link
                href={`/games/${game.slug}`}
                className="min-w-0 truncate text-sm font-semibold hover:underline hover:underline-offset-4"
              >
                {game.title}
                <span className="ml-2 text-xs font-normal text-muted">{game.platforms.split(",").join(" / ")}</span>
              </Link>
              <div className="col-start-2 grid grid-cols-2 gap-4 sm:col-span-2 sm:col-start-3">
                <Progress g={ga} other={gb} />
                <Progress g={gb} other={ga} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type SideUser = { username: string; avatarHue: number; avatar: string | null; psn: { onlineId: string; avatarUrl: string | null } | null };

function Side({ user, stats, className }: { user: SideUser; stats: UserStats; className?: string }) {
  const name = user.psn?.onlineId ?? user.username;
  return (
    <div className={clsx("flex items-center gap-4 p-5", className)}>
      <Avatar name={name} hue={user.avatarHue} url={user.psn?.avatarUrl} avatar={user.avatar} size={64} className="border border-line" />
      <div className="min-w-0">
        <Link href={`/u/${user.username}`} className="block truncate text-lg font-bold hover:underline hover:underline-offset-4">
          {name}
        </Link>
        <div className="text-xs text-muted">
          Level {stats.level} · {formatNumber(stats.points)} pts
        </div>
        <TrophyCounts {...stats} size={14} className="mt-2 flex-wrap gap-3" />
      </div>
    </div>
  );
}

function Row({ label, a, b, suffix = "" }: { label: string; a: number; b: number; suffix?: string }) {
  return (
    <tr>
      <td className={clsx("w-1/3 px-5 py-2 text-right tabular-nums", a > b ? "font-bold text-text" : "text-muted")}>
        {formatNumber(a)}
        {suffix}
      </td>
      <td className="px-2 py-2 text-center text-xs uppercase tracking-wider text-muted">{label}</td>
      <td className={clsx("w-1/3 px-5 py-2 tabular-nums", b > a ? "font-bold text-text" : "text-muted")}>
        {formatNumber(b)}
        {suffix}
      </td>
    </tr>
  );
}

function Progress({ g, other }: { g?: { progress: number; hasPlatinum: boolean }; other?: { progress: number } }) {
  if (!g) return <span className="text-xs text-faint">Not played</span>;
  const ahead = !other || g.progress > other.progress;
  return (
    <div className="flex items-center gap-2">
      <ProgressBar value={g.progress} tone={g.progress === 100 ? "plat" : "accent"} className="flex-1" label="Completion" />
      <span className={clsx("w-10 text-right text-xs tabular-nums", ahead ? "font-bold text-text" : "text-muted")}>
        {g.progress}%
      </span>
      {g.hasPlatinum ? <TrophyIcon type="PLATINUM" size={14} /> : <span className="w-3.5" />}
    </div>
  );
}
