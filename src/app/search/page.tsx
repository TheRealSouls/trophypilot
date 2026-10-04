import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import clsx from "clsx";
import { prisma } from "@/lib/db";
import { trophyHref } from "@/lib/trophy-slug";
import { flag } from "@/lib/countries";
import { familiesFor } from "@/lib/games";
import { searchPsnPlayers } from "@/lib/psn/lookup";
import { isDemoMode } from "@/lib/psn/sync";
import { rateLimit } from "@/lib/rate-limit";
import { SITE } from "@/lib/site";
import { formatDate } from "@/lib/utils";
import { GameArt } from "@/components/art";
import { TrophyIcon } from "@/components/TrophyIcon";
import { SpoilerName } from "@/components/client";
import { Avatar, EmptyState, Notice, PageHeader, RarityBadge, Skeleton, SkeletonRegion } from "@/components/ui";

export const metadata: Metadata = { title: "Search" };

const TYPES = {
  all: "All",
  games: "Games",
  players: "PSN players",
  users: "Members",
  trophies: "Trophies",
  guides: "Guides",
  sessions: "Sessions",
} as const;
type SearchType = keyof typeof TYPES;

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const type: SearchType = sp.type && sp.type in TYPES ? (sp.type as SearchType) : "all";
  const want = (t: SearchType) => type === "all" || type === t;
  const take = type === "all" ? 6 : 50;
  const psnLive = !isDemoMode();

  const [games, trophies, users, guides, sessions] = q
    ? await Promise.all([
        want("games")
          ? prisma.game.findMany({
              where: { OR: [{ title: { contains: q, mode: "insensitive" } }, { developer: { contains: q, mode: "insensitive" } }, { publisher: { contains: q, mode: "insensitive" } }] },
              // PSN has a separate trophy list per platform and region; show each game once.
              distinct: ["titleKey"],
              take,
              orderBy: [{ userGames: { _count: "desc" } }, { npServiceName: "desc" }, { title: "asc" }],
            })
          : [],
        want("trophies")
          ? prisma.trophy.findMany({
              // Hidden trophies only match on their exact name, so search doesn't leak spoilers.
              where: {
                OR: [
                  { hidden: false, OR: [{ name: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] },
                  { hidden: true, name: q },
                ],
              },
              take,
              include: { game: true },
              orderBy: { earnedRate: { sort: "asc", nulls: "last" } },
            })
          : [],
        want("users")
          ? prisma.user.findMany({
              where: { OR: [{ username: { contains: q.toLowerCase(), mode: "insensitive" } }, { psn: { onlineId: { contains: q, mode: "insensitive" } } }] },
              take,
              include: { psn: true, _count: { select: { games: { where: { hasPlatinum: true } } } } },
            })
          : [],
        want("guides")
          ? prisma.guide.findMany({
              where: { OR: [{ title: { contains: q, mode: "insensitive" } }, { summary: { contains: q, mode: "insensitive" } }, { game: { title: { contains: q, mode: "insensitive" } } }] },
              take,
              include: { game: true, author: true },
              orderBy: { views: "desc" },
            })
          : [],
        want("sessions")
          ? prisma.session.findMany({
              where: {
                startsAt: { gte: new Date() },
                OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }, { game: { title: { contains: q, mode: "insensitive" } } }],
              },
              take,
              include: { game: true, _count: { select: { members: true } } },
              orderBy: { startsAt: "asc" },
            })
          : [],
      ])
    : [[], [], [], [], []];

  const families = await familiesFor(games.map((g) => g.titleKey));
  const localTotal = games.length + trophies.length + users.length + guides.length + sessions.length;
  const showPsn = !!q && want("players") && q.length >= 3;
  const tabHref = (t: string) => `/search?${new URLSearchParams({ q, type: t })}`;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Search" />
      <form action="/search" className="mb-4 flex gap-2" role="search">
        <label htmlFor="q" className="sr-only">
          Search
        </label>
        <input
          id="q"
          name="q"
          defaultValue={q}
          autoFocus
          placeholder="Game, PSN Online ID, trophy, guide"
          className="input py-2.5"
        />
        <input type="hidden" name="type" value={type} />
        <button className="btn-primary px-6">Search</button>
      </form>
      <div className="mb-8 flex flex-wrap gap-2">
        {Object.entries(TYPES).map(([k, l]) => (
          <Link key={k} href={tabHref(k)} className={clsx("chip min-h-6", type === k && "chip-active")}>
            {l}
          </Link>
        ))}
      </div>

      {!q ? (
        <EmptyState title="What are you hunting?">
          Search games, trophies, guides and sessions on {SITE.name}, or type a PSN Online ID to look up any public player.
        </EmptyState>
      ) : (
        <div className="space-y-10">
          {showPsn && (
            <Suspense fallback={<PsnSkeleton />}>
              <PsnPlayers
                q={q}
                live={psnLive}
                limit={type === "all" ? 6 : 12}
                more={type === "all" ? tabHref("players") : undefined}
              />
            </Suspense>
          )}

          <ResultGroup
            title="Games"
            show={games.length > 0}
            more={type === "all" && games.length === take ? tabHref("games") : undefined}
          >
            <ul className="divide-y divide-line border-y border-line">
              {games.map((g) => {
                const family = families.get(g.titleKey);
                return (
                  <li key={g.id}>
                    <Link href={`/games/${g.slug}`} className="group flex items-center gap-3 py-2.5">
                      <GameArt title={g.title} hue={g.coverHue} iconUrl={g.iconUrl} size="sm" className="w-11" />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold group-hover:underline group-hover:underline-offset-4">
                          {g.title}
                        </div>
                        <div className="text-xs text-muted">
                          {(family?.platforms ?? g.platforms.split(",")).join(" / ")}
                          {family && family.lists > 1 && ` · ${family.lists} trophy lists`}
                          {g.releaseDate && ` · ${formatDate(g.releaseDate, { year: "numeric" })}`}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </ResultGroup>

          {want("games") && games.length === 0 && (type === "games" || localTotal === 0) && (
            <p className="text-sm text-muted">
              No games match &quot;{q}&quot;.{" "}
              {psnLive
                ? "The catalogue grows from PSN: a game appears once a member syncs it or someone looks up a player who owns it."
                : "This server is in demo mode, so the catalogue only has fictional demo games."}
            </p>
          )}

          <ResultGroup
            title="Members"
            show={users.length > 0}
            more={type === "all" && users.length === take ? tabHref("users") : undefined}
          >
            <ul className="divide-y divide-line border-y border-line">
              {users.map((u) => (
                <li key={u.id}>
                  <Link href={`/u/${u.username}`} className="group flex items-center gap-3 py-2.5">
                    <Avatar name={u.psn?.onlineId ?? u.username} hue={u.avatarHue} url={u.psn?.avatarUrl} avatar={u.avatar} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold group-hover:underline group-hover:underline-offset-4">
                        {u.psn?.onlineId ?? u.username} {flag(u.country)}
                      </div>
                      <div className="text-xs text-muted">@{u.username}</div>
                    </div>
                    {u.profileVisibility === "PUBLIC" && (
                      <span className="inline-flex items-center gap-1 text-sm">
                        <TrophyIcon type="PLATINUM" size={14} />
                        {u._count.games}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </ResultGroup>

          <ResultGroup
            title="Trophies"
            show={trophies.length > 0}
            more={type === "all" && trophies.length === take ? tabHref("trophies") : undefined}
          >
            <ul className="divide-y divide-line border-y border-line">
              {trophies.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2.5">
                  <TrophyIcon type={t.type} size={22} />
                  <div className="min-w-0 flex-1">
                    <SpoilerName hidden={t.hidden}>
                      <Link href={t.slug ? trophyHref(t.game.slug, t.slug) : `/trophies/${t.id}`} className="block truncate text-sm font-semibold hover:underline hover:underline-offset-4">
                        {t.name}
                      </Link>
                      <span className="block truncate text-xs text-muted">{t.description}</span>
                    </SpoilerName>
                    <div className="truncate text-xs text-muted">{t.game.title}</div>
                  </div>
                  <RarityBadge rate={t.earnedRate} />
                </li>
              ))}
            </ul>
          </ResultGroup>

          <ResultGroup
            title="Guides"
            show={guides.length > 0}
            more={type === "all" && guides.length === take ? tabHref("guides") : undefined}
          >
            <ul className="divide-y divide-line border-y border-line">
              {guides.map((g) => (
                <li key={g.id}>
                  <Link href={`/guides/${g.slug}`} className="group block py-3">
                    <div className="text-xs uppercase tracking-wider text-accent-text">{g.game.title}</div>
                    <div className="text-sm font-semibold group-hover:underline group-hover:underline-offset-4">{g.title}</div>
                    <div className="line-clamp-1 text-xs text-muted">{g.summary}</div>
                  </Link>
                </li>
              ))}
            </ul>
          </ResultGroup>

          <ResultGroup
            title="Sessions"
            show={sessions.length > 0}
            more={type === "all" && sessions.length === take ? tabHref("sessions") : undefined}
          >
            <ul className="divide-y divide-line border-y border-line">
              {sessions.map((s) => (
                <li key={s.id}>
                  <Link href={`/sessions/${s.id}`} className="group flex items-center justify-between gap-3 py-3">
                    <div>
                      <div className="text-sm font-semibold group-hover:underline group-hover:underline-offset-4">{s.title}</div>
                      <div className="text-xs text-muted">
                        {s.game.title} · {s.platform}
                      </div>
                    </div>
                    <div className="text-right text-xs">
                      <div>
                        {formatDate(s.startsAt, {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                      <div className="text-muted">
                        {s._count.members}/{s.slots} joined
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </ResultGroup>

          {localTotal === 0 && !showPsn && (
            <EmptyState title={`Nothing found for "${q}"`}>Try a shorter search or a different category.</EmptyState>
          )}
        </div>
      )}
    </div>
  );
}

async function PsnPlayers({ q, live, limit, more }: { q: string; live: boolean; limit: number; more?: string }) {
  if (!live) {
    return (
      <ResultGroup title="PSN players" show>
        <p className="text-sm text-muted">
          Live PSN lookups are off because this server is running in demo mode. Only members who have joined {SITE.name} are
          searchable.
        </p>
      </ResultGroup>
    );
  }
  if (!(await rateLimit("psn-search", 30, 10 * 60_000))) {
    return (
      <ResultGroup title="PSN players" show>
        <Notice tone="warn">You&apos;re searching PSN very quickly. Wait a few minutes before trying again.</Notice>
      </ResultGroup>
    );
  }

  const res = await searchPsnPlayers(q);
  if (!res.ok) {
    return (
      <ResultGroup title="PSN players" show>
        <Notice tone="warn">PlayStation Network didn&apos;t answer this time, so live player results are missing.</Notice>
      </ResultGroup>
    );
  }
  const hiddenIds = new Set(
    (
      await prisma.psnPlayer.findMany({
        where: { hidden: true, accountId: { in: res.data.map((p) => p.accountId) } },
        select: { accountId: true },
      })
    ).map((h) => h.accountId),
  );
  const visible = res.data.filter((p) => !hiddenIds.has(p.accountId));
  const players = visible.slice(0, limit);
  if (players.length === 0) {
    return (
      <ResultGroup title="PSN players" show>
        <p className="text-sm text-muted">No PSN player matches &quot;{q}&quot;. Online IDs are exact, including underscores.</p>
      </ResultGroup>
    );
  }

  const members = await prisma.psnAccount.findMany({
    where: { accountId: { in: players.map((p) => p.accountId) }, verified: true },
    select: { accountId: true, user: { select: { username: true } } },
  });
  const memberOf = new Map(members.map((m) => [m.accountId, m.user.username]));

  return (
    <ResultGroup title="PSN players" show more={more && visible.length > limit ? more : undefined}>
      <ul className="grid gap-px border border-line bg-line sm:grid-cols-2">
        {players.map((p) => {
          const username = memberOf.get(p.accountId);
          return (
            <li key={p.accountId} className="bg-bg">
              <Link
                href={username ? `/u/${username}` : `/psn/${encodeURIComponent(p.onlineId)}`}
                className="group flex items-center gap-3 p-3 hover:bg-surface"
              >
                <Avatar name={p.onlineId} hue={0} url={p.avatarUrl} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold group-hover:underline group-hover:underline-offset-4">
                    {p.onlineId}
                  </div>
                  <div className="text-xs text-muted">
                    {username ? `Member @${username}` : "View PSN profile"}
                    {p.isPlus && " · PS Plus"}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </ResultGroup>
  );
}

function PsnSkeleton() {
  return (
    <SkeletonRegion label="Searching PlayStation Network">
      <div className="mb-3 flex items-end justify-between border-b border-line pb-2">
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="grid gap-px border border-line bg-line sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 bg-bg p-3">
            <Skeleton className="h-11 w-11" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </SkeletonRegion>
  );
}

function ResultGroup({
  title,
  show,
  more,
  children,
}: {
  title: string;
  show: boolean;
  more?: string;
  children: React.ReactNode;
}) {
  if (!show) return null;
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between border-b border-line pb-2">
        <h2 className="text-sm font-bold uppercase tracking-wider">{title}</h2>
        {more && (
          <Link href={more} className="link text-xs">
            See all
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
