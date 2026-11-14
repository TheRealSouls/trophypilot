import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon, BookIcon, ChevronDownIcon, PinIcon, StarIcon } from "@/components/icons";
import clsx from "clsx";
import { prisma } from "@/lib/db";
import { cached } from "@/lib/cache";
import { getCurrentUser } from "@/lib/auth";
import { flag } from "@/lib/countries";
import { after } from "next/server";
import { recentPlayers } from "@/lib/activity";
import { isStaff } from "@/lib/forum";
import { siblingLists } from "@/lib/games";
import { probeSiblings } from "@/lib/psn/siblings";
import { enrichGame, igdbEnabled } from "@/lib/igdb";
import { isDemoMode } from "@/lib/psn/sync";
import { formatDate, parseJsonArray, platformName, timeAgo } from "@/lib/utils";
import { GameArt, SceneArt } from "@/components/art";
import { RevealAllButton, SpoilerGroup } from "@/components/client";
import { TrophyList } from "@/components/TrophyList";
import { sortParam } from "@/lib/trophies";
import { TrophyIcon } from "@/components/TrophyIcon";
import { YouTube } from "@/components/YouTube";
import { Avatar, DifficultyMeter, Notice, ProgressBar, SectionTitle } from "@/components/ui";
import { loadGame } from "./data";
import { PlayingNowButton, RateGameForm, SeriesForms, StaffHoursForm, UnobtainableForm, WishlistButton } from "./forms";
import { SyncMyTrophies } from "@/components/SyncMyTrophies";
import { seriesEntries } from "@/lib/series";
import { listRegions, REGION_NAMES, type Region } from "@/lib/regions";
import { requestGuide } from "@/actions/guides";
import { SubmitButton } from "@/components/client";
import { ListLoader } from "./ListLoader";

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

type Tab = "trophies" | "guides" | "series";

export default async function GamePage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ sort?: string; tab?: string; order?: string }>;
}) {
  const { slug } = await params;
  const { sort = "default", tab: tabParam, order } = await searchParams;
  const game = await loadGame(slug);
  const viewer = await getCurrentUser();
  const viewerId = viewer?.id ?? null;
  // The same for every visitor, so shared for a while (cleared with the game, see bust("game:<slug>")).
  const lists = await cached(`lists:${game.titleKey || game.id}`, () => siblingLists(game), { ttlMs: 10 * 60_000 });
  // Which region each stack is from, where owners' countries or the list's name make it clear.
  const regions = lists.length > 1 ? await cached(`regions:${game.titleKey || game.id}`, () => listRegions(lists), { ttlMs: 60 * 60_000 }) : new Map<string, Region>();
  const familyIds = lists.length ? lists.map((l) => l.id) : [game.id];

  const family = game.titleKey ? { game: { titleKey: game.titleKey } } : { gameId: game.id };
  const [guides, myProgress, myTrophies, players, sessions, threads, myRating, playingNow, difficultyVotes] = await Promise.all([
    // Guides written on another platform's list count for this one too.
    prisma.guide.findMany({ where: { ...family, status: "PUBLISHED" }, orderBy: { views: "desc" }, include: { author: true } }),
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
  // Members asking for a guide, on any of this game's stacks (only while it has none).
  const [requests, myRequest] =
    guides.length === 0
      ? await Promise.all([
          prisma.guideRequest.count({ where: { gameId: { in: familyIds } } }),
          viewerId ? prisma.guideRequest.findFirst({ where: { gameId: { in: familyIds }, userId: viewerId }, select: { gameId: true } }) : null,
        ])
      : [0, null];
  const onWishlist = viewerId
    ? !!(await prisma.wishlistGame.findUnique({ where: { userId_gameId: { userId: viewerId, gameId: game.id } }, select: { gameId: true } }))
    : false;
  const unob = game.unobtainable === "PLATINUM" || game.unobtainable === "COMPLETION" ? UNOBTAINABLE[game.unobtainable] : null;
  const staff = isStaff(viewer);
  // The Series tab shows once the game is in a series; staff always see it, to link games.
  const tabs: [Tab, string][] = [
    ["trophies", "Trophies"],
    ["guides", guides.length ? `Guides (${guides.length})` : "Guides"],
    ...(game.series || staff ? ([["series", "Series"]] as [Tab, string][]) : []),
  ];
  const tab: Tab = tabs.find(([k]) => k === tabParam)?.[0] ?? "trophies";
  const tabHref = (t: Tab) => `/games/${game.slug}${t === "trophies" ? "" : `?tab=${t}`}#game-tabs`;
  const topGuide = guides[0];

  // Look for this game's other trophy lists (PS5, other regions) once, after the page is sent.
  if (!isDemoMode() && !game.siblingsProbedAt) {
    after(() => probeSiblings(game.id).catch((err) => console.error("[siblings]", err)));
  }
  // Release date, description, screenshots and trailer come from IGDB, also after the page is sent.
  if (igdbEnabled() && !game.igdbCheckedAt) {
    after(() => enrichGame(game.id).catch((err) => console.error("[igdb]", err)));
  }
  // "PS4 · EU" where the region is known; otherwise repeated platforms are numbered "PS4 (2)" so stacks stay distinguishable.
  const seen = new Map<string, number>();
  const listLabels = lists.map((l) => {
    const region = regions.get(l.id);
    const twins = lists.filter((x) => x.platform === l.platform && regions.get(x.id) === region);
    const n = (seen.get(`${l.platform}:${region}`) ?? 0) + 1;
    seen.set(`${l.platform}:${region}`, n);
    return [platformName(l.platform), region, twins.length > 1 ? `(${n})` : null].filter(Boolean).join(" · ");
  });
  // Stacks grouped by platform, newest platform first, for the list picker.
  const byPlatform = [...new Set(lists.map((l) => l.platform))].map((p) => ({ platform: p, items: lists.map((l, i) => ({ l, label: listLabels[i] })).filter((x) => x.l.platform === p) }));
  const banner = shots.find((x) => !x.startsWith("art:"));
  const hours = game.hoursToPlatinum ?? game.staffHours;

  return (
    <div>
      {/* Header */}
      <section className="card relative mb-8 overflow-hidden">
        {banner && (
          <div className="relative h-28 overflow-hidden sm:h-40" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={banner} alt="" referrerPolicy="no-referrer" fetchPriority="high" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/40 to-transparent" />
          </div>
        )}
        <div className={clsx("relative grid gap-6 p-5 sm:p-7 md:grid-cols-[180px_1fr]", banner && "-mt-16 sm:-mt-20")}>
          <GameArt title={game.title} hue={game.coverHue} iconUrl={game.iconUrl} size="lg" className={clsx("w-36 md:w-full", banner && "border-4 border-surface shadow-[var(--shadow-raised)]")} />
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
            {viewerId && (
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <PlayingNowButton gameId={game.id} playing={iAmPlaying} />
                <WishlistButton gameId={game.id} wanted={onWishlist} />
              </div>
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
          <nav className="card divide-y divide-line">
            {byPlatform.map(({ platform, items }) => (
              <div key={platform} className="flex flex-wrap items-center gap-2 px-4 py-3">
                <span className="w-16 shrink-0 text-xs font-bold uppercase tracking-wider text-muted">{platformName(platform)}</span>
                {items.map(({ l, label }) => (
                  <Link
                    key={l.id}
                    href={`/games/${l.slug}`}
                    aria-current={l.id === game.id ? "page" : undefined}
                    title={regions.get(l.id) ? `${REGION_NAMES[regions.get(l.id)!]} list` : undefined}
                    className={clsx(
                      "rounded-lg border px-3 py-1.5 text-xs",
                      l.id === game.id ? "border-accent-text bg-accent/5 text-text" : "border-line text-muted hover:border-muted hover:text-text",
                    )}
                  >
                    <span className="font-semibold">{label}</span>
                    <span className="ml-2 text-faint">
                      {l._count.trophies ? `${l._count.trophies} trophies` : "not loaded yet"}
                      {l._count.userGames > 0 && ` · ${l._count.userGames} members`}
                    </span>
                  </Link>
                ))}
              </div>
            ))}
          </nav>
          {regions.size > 0 && (
            <p className="mt-1.5 text-xs text-faint">Regions are worked out from where the players who own each list are, so a few may be missing.</p>
          )}
        </section>
      )}

      {/* The trophy guide first, above the tabs and filters, so nobody has to look for it. */}
      <section aria-label="Trophy guide" className="card mb-6 flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 text-sm">
        <BookIcon size={18} className="shrink-0 text-muted" />
        {topGuide ? (
          <>
            <span className="min-w-0">
              <span className="font-semibold">Guide: </span>
              <Link href={`/guides/${topGuide.slug}`} className="font-semibold underline underline-offset-2 hover:text-accent-text">
                {topGuide.title}
              </Link>
            </span>
            <span className="text-xs text-muted">
              by {topGuide.author.username} · {topGuide.playthroughs} playthrough{topGuide.playthroughs === 1 ? "" : "s"} · {topGuide.missableCount} missable
              {topGuide.missableCount === 1 ? "" : "s"}
            </span>
            <Link
              href={`/guides/${topGuide.slug}`}
              aria-label={`View guide: ${topGuide.title}`}
              className="ml-auto inline-flex items-center gap-1 font-semibold text-accent-text hover:underline hover:underline-offset-4"
            >
              View guide <ArrowRightIcon size={16} />
            </Link>
          </>
        ) : (
          <>
            <span className="text-muted">
              No trophy guide yet.{requests > 0 && ` ${requests} member${requests === 1 ? " has" : "s have"} asked for one.`}
            </span>
            <Link
              href={`/guides/new?game=${game.id}`}
              className="ml-auto inline-flex items-center gap-1 font-semibold text-accent-text hover:underline hover:underline-offset-4"
            >
              Write a guide <ArrowRightIcon size={16} />
            </Link>
          </>
        )}
      </section>

      <nav id="game-tabs" aria-label="Game sections" className="mb-6 flex scroll-mt-20 gap-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--color-line)]">
        {tabs.map(([k, label]) => (
          <Link
            key={k}
            href={tabHref(k)}
            aria-current={tab === k ? "page" : undefined}
            className={clsx(
              "shrink-0 border-b-[3px] px-4 py-2.5 text-[15px] font-semibold",
              tab === k ? "border-accent text-text" : "border-transparent text-muted hover:text-text",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-10">
          {tab === "trophies" && (
            <>
              {/* Trophy list */}
              <SpoilerGroup>
                <section>
                  <SectionTitle action={hiddenLeft > 0 ? <RevealAllButton count={hiddenLeft} className="chip hover:text-text" /> : undefined}>
                    Trophy list
                  </SectionTitle>
                  {game.needsList && <ListLoader gameId={game.id} />}
                  {!game.needsList && game.trophies.length === 0 && <p className="text-sm text-muted">No trophy list is available for this game yet.</p>}
                  <TrophyList gameSlug={game.slug} groups={game.groups} trophies={game.trophies} earned={earned} sort={sortParam(sort)} />
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
            </>
          )}

          {tab === "guides" && (
            <section id="guides">
              <SectionTitle
                action={
                  <Link href={`/guides/new?game=${game.id}`} className="link text-sm">
                    Write a guide
                  </Link>
                }
              >
                Guides
              </SectionTitle>
              {guides.length > 0 ? (
                <ul className="space-y-3">
                  {guides.map((g) => (
                    <li key={g.id}>
                      <Link href={`/guides/${g.slug}`} className="card group flex items-center gap-4 p-4 hover:border-line-strong">
                        <BookIcon size={20} className="shrink-0 text-muted" />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold group-hover:underline group-hover:underline-offset-4">{g.title}</div>
                          <div className="text-xs text-muted">
                            by {g.author.username} · {g.playthroughs} playthrough{g.playthroughs === 1 ? "" : "s"} · {g.missableCount} missable
                            {g.missableCount === 1 ? "" : "s"} · {g.views} view{g.views === 1 ? "" : "s"}
                          </div>
                        </div>
                        <ArrowRightIcon size={18} className="shrink-0 text-muted" />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="card p-5">
                  <p className="text-sm text-muted">
                    No guide yet.{requests > 0 && ` ${requests} member${requests === 1 ? " has" : "s have"} asked for one.`}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link href={`/guides/new?game=${game.id}`} className="btn-primary">
                      Write a guide
                    </Link>
                    {viewerId && (
                      <form action={requestGuide}>
                        <input type="hidden" name="gameId" value={myRequest?.gameId ?? game.id} />
                        {myRequest && <input type="hidden" name="cancel" value="1" />}
                        <SubmitButton className="btn-ghost">{myRequest ? "Requested: take it back" : "Request a guide"}</SubmitButton>
                      </form>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}

          {tab === "series" && <SeriesTab game={game} newestFirst={order === "new"} staff={staff} />}
        </div>

        {/* Sidebar */}
        <aside className="space-y-6">
          <section className="card p-5" aria-label="Game details">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              {(
                [
                  ["Developer", game.developer],
                  ["Publisher", game.publisher],
                  ["Genre", game.genre],
                  ["Release", game.releaseDate ? formatDate(game.releaseDate) : null],
                ] as [string, string | null][]
              )
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted">{k}</dt>
                    <dd className="min-w-0 font-medium">{v}</dd>
                  </div>
                ))}
              <dt className="text-muted">Difficulty</dt>
              <dd>
                <DifficultyMeter value={game.difficulty} />
                {difficultySource && <span className="block text-xs text-muted">{difficultySource}</span>}
              </dd>
              <dt className="text-muted">Time to platinum</dt>
              <dd className="font-medium">
                {hours ? `~${hours}h` : "n/a"}
                <span className="block text-xs font-normal text-muted">
                  {game.hoursToPlatinum ? guideSource : game.staffHours ? "Staff estimate until a guide is written" : guideSource}
                </span>
              </dd>
              <dt className="text-muted">Playthroughs</dt>
              <dd className="font-medium">{game.playthroughs ?? "n/a"}</dd>
              <dt className="text-muted">Platinum rate</dt>
              <dd className="font-medium">{!plat ? "No platinum" : plat.earnedRate != null ? `${plat.earnedRate.toFixed(1)}%` : "n/a"}</dd>
              <dt className="text-muted">Obtainable</dt>
              <dd className={clsx("font-medium", unob ? "text-bad" : "text-good")}>
                {unob ? unob.short : "Platinum and 100%"}
                {game.unobtainableAt && <span className="block text-xs font-normal text-muted">Checked by staff {formatDate(game.unobtainableAt)}</span>}
              </dd>
            </dl>
          </section>

          {/* A compact rating summary; the form opens from the button. */}
          <section className="card p-5" aria-labelledby="community-rating">
            <h2 id="community-rating" className="font-bold">
              Community rating
            </h2>
            <div className="mt-2 flex items-center gap-1 text-gold" aria-hidden>
              {Array.from({ length: 5 }, (_, i) => (
                <StarIcon key={i} size={24} filled={game.rating != null && i < Math.round(game.rating)} />
              ))}
            </div>
            <p className="mt-1 text-sm">
              {game.rating != null ? (
                <>
                  <span className="font-semibold">{game.rating.toFixed(1)} out of 5</span>{" "}
                  <span className="text-muted">
                    ({game.ratingCount} rating{game.ratingCount === 1 ? "" : "s"})
                  </span>
                </>
              ) : (
                <span className="text-muted">Not rated yet</span>
              )}
            </p>
            {viewerId ? (
              <details className="group mt-3">
                <summary className="btn-ghost w-full cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                  <StarIcon size={16} />
                  {myRating?.rating ? `Your rating: ${myRating.rating}/5. Change it` : "Rate this game"}
                  <ChevronDownIcon size={16} className="transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-4">
                  <p className="mb-3 text-xs text-muted">Your rating counts towards the difficulty and game rating.</p>
                  <RateGameForm gameId={game.id} difficulty={myRating?.difficulty ?? null} rating={myRating?.rating ?? null} />
                </div>
              </details>
            ) : (
              <p className="mt-3 text-sm text-muted">
                <Link href={`/login?next=/games/${game.slug}`} className="link">
                  Log in
                </Link>{" "}
                to rate the difficulty and the game.
              </p>
            )}
          </section>

          <section className="card space-y-3 p-5" aria-labelledby="your-progress">
            <h2 id="your-progress" className="font-bold">
              Your progress
            </h2>
            {myProgress ? (
              <div>
                <div className="mb-1.5 flex justify-between text-sm">
                  <span className="font-semibold tabular-nums">
                    {myTrophies.length} / {game.trophies.length} trophies
                  </span>
                  <span className="font-semibold tabular-nums">{myProgress.progress}%</span>
                </div>
                <ProgressBar value={myProgress.progress} className="rounded-full [&>div]:rounded-full" label="Your completion" />
              </div>
            ) : (
              <p className="text-sm text-muted">{viewerId ? "Not in your synced games yet." : "Log in and sync to see your progress here."}</p>
            )}
            {viewer?.psn?.verified && <SyncMyTrophies wide />}
            <Link href={`/guides/new?game=${game.id}`} className="btn-ghost w-full">
              <BookIcon size={16} />
              Write a guide
            </Link>
          </section>

          {game.description && (
            <section className="card p-5">
              <h2 className="mb-2 font-bold">About the game</h2>
              <p className="text-sm leading-relaxed text-muted">{game.description}</p>
            </section>
          )}

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
            <Link href={`/forums/for/${game.id}`} className="mt-2 block text-center text-sm text-muted hover:text-text hover:underline">
              Open the {game.title} forum
            </Link>
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

          {isStaff(viewer) && (
            <section className="card p-5">
              <h2 className="mb-1 font-bold">Staff: obtainable?</h2>
              <p className="mb-3 text-xs text-muted">Flag the list if servers shut down or a trophy is glitched. This applies to this trophy list only.</p>
              <UnobtainableForm gameId={game.id} unobtainable={game.unobtainable} reason={game.unobtainableReason} />
              <div className="mt-5 border-t border-line pt-4">
                <StaffHoursForm gameId={game.id} hours={game.staffHours} />
              </div>
              <p className="mt-4 text-xs text-muted">
                Online trophies: open a trophy to mark it, or review members&apos; flags on the{" "}
                <Link href="/staff?tab=online" className="link">
                  staff dashboard
                </Link>
                .
              </p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

/**
 * Every game in this game's series, one row per game with its platforms (each links to that
 * platform's trophy list), oldest first by default, with this game highlighted. Staff link games here.
 */
async function SeriesTab({
  game,
  newestFirst,
  staff,
}: {
  game: { id: string; slug: string; titleKey: string; series: { id: string; name: string } | null };
  newestFirst: boolean;
  staff: boolean;
}) {
  const entries = game.series ? await seriesEntries(game.series.id) : [];
  const rows = newestFirst ? [...entries].reverse() : entries;
  const here = game.titleKey || game.id;
  const orderHref = (o: "old" | "new") => `/games/${game.slug}?tab=series${o === "new" ? "&order=new" : ""}#game-tabs`;
  return (
    <section aria-labelledby="series-title" className="space-y-4">
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <h2 id="series-title" className="text-lg font-bold">
            {game.series ? `${game.series.name} series` : "Series"}
          </h2>
          {entries.length > 0 && (
            <span className="chip min-h-6">
              {entries.length} game{entries.length === 1 ? "" : "s"}
            </span>
          )}
          {entries.length > 1 && (
            <nav aria-label="Order" className="ml-auto flex overflow-hidden rounded-lg border border-line-strong text-sm">
              {(
                [
                  ["old", "Oldest first"],
                  ["new", "Newest first"],
                ] as const
              ).map(([o, label]) => {
                const active = (o === "new") === newestFirst;
                return (
                  <Link
                    key={o}
                    href={orderHref(o)}
                    aria-current={active ? "true" : undefined}
                    className={clsx("px-3 py-1.5 font-semibold", active ? "bg-text text-bg" : "bg-surface text-muted hover:text-text")}
                  >
                    {label}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>
        {rows.length > 0 ? (
          <ul className="divide-y divide-line">
            {rows.map((e) => {
              const current = e.key === here;
              const main = e.platforms[0];
              return (
                <li
                  key={e.key}
                  aria-current={current ? "true" : undefined}
                  className={clsx("flex items-center gap-3 px-4 py-2.5 sm:gap-4", current ? "bg-accent/[0.07]" : "bg-surface")}
                >
                  <GameArt title={e.title} hue={e.coverHue} iconUrl={e.iconUrl} size="sm" className="w-12 shrink-0 sm:w-14" />
                  <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-4">
                    <Link href={`/games/${main.slug}`} className="block min-w-0 font-semibold hover:underline hover:underline-offset-4 sm:flex-1">
                      {e.title}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-2 sm:mt-0">
                      <span className="w-10 text-sm tabular-nums text-muted">{e.released ? e.released.getUTCFullYear() : "TBA"}</span>
                      {e.platforms.map((p) => (
                        <Link
                          key={p.platform}
                          href={`/games/${p.slug}`}
                          aria-label={`${e.title} ${platformName(p.platform)} trophy list`}
                          className="rounded-md border border-plat/50 bg-plat/10 px-2 py-0.5 text-xs font-bold text-plat hover:bg-plat/20"
                        >
                          {platformName(p.platform)}
                        </Link>
                      ))}
                      {current && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-accent/40 bg-surface px-2 py-0.5 text-xs font-semibold text-accent-text">
                          <PinIcon size={13} /> You&apos;re here
                        </span>
                      )}
                    </div>
                  </div>
                  <Link href={`/games/${main.slug}`} aria-label={`Open ${e.title}`} className="shrink-0 text-muted hover:text-text">
                    <ArrowRightIcon size={18} />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-4 py-5 text-sm text-muted">
            {game.series ? "No games are linked to this series yet." : "This game isn't part of a series yet."}
            {staff && " Name its series below to start one."}
          </p>
        )}
      </div>
      {game.series && <p className="text-xs text-faint">Series come from IGDB&apos;s franchises, and staff can link games by hand.</p>}
      {staff && (
        <div className="card p-5">
          <h3 className="mb-3 font-bold">Staff: link games</h3>
          <SeriesForms gameId={game.id} series={game.series?.name ?? null} />
        </div>
      )}
    </section>
  );
}
