import Link from "next/link";
import { plainText } from "@/lib/rich-text";
import { Suspense } from "react";
import { DeletedNotice, HomeCta } from "@/components/HomeAccount";
import { prisma } from "@/lib/db";
import { trophyHref } from "@/lib/trophy-slug";
import { getLeaderboard } from "@/lib/leaderboard";
import { formatDate, formatNumber, timeAgo } from "@/lib/utils";
import { flag } from "@/lib/countries";
import { GameArt } from "@/components/art";
import { GameCard } from "@/components/GameCard";
import { TrophyIcon } from "@/components/TrophyIcon";
import { HeroCovers } from "@/components/HeroCovers";
import { SpoilerName } from "@/components/client";
import { Avatar, MoreLink, Panel, RarityBadge } from "@/components/ui";
import {
  BookIcon,
  ChartIcon,
  FlameIcon,
  GamepadIcon,
  SearchIcon,
  StackIcon,
  UsersIcon,
} from "@/components/icons";
import { SITE } from "@/lib/site";
import { Tabs } from "@/components/Tabs";
import {
  gamesNeedingGuides,
  heroCovers,
  latestPlatinums,
  latestSessions,
  newDlc,
  newTrophyLists,
  siteTotals,
  trendingGameIds,
} from "@/lib/activity";
import { familiesFor } from "@/lib/games";

// The same page for everyone, rebuilt in the background at most once a minute. The parts that depend on
// who's looking (navbar, main button, notices) fill in on the client.
export const revalidate = 60;

const publicActivity = { showActivity: true, profileVisibility: "PUBLIC" } as const;
// leading-6 keeps each row link at least 24px tall (WCAG 2.2 target size).
const rowLink = "block truncate text-sm font-semibold leading-6 hover:underline hover:underline-offset-4";

export default async function Home() {
  const monthAgo = new Date(Date.now() - 30 * 86_400_000);

  const [totals, recentPlats, rareUnlocks, weekly, guides, trending, needGuides, newLists, dlcs, sessions, covers, weeklyPlats, topCompletion, topRare, threads] = await Promise.all([
    siteTotals(),
    latestPlatinums(6),
    // The newest unlocks of any rarity, from members who share their activity.
    prisma.userTrophy.findMany({
      where: { user: publicActivity },
      orderBy: { earnedAt: "desc" },
      take: 6,
      include: { user: { include: { psn: true } }, trophy: { include: { game: true } } },
    }),
    getLeaderboard({ metric: "points", period: "weekly", scope: "global", limit: 5 }),
    prisma.guide.findMany({ where: { status: "PUBLISHED" }, orderBy: { createdAt: "desc" }, take: 4, include: { game: true, author: true } }),
    trendingGameIds(monthAgo, 24),
    gamesNeedingGuides(5),
    newTrophyLists(8),
    newDlc(8),
    latestSessions(10),
    heroCovers(24),
    getLeaderboard({ metric: "platinums", period: "weekly", scope: "global", limit: 5 }),
    getLeaderboard({ metric: "completion", period: "all", scope: "global", limit: 5 }),
    getLeaderboard({ metric: "rare", period: "all", scope: "global", limit: 5 }),
    prisma.forumThread.findMany({ orderBy: { lastPostAt: "desc" }, take: 6, select: { id: true, title: true, postCount: true, lastPostAt: true, game: { select: { title: true } } } }),
  ]);
  const listFamilies = await familiesFor(newLists.map((g) => g.titleKey));
  const { games: gameCount, trophies: trophyCount, platinums: platCount } = totals;

  const trendingGames = await prisma.game.findMany({
    where: { id: { in: trending } },
    include: { trophies: { where: { type: "PLATINUM" }, select: { earnedRate: true } } },
  });
  // One card per game: a game's regional and PS4/PS5 lists count as one.
  const seenKeys = new Set<string>();
  const trendingSorted = trending
    .map((id) => trendingGames.find((g) => g.id === id))
    .filter((g): g is (typeof trendingGames)[number] => !!g)
    .filter((g) => {
      const key = g.titleKey || g.id;
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    })
    .slice(0, 6);

  return (
    <div className="space-y-8">
      <Suspense>
        <DeletedNotice />
      </Suspense>

      {/* Hero: text on the left, real game art behind the lookup card on the right. */}
      <section className="relative -mt-8 grid gap-10 pb-6 pt-10 lg:min-h-[470px] lg:grid-cols-[1.1fr_1fr] lg:items-end">
        <HeroCovers covers={covers} />
        <div className="relative lg:self-center">
          <p className="mb-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-accent-text">
            For PlayStation trophy hunters
            <span className="h-px w-10 bg-accent" aria-hidden />
          </p>
          <h1 className="max-w-2xl text-4xl font-extrabold leading-[1.04] tracking-tight sm:text-5xl xl:text-[3.6rem]">
            Your trophies,
            <br />
            your platinums,
            <br />
            <span className="text-accent">and the people chasing the same ones.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
            Sync your PSN trophy list, plan a platinum with a community roadmap that flags the missables, and see where you rank
            in the world, your country and your friends list.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <HomeCta />
            <Link href="/games" className="btn-ghost px-5 py-3 text-[15px]">
              <GamepadIcon size={18} />
              Browse games
            </Link>
          </div>
          <p className="mt-8 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
            <span>
              <strong className="font-semibold text-text">{formatNumber(gameCount)}</strong> games tracked
            </span>
            <span aria-hidden>·</span>
            <span>
              <strong className="font-semibold text-text">{formatNumber(trophyCount)}</strong> trophies earned
            </span>
            <span aria-hidden>·</span>
            <span>
              <strong className="font-semibold text-text">{formatNumber(platCount)}</strong> platinums
            </span>
          </p>
        </div>

        <form action="/psn" role="search" className="relative rounded-xl border border-line bg-surface p-5 shadow-[var(--shadow-raised)] lg:mb-2">
          <label htmlFor="psn-id" className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide">
            <UsersIcon size={18} />
            Look up any PSN profile
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <SearchIcon size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <input
                id="psn-id"
                name="id"
                required
                placeholder="PSN Online ID"
                autoComplete="off"
                spellCheck={false}
                className="input py-2.5 pl-10 text-[15px]"
              />
            </div>
            <button className="btn-primary px-5 text-[15px]">Look up</button>
          </div>
          <p className="mt-3 text-sm text-muted">
            See any public player&apos;s avatar, level and recent games, even if they haven&apos;t joined {SITE.name} yet.
          </p>
        </form>
      </section>

      {/* Four tabbed panels instead of eight separate boxes: the same features with far less scrolling. */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Latest trophy lists" icon={<StackIcon />} action={<MoreLink href="/games">All games</MoreLink>}>
          <Tabs
            label="Latest trophy lists"
            tabs={[
              {
                key: "games",
                label: "New games",
                content: (
                  <ul className="divide-y divide-line">
                    {newLists.map((g) => {
                      const platforms = listFamilies.get(g.titleKey)?.platforms ?? g.platforms.split(",");
                      const loaded = Object.keys(g.counts).length > 0;
                      return (
                        <li key={g.id} className="flex items-center gap-3 py-3">
                          <GameArt title={g.title} hue={g.coverHue} iconUrl={g.iconUrl} size="sm" className="w-11 rounded-md" />
                          <div className="min-w-0 flex-1">
                            <Link href={`/games/${g.slug}`} className={rowLink}>
                              {g.title}
                            </Link>
                            <div className="truncate text-xs text-muted">{platforms.join(" · ")}</div>
                          </div>
                          {loaded ? (
                            <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums text-muted">
                              {(["PLATINUM", "GOLD", "SILVER", "BRONZE"] as const).map((t) =>
                                g.counts[t] ? (
                                  <span key={t} className="inline-flex items-center gap-0.5">
                                    <TrophyIcon type={t} size={13} />
                                    {g.counts[t]}
                                  </span>
                                ) : null,
                              )}
                            </span>
                          ) : g.total ? (
                            <span className="shrink-0 text-xs tabular-nums text-muted">{g.total} trophies</span>
                          ) : null}
                        </li>
                      );
                    })}
                    {newLists.length === 0 && <li className="py-4 text-sm text-muted">No trophy lists yet.</li>}
                  </ul>
                ),
              },
              {
                key: "dlc",
                label: "New DLC",
                content: (
                  <ul className="divide-y divide-line">
                    {dlcs.map((d) => (
                      <li key={d.id} className="flex items-center gap-3 py-3">
                        <GameArt title={d.name} hue={d.game.coverHue} iconUrl={d.iconUrl ?? d.game.iconUrl} size="sm" className="w-11 rounded-md" />
                        <div className="min-w-0 flex-1">
                          <Link href={`/games/${d.game.slug}/dlc/${d.psnGroupId}`} className={rowLink}>
                            {d.name}
                          </Link>
                          <div className="truncate text-xs text-muted">
                            {d.game.title} · {d.game.platforms.split(",").join(" · ")}
                          </div>
                        </div>
                        {d.addedLater && <span className="chip border-accent-text/50 text-accent-text">New</span>}
                        <span className="shrink-0 text-xs tabular-nums text-muted">{d._count.trophies} trophies</span>
                      </li>
                    ))}
                    {dlcs.length === 0 && <li className="py-4 text-sm text-muted">No DLC trophy packs yet.</li>}
                  </ul>
                ),
              },
            ]}
          />
        </Panel>

        <Panel title="Latest guides" icon={<BookIcon />} action={<MoreLink href="/guides">All guides</MoreLink>}>
          {guides.length > 0 ? (
            <ul className="divide-y divide-line">
              {guides.map((g) => (
                <li key={g.id}>
                  <Link href={`/guides/${g.slug}`} className="group flex gap-4 py-3">
                    <GameArt title={g.game.title} hue={g.game.coverHue} iconUrl={g.game.iconUrl} size="sm" className="w-12 rounded-md" />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold group-hover:underline group-hover:underline-offset-4">{g.title}</div>
                      <div className="line-clamp-2 text-xs text-muted">{plainText(g.summary)}</div>
                      <div className="mt-1 text-xs text-faint">
                        by {g.author.username} · {timeAgo(g.createdAt)}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="py-4 text-sm">
              <p className="text-muted">
                No guides yet. Guides are written by members, so the first ones are up for grabs.
                {needGuides.length > 0 && " These games have the most players and no guide:"}
              </p>
              {needGuides.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {needGuides.map(({ game, players }) => (
                    <li key={game.id} className="flex items-center gap-3">
                      <GameArt title={game.title} hue={game.coverHue} iconUrl={game.iconUrl} size="sm" className="w-8 rounded-md" />
                      <Link href={`/games/${game.slug}`} className="min-w-0 flex-1 truncate hover:underline hover:underline-offset-4">
                        {game.title}
                      </Link>
                      <span className="text-xs text-faint">{players} players</span>
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/guides/new" className="btn-ghost mt-4">
                Write a guide
              </Link>
            </div>
          )}
        </Panel>

        <Panel title="Top players" icon={<ChartIcon />} action={<MoreLink href="/leaderboards">Leaderboards</MoreLink>}>
          <Tabs
            label="Top players"
            tabs={[
              { key: "points", label: "This week", content: <Board rows={weekly} value={(r) => `${formatNumber(r.points)} pts`} empty="Nobody has earned a trophy yet this week." /> },
              { key: "plats", label: "Platinums", content: <Board rows={weeklyPlats} value={(r) => `${formatNumber(r.platinums)} plat${r.platinums === 1 ? "" : "s"}`} empty="No platinums yet this week." /> },
              { key: "completion", label: "Average %", content: <Board rows={topCompletion} value={(r) => (r.completion != null ? `${r.completion}%` : "–")} empty="Not enough players ranked yet." /> },
              { key: "rare", label: "Ultra rare", content: <Board rows={topRare} value={(r) => (r.rare != null ? formatNumber(r.rare) : "–")} empty="Not enough players ranked yet." /> },
            ]}
          />
        </Panel>

        <Panel title="Community activity" icon={<UsersIcon />} action={<MoreLink href="/community">Community</MoreLink>}>
          <Tabs
            label="Community activity"
            tabs={[
              {
                key: "plats",
                label: "Platinums",
                content:
                  recentPlats.length === 0 ? (
                    <p className="py-4 text-sm text-muted">No platinums yet. They appear as players link their accounts or get tracked.</p>
                  ) : (
                    <ul className="divide-y divide-line">
                      {recentPlats.map((p) => (
                        <li key={p.key} className="flex items-center gap-3 py-3">
                          <GameArt title={p.game.title} hue={p.game.coverHue} iconUrl={p.game.iconUrl} size="sm" className="w-11 rounded-md" />
                          <div className="min-w-0 flex-1">
                            <Link href={`/games/${p.game.slug}`} className={rowLink}>
                              {p.game.title}
                            </Link>
                            <div className="truncate text-xs text-muted">
                              <Link href={p.player.href} className="hover:text-text">
                                {p.player.name}
                              </Link>{" "}
                              {flag(p.player.country)} · {timeAgo(p.at)}
                            </div>
                          </div>
                          <TrophyIcon type="PLATINUM" size={22} />
                        </li>
                      ))}
                    </ul>
                  ),
              },
              {
                key: "trophies",
                label: "Trophies",
                content: (
                  <ul className="divide-y divide-line">
                    {rareUnlocks.map((u) => (
                      <li key={u.id} className="flex items-center gap-3 py-3">
                        <TrophyIcon type={u.trophy.type} size={22} />
                        <div className="min-w-0 flex-1">
                          <SpoilerName hidden={u.trophy.hidden}>
                            <Link href={u.trophy.slug ? trophyHref(u.trophy.game.slug, u.trophy.slug) : `/trophies/${u.trophy.id}`} className={rowLink}>
                              {u.trophy.name}
                            </Link>
                          </SpoilerName>
                          <div className="truncate text-xs text-muted">
                            <Link href={`/u/${u.user.username}`} className="hover:text-text">
                              {u.user.psn?.onlineId ?? u.user.username}
                            </Link>{" "}
                            · {u.trophy.game.title} · {timeAgo(u.earnedAt)}
                          </div>
                        </div>
                        <RarityBadge rate={u.trophy.earnedRate} />
                      </li>
                    ))}
                    {rareUnlocks.length === 0 && <li className="py-4 text-sm text-muted">No trophies unlocked by members yet.</li>}
                  </ul>
                ),
              },
              {
                key: "threads",
                label: "Discussions",
                content: (
                  <ul className="divide-y divide-line">
                    {threads.map((t) => (
                      <li key={t.id} className="py-3">
                        <Link href={`/forums/thread/${t.id}`} className={rowLink}>
                          {t.title}
                        </Link>
                        <div className="truncate text-xs text-muted">
                          {t.game ? `${t.game.title} · ` : ""}
                          {Math.max(0, t.postCount - 1)} repl{t.postCount - 1 === 1 ? "y" : "ies"} · {timeAgo(t.lastPostAt)}
                        </div>
                      </li>
                    ))}
                    {threads.length === 0 && (
                      <li className="py-4 text-sm text-muted">
                        No discussions yet. <Link href="/forums" className="link">Start one</Link>.
                      </li>
                    )}
                  </ul>
                ),
              },
              {
                key: "sessions",
                label: "Sessions",
                content:
                  sessions.length === 0 ? (
                    <p className="py-4 text-sm text-muted">
                      No upcoming sessions.{" "}
                      <Link href="/sessions" className="link">
                        Host one
                      </Link>{" "}
                      for the online trophies you still need.
                    </p>
                  ) : (
                    <ul className="divide-y divide-line">
                      {sessions.slice(0, 6).map((s) => (
                        <li key={s.id} className="flex items-center gap-3 py-3">
                          <GameArt title={s.game.title} hue={s.game.coverHue} iconUrl={s.game.iconUrl} size="sm" className="w-11 rounded-md" />
                          <div className="min-w-0 flex-1">
                            <Link href={`/sessions/${s.id}`} className={rowLink}>
                              {s.title}
                            </Link>
                            <div className="truncate text-xs text-muted">
                              {s.game.title} · {s.platform} ·{" "}
                              {formatDate(s.startsAt, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </div>
                          </div>
                          <span className={`chip shrink-0 ${s._count.members >= s.slots ? "border-bad/40 text-bad" : "border-good/40 text-good"}`}>
                            {s._count.members}/{s.slots}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ),
              },
            ]}
          />
        </Panel>
      </div>

      {trendingSorted.length > 0 && (
        <Panel title="Most played this month" icon={<FlameIcon />} action={<MoreLink href="/games">All games</MoreLink>}>
          <div className="grid grid-cols-2 gap-3 py-5 sm:grid-cols-3 lg:grid-cols-6">
            {trendingSorted.map((g) => (
              <GameCard key={g.id} game={{ ...g, platRate: g.trophies[0]?.earnedRate ?? null }} />
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

type BoardRow = Awaited<ReturnType<typeof getLeaderboard>>[number];

function Board({ rows, value, empty }: { rows: BoardRow[]; value: (r: BoardRow) => string; empty: string }) {
  return (
    <ol className="divide-y divide-line">
      {rows.map((r) => (
        <li key={r.key} className="flex items-center gap-3 py-2.5">
          <span className="w-6 text-right text-sm font-semibold tabular-nums text-muted">{r.rank}.</span>
          <Avatar name={r.name} hue={r.avatarHue} url={r.avatarUrl} avatar={r.avatar} size={32} className="rounded-md" />
          <Link href={r.href} className="min-w-0 flex-1 truncate text-sm font-semibold leading-6 hover:underline hover:underline-offset-4">
            {r.name} <span className="text-xs">{flag(r.country)}</span>
          </Link>
          <span className="text-sm tabular-nums text-muted">{value(r)}</span>
        </li>
      ))}
      {rows.length === 0 && <li className="py-4 text-sm text-muted">{empty}</li>}
    </ol>
  );
}
