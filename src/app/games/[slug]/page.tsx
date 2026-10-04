import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { prisma } from "@/lib/db";
import { cached } from "@/lib/cache";
import { getCurrentUser } from "@/lib/auth";
import { flag } from "@/lib/countries";
import { after } from "next/server";
import { recentPlayers } from "@/lib/activity";
import { isAdmin } from "@/lib/forum";
import { siblingLists } from "@/lib/games";
import { probeSiblings } from "@/lib/psn/siblings";
import { enrichGame, igdbEnabled } from "@/lib/igdb";
import { isDemoMode } from "@/lib/psn/sync";
import { formatDate, parseJsonArray, platformName, timeAgo } from "@/lib/utils";
import { GameArt, SceneArt } from "@/components/art";
import { RevealAllButton, SpoilerGroup } from "@/components/client";
import { TrophyList } from "@/components/TrophyList";
import { TrophyIcon } from "@/components/TrophyIcon";
import { YouTube } from "@/components/YouTube";
import { Avatar, DifficultyMeter, Notice, ProgressBar, SectionTitle, Stat, StatGrid } from "@/components/ui";
import { loadGame } from "./data";
import { PlayingNowButton, RateGameForm, UnobtainableForm } from "./forms";

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const game = await loadGame((await params).slug);
  return {
    title: `${game.title} Trophies`,
    description: [
      `${game.title} trophy list`,
      game.difficulty != null ? `difficulty ${Math.round(game.difficulty)}/10` : null,
      game.hoursToPlatinum ? `about ${game.hoursToPlatinum}h to platinum` : null,
      "guides and tips.",
    ]
      .filter(Boolean)
      .join(", "),
  };
}

const UNOBTAINABLE = {
  PLATINUM: { short: "Platinum unobtainable", long: "The platinum can't be earned any more." },
  COMPLETION: { short: "100% unobtainable", long: "The platinum can still be earned, but 100% can't." },
} as const;

export default async function GamePage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<{ sort?: string }> }) {
  const { slug } = await params;
  const { sort = "default" } = await searchParams;
  const game = await loadGame(slug);
  const viewer = await getCurrentUser();
  const viewerId = viewer?.id ?? null;
  // The same for every visitor, so shared for a while (cleared with the game, see bust("game:<slug>")).
  const lists = await cached(`lists:${game.titleKey || game.id}`, () => siblingLists(game), { ttlMs: 10 * 60_000 });
  const familyIds = lists.length ? lists.map((l) => l.id) : [game.id];

  const family = game.titleKey ? { game: { titleKey: game.titleKey } } : { gameId: game.id };
  const [guides, myProgress, myTrophies, players, sessions, threads, myRating, playingNow, difficultyVotes] = await Promise.all([
    // Guides written on another platform's list count for this one too.
    prisma.guide.findMany({ where: family, orderBy: { views: "desc" }, include: { author: true } }),
    viewerId ? prisma.userGame.findUnique({ where: { userId_gameId: { userId: viewerId, gameId: game.id } } }) : null,
    viewerId
      ? prisma.userTrophy.findMany({ where: { userId: viewerId, trophy: { gameId: game.id } }, select: { trophyId: true, earnedAt: true } })
      : [],
    cached(`game:${slug}:players`, () => recentPlayers(game.id, 8), { ttlMs: 2 * 60_000 }),
    prisma.session.findMany({
      where: { gameId: game.id, startsAt: { gte: new Date() } },
      orderBy: { startsAt: "asc" },
      take: 3,
      include: { _count: { select: { members: true } } },
    }),
    // Forum threads about this game, on any of its trophy lists.
    prisma.forumThread.findMany({ where: family, orderBy: { lastPostAt: "desc" }, take: 5 }),
    viewerId ? prisma.gameRating.findUnique({ where: { userId_gameId: { userId: viewerId, gameId: game.id } } }) : null,
    // Members who set "Playing now" on any of this game's lists.
    prisma.user.findMany({
      where: { nowPlayingGameId: { in: familyIds }, nowPlayingUntil: { gt: new Date() }, profileVisibility: "PUBLIC" },
      orderBy: { nowPlayingUntil: "desc" },
      take: 12,
      select: { id: true, username: true, avatarHue: true, avatar: true, country: true, psn: { select: { onlineId: true, avatarUrl: true } } },
    }),
    prisma.gameRating.count({ where: { gameId: { in: familyIds }, difficulty: { not: null } } }),
  ]);

  const votes = guides.length + difficultyVotes;
  const difficultySource = votes > 0 ? `From ${votes} rating${votes === 1 ? "" : "s"}` : game.difficulty == null ? "Not rated yet" : undefined;
  const guideSource =
    guides.length > 0 ? `From ${guides.length} guide${guides.length === 1 ? "" : "s"}` : game.hoursToPlatinum == null ? "Needs a guide" : undefined;

  const plat = game.trophies.find((t) => t.type === "PLATINUM");
  const counts = (type: string) => game.trophies.filter((t) => t.type === type).length;
  const earned = viewerId && myProgress ? new Map(myTrophies.map((r) => [r.trophyId, r.earnedAt])) : undefined;
  const hiddenLeft = game.trophies.filter((t) => t.hidden && !earned?.has(t.id)).length;
  const shots = parseJsonArray(game.screenshots);
  const dlcs = game.groups.filter((g) => g.isDlc);
  const iAmPlaying = playingNow.some((u) => u.id === viewerId);
  const unob = game.unobtainable === "PLATINUM" || game.unobtainable === "COMPLETION" ? UNOBTAINABLE[game.unobtainable] : null;

  // Look for this game's other trophy lists (PS5, other regions) once, after the page is sent.
  if (!isDemoMode() && !game.siblingsProbedAt) {
    after(() => probeSiblings(game.id).catch((err) => console.error("[siblings]", err)));
  }
  // Release date, description, screenshots and trailer come from IGDB, also after the page is sent.
  if (igdbEnabled() && !game.igdbCheckedAt) {
    after(() => enrichGame(game.id).catch((err) => console.error("[igdb]", err)));
  }
  // Label repeated platforms "PS4 (2)" so regional stacks are distinguishable.
  const seen = new Map<string, number>();
  const listLabels = lists.map((l) => {
    const n = (seen.get(l.platform) ?? 0) + 1;
    seen.set(l.platform, n);
    const dupes = lists.filter((x) => x.platform === l.platform).length > 1;
    return dupes ? `${l.platform} (${n})` : l.platform;
  });

  return (
    <div>
      {/* Header */}
      <section className="card mb-8">
        <div className="grid gap-6 p-5 sm:p-7 md:grid-cols-[180px_1fr]">
          <GameArt title={game.title} hue={game.coverHue} iconUrl={game.iconUrl} size="lg" className="w-36 md:w-full" />
          <div>
            <div className="flex flex-wrap gap-1.5">
              {game.platforms.split(",").map((p) => (
                <Link key={p} href={`/games?platform=${p}`} className="chip min-h-6 text-text hover:border-line-strong" title={`All ${platformName(p)} games`}>
                  {platformName(p)}
                </Link>
              ))}
              {game.genre && (
                <Link href={`/games?genre=${encodeURIComponent(game.genre)}`} className="chip min-h-6 hover:border-line-strong hover:text-text" title={`All ${game.genre} games`}>
                  {game.genre}
                </Link>
              )}
              {game.hasOnlineTrophies && <span className="chip border-rare/50 text-rare">Online trophies</span>}
              {unob && <span className="chip border-bad/50 text-bad">{unob.short}</span>}
            </div>
            <h1 className="mt-3 break-words text-2xl font-bold tracking-tight sm:text-3xl">{game.title}</h1>
            <p className="mt-1 text-sm text-muted">
              {[game.developer, game.publisher !== game.developer ? game.publisher : null].filter(Boolean).join(" · ")}
              {game.releaseDate && <> · Released {formatDate(game.releaseDate)}</>}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-5">
              <div className="flex items-center gap-3 text-sm font-semibold">
                {(["PLATINUM", "GOLD", "SILVER", "BRONZE"] as const).map((t) =>
                  counts(t) ? (
                    <span key={t} className="inline-flex items-center gap-1">
                      <TrophyIcon type={t} size={18} /> {counts(t)}
                    </span>
                  ) : null,
                )}
              </div>
              <span className="text-sm text-muted">{game.trophies.length} trophies · {game._count.userGames} members playing</span>
            </div>
            {myProgress && (
              <div className="mt-5 max-w-md rounded-lg border border-line bg-bg p-3">
                <div className="mb-1.5 flex justify-between text-sm">
                  <span className="font-semibold">Your progress</span>
                  <span className="tabular-nums">{myProgress.progress}%</span>
                </div>
                <ProgressBar value={myProgress.progress} label="Your completion" />
              </div>
            )}
            {viewerId && (
              <PlayingNowButton gameId={game.id} playing={iAmPlaying} />
            )}
          </div>
        </div>
      </section>

      {unob && (
        <Notice tone="bad" className="mb-8">
          <strong>{unob.long}</strong> {game.unobtainableReason}
        </Notice>
      )}

      {lists.length > 1 && (
        <section className="mb-8" aria-label="Trophy lists">
          <div className="mb-2 text-xs text-muted">
            This game has {lists.length} separate trophy lists on PSN. Each platform, and sometimes each region, gets its own list,
            so a platinum on one doesn&apos;t count for another.
          </div>
          <nav className="flex flex-wrap gap-2">
            {lists.map((l, i) => (
              <Link
                key={l.id}
                href={`/games/${l.slug}`}
                aria-current={l.current ? "page" : undefined}
                className={clsx("rounded-lg border px-3 py-1.5 text-xs", l.current ? "border-accent-text text-text" : "border-line text-muted hover:border-muted hover:text-text")}
              >
                <span className="font-semibold">{listLabels[i]}</span>
                <span className="ml-2 text-faint">
                  {l._count.trophies ? `${l._count.trophies} trophies` : "list not loaded"}
                  {l._count.userGames > 0 && ` · ${l._count.userGames} members`}
                </span>
              </Link>
            ))}
          </nav>
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-10">
          {/* Estimates and status */}
          <StatGrid className="grid-cols-2 md:grid-cols-3">
            <Stat label="Difficulty" value={<span className="text-sm"><DifficultyMeter value={game.difficulty} /></span>} sub={difficultySource} />
            <Stat
              label="Obtainable"
              value={<span className={clsx("text-base", unob ? "text-bad" : "text-good")}>{unob ? unob.short : "Platinum and 100%"}</span>}
              sub={unob ? (game.unobtainableReason ?? undefined) : undefined}
            />
            <Stat
              label="Game rating"
              value={game.rating != null ? `${game.rating.toFixed(1)} / 5` : "n/a"}
              sub={game.ratingCount ? `From ${game.ratingCount} member${game.ratingCount === 1 ? "" : "s"}` : "Not rated yet"}
            />
            <Stat label="Time to platinum" value={game.hoursToPlatinum ? `~${game.hoursToPlatinum}h` : "n/a"} sub={guideSource} />
            <Stat label="Playthroughs" value={game.playthroughs ?? "n/a"} sub={guideSource} />
            <Stat
              label="Platinum rate"
              value={!plat ? "No platinum" : plat.earnedRate != null ? `${plat.earnedRate.toFixed(1)}%` : "n/a"}
            />
          </StatGrid>

          {/* Trophy list */}
          <SpoilerGroup>
            <section>
              <SectionTitle
                action={
                  <div className="flex flex-wrap items-center justify-end gap-1.5 text-sm">
                    {hiddenLeft > 0 && <RevealAllButton count={hiddenLeft} className="chip hover:text-text" />}
                    {[
                      ["default", "Default"],
                      ["rarity", "Rarest"],
                      ["type", "Grade"],
                    ].map(([k, l]) => (
                      <Link key={k} href={`/games/${game.slug}?sort=${k}`} scroll={false} className={clsx("chip min-h-6", sort === k && "chip-active")}>
                        {l}
                      </Link>
                    ))}
                  </div>
                }
              >
                Trophy list
              </SectionTitle>
              {game.trophyError && <Notice tone="bad">{game.trophyError}</Notice>}
              {!game.trophyError && game.trophies.length === 0 && <p className="text-sm text-muted">No trophy list is available for this game yet.</p>}
              <TrophyList gameSlug={game.slug} groups={game.groups} trophies={game.trophies} earned={earned} sort={sort as "default" | "rarity" | "type"} />
            </section>
          </SpoilerGroup>

          {/* Screenshots and trailer, after the trophies */}
          {(shots.length > 0 || game.trailerYoutubeId) && (
            <section>
              <SectionTitle>Screenshots and trailer</SectionTitle>
              <div className="grid gap-3 sm:grid-cols-2">
                {game.trailerYoutubeId ? (
                  <div className="sm:col-span-2">
                    <YouTube id={game.trailerYoutubeId} title={`${game.title} trailer`} />
                  </div>
                ) : null}
                {shots.map((s) =>
                  s.startsWith("art:") ? (
                    <SceneArt key={s} seed={`${game.slug}-${s}`} hue={game.coverHue} />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={s}
                      src={s}
                      alt={`${game.title} screenshot`}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="aspect-video w-full rounded-lg border border-line bg-surface-2 object-cover"
                    />
                  ),
                )}
              </div>
              {game.igdbId && (
                <p className="mt-2 text-xs text-faint">
                  Release date, description, screenshots and trailer from{" "}
                  <a href="https://www.igdb.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-text">
                    IGDB
                  </a>
                  .
                </p>
              )}
            </section>
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-6">
          {game.description && (
            <section className="card p-5">
              <h2 className="mb-2 font-bold">About the game</h2>
              <p className="text-sm leading-relaxed text-muted">{game.description}</p>
            </section>
          )}

          <section className="card p-5">
            <h2 className="mb-3 font-bold">Guides</h2>
            <ul className="space-y-3">
              {guides.map((g) => (
                <li key={g.id}>
                  <Link href={`/guides/${g.slug}`} className="block rounded-lg border border-line p-3 hover:border-muted">
                    <div className="font-semibold">{g.title}</div>
                    <div className="text-xs text-muted">
                      by {g.author.username} · {g.playthroughs} playthrough{g.playthroughs > 1 ? "s" : ""} · {g.missableCount} missables
                    </div>
                  </Link>
                </li>
              ))}
              {guides.length === 0 && <li className="text-sm text-muted">No guide yet.</li>}
            </ul>
            <Link href={`/guides/new?game=${game.id}`} className="btn-ghost mt-4 w-full">Write a guide</Link>
          </section>

          <section className="card p-5">
            <h2 className="mb-1 font-bold">Rate this game</h2>
            {viewerId ? (
              <>
                <p className="mb-3 text-xs text-muted">Your rating counts towards the difficulty and game rating above.</p>
                <RateGameForm gameId={game.id} difficulty={myRating?.difficulty ?? null} rating={myRating?.rating ?? null} />
              </>
            ) : (
              <p className="text-sm text-muted">
                <Link href={`/login?next=/games/${game.slug}`} className="link">Log in</Link> to rate the difficulty and the game.
              </p>
            )}
          </section>

          {playingNow.length > 0 && (
            <section className="card p-5">
              <h2 className="mb-3 font-bold">Playing now</h2>
              <ul className="space-y-2.5">
                {playingNow.map((u) => (
                  <li key={u.id} className="flex items-center gap-2.5 text-sm">
                    <Avatar name={u.psn?.onlineId ?? u.username} hue={u.avatarHue} url={u.psn?.avatarUrl} avatar={u.avatar} size={28} />
                    <Link href={`/u/${u.username}`} className="flex-1 truncate font-semibold hover:underline hover:underline-offset-4">
                      {u.psn?.onlineId ?? u.username} <span className="text-xs">{flag(u.country)}</span>
                    </Link>
                    <span className="chip border-good/50 text-good">Online</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted">Members who said they&apos;re on this game right now. Message one to team up.</p>
            </section>
          )}

          <section className="card p-5">
            <h2 className="mb-3 font-bold">Discussion</h2>
            <ul className="space-y-2">
              {threads.map((t) => (
                <li key={t.id}>
                  <Link href={`/forums/thread/${t.id}`} className="block rounded-md px-2 py-1.5 hover:bg-surface-2">
                    <div className="truncate text-sm font-semibold">{t.title}</div>
                    <div className="text-xs text-muted">
                      {t.postCount - 1} replies · {timeAgo(t.lastPostAt)}
                    </div>
                  </Link>
                </li>
              ))}
              {threads.length === 0 && <li className="text-sm text-muted">No threads about this game yet.</li>}
            </ul>
            <Link href={`/forums/new?game=${game.id}`} className="btn-ghost mt-4 w-full">Start a discussion</Link>
          </section>

          {dlcs.length > 0 && (
            <section className="card p-5">
              <h2 className="mb-3 font-bold">DLC</h2>
              <ul className="space-y-2">
                {dlcs.map((d) => (
                  <li key={d.id}>
                    <Link href={`/games/${game.slug}/dlc/${d.psnGroupId}`} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-surface-2">
                      <GameArt title={d.name} hue={game.coverHue} iconUrl={d.iconUrl ?? game.iconUrl} size="sm" className="w-9" />
                      <span className="min-w-0 flex-1 font-semibold">{d.name}</span>
                      <span className="text-xs text-muted">{d.releaseDate ? formatDate(d.releaseDate, { month: "short", year: "numeric" }) : ""}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card p-5">
            <h2 className="mb-3 font-bold">Upcoming sessions</h2>
            <ul className="space-y-2 text-sm">
              {sessions.map((s) => (
                <li key={s.id}>
                  <Link href={`/sessions/${s.id}`} className="block rounded-md px-2 py-1.5 hover:bg-surface-2">
                    <div className="font-semibold">{s.title}</div>
                    <div className="text-xs text-muted">
                      {formatDate(s.startsAt, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {s._count.members}/{s.slots}
                    </div>
                  </Link>
                </li>
              ))}
              {sessions.length === 0 && <li className="text-muted">None scheduled.</li>}
            </ul>
            <Link href={`/sessions?new=${game.id}`} className="btn-ghost mt-4 w-full">Host a session</Link>
          </section>

          <section className="card p-5">
            <h2 className="mb-3 font-bold">Recent players</h2>
            <ul className="space-y-2.5">
              {players.map((p) => (
                <li key={p.key} className="flex items-center gap-2.5 text-sm">
                  <Avatar name={p.name} hue={p.avatarHue} url={p.avatarUrl} avatar={p.avatar} size={28} />
                  <Link href={p.href} className="min-w-0 flex-1 truncate font-semibold hover:underline hover:underline-offset-4">
                    {p.name} <span className="text-xs">{flag(p.country)}</span>
                  </Link>
                  {p.hasPlatinum && <TrophyIcon type="PLATINUM" size={16} />}
                  <span className="shrink-0 text-xs tabular-nums text-muted">
                    {p.progress}% · {timeAgo(p.at)}
                  </span>
                </li>
              ))}
              {players.length === 0 && <li className="text-sm text-muted">Nobody we track has played this yet.</li>}
            </ul>
          </section>

          {isAdmin(viewer) && (
            <section className="card p-5">
              <h2 className="mb-1 font-bold">Admin: obtainable?</h2>
              <p className="mb-3 text-xs text-muted">Flag the list if servers shut down or a trophy is glitched. This applies to this trophy list only.</p>
              <UnobtainableForm gameId={game.id} unobtainable={game.unobtainable} reason={game.unobtainableReason} />
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
