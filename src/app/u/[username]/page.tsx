import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { prisma } from "@/lib/db";
import { trophyHref } from "@/lib/trophy-slug";
import { getMilestones, getUserStats } from "@/lib/stats";
import { getFriendIds } from "@/lib/social";
import { flag } from "@/lib/countries";
import { formatDate, timeAgo } from "@/lib/utils";
import { GameArt } from "@/components/art";
import { TrophyIcon } from "@/components/TrophyIcon";
import { Avatar, EmptyState, ProgressBar, RarityBadge, SectionTitle, TabLinks } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";
import { SpoilerName } from "@/components/client";
import { accentClass } from "@/lib/profile-themes";
import { ProfileHeader } from "./ProfileHeader";
import { loadProfile } from "./profile-data";

type Params = { username: string };
type Search = { tab?: string; sort?: string; platform?: string; show?: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { username } = await params;
  const { owner } = await loadProfile(username);
  const name = owner.psn?.onlineId ?? owner.username;
  return { title: `${name}'s trophies`, description: `${name}'s PlayStation trophies, platinums and milestones on TrophyPilot.` };
}

export default async function ProfilePage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Search> }) {
  const { username } = await params;
  const { tab = "games", sort = "recent", platform = "", show = "" } = await searchParams;
  const { owner, viewerId, canView, relation } = await loadProfile(username);
  // The member's chosen accent colour applies to their whole profile page.
  const accent = accentClass(owner.profileAccent);

  if (!canView) {
    return (
      <div className={accent}>
        <ProfileHeader owner={owner} stats={null} relation={relation} viewerId={viewerId} />
        <EmptyState title={owner.profileVisibility === "FRIENDS" ? "This profile is friends-only" : "This profile is private"}>
          {owner.profileVisibility === "FRIENDS"
            ? `Become friends with ${owner.username} to see their trophies.`
            : `${owner.username} keeps their trophy collection to themselves.`}
        </EmptyState>
      </div>
    );
  }

  const stats = await getUserStats(owner.id);
  const base = `/u/${owner.username}`;
  const tabs = [
    { key: "games", label: `Games (${stats.games})`, href: base },
    { key: "platinums", label: `Platinums (${stats.platinum})`, href: `${base}?tab=platinums` },
    { key: "log", label: "Trophy log", href: `${base}?tab=log` },
    { key: "milestones", label: "Milestones", href: `${base}?tab=milestones` },
    { key: "saved", label: "Saved guides", href: `${base}?tab=saved` },
    { key: "friends", label: "Friends", href: `${base}?tab=friends` },
  ];

  return (
    <div className={accent}>
      <ProfileHeader owner={owner} stats={stats} relation={relation} viewerId={viewerId} />
      <TrophyVault userId={owner.id} isOwner={relation === "SELF"} />
      {!owner.psn?.verified && relation === "SELF" && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-accent/50 bg-accent/10 px-4 py-3">
          <span className="text-sm">Link your PSN account to import your trophies.</span>
          <Link href="/settings#psn" className="btn-primary">Link PSN</Link>
        </div>
      )}
      <div className="mb-6">
        <TabLinks tabs={tabs} active={tab} />
      </div>
      {tab === "platinums" && <PlatinumTracker userId={owner.id} username={owner.username} />}
      {tab === "log" && <TrophyLog userId={owner.id} isOwner={relation === "SELF"} />}
      {tab === "milestones" && <Milestones userId={owner.id} stats={stats} isOwner={relation === "SELF"} />}
      {tab === "saved" && <SavedGuides userId={owner.id} isOwner={relation === "SELF"} />}
      {tab === "friends" && <FriendsTab userId={owner.id} />}
      {tab === "games" && <GamesTab userId={owner.id} username={owner.username} sort={sort} platform={platform} show={show} />}
    </div>
  );
}

/** The five trophies a member chose to show off. */
async function TrophyVault({ userId, isOwner }: { userId: string; isOwner: boolean }) {
  const vault = await prisma.vaultTrophy.findMany({
    where: { userId },
    orderBy: { position: "asc" },
    include: { trophy: { include: { game: { select: { title: true, slug: true } } } } },
  });
  if (!vault.length && !isOwner) return null;
  return (
    <section className="card mb-8 p-5" aria-labelledby="vault-title">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id="vault-title" className="text-sm font-bold uppercase tracking-wide">The Trophy Vault</h2>
        {isOwner && (
          <Link href="/settings#vault" className="link text-sm">
            {vault.length ? "Change" : "Pick your five"}
          </Link>
        )}
      </div>
      {vault.length === 0 ? (
        <p className="text-sm text-muted">Show off your five best trophies here. Pick them in Settings.</p>
      ) : (
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {vault.map(({ trophy: t }) => {
            const secret = t.hidden && !isOwner;
            const href = t.slug ? trophyHref(t.game.slug, t.slug) : `/trophies/${t.id}`;
            if (secret)
              return (
                <li key={t.id} className="flex h-full flex-col items-center gap-2 rounded-lg border border-line p-3 text-center">
                  <TrophyIcon type={t.type} size={48} />
                  <SpoilerName hidden className="justify-center">
                    <Link href={href} className="line-clamp-2 text-sm font-semibold hover:underline hover:underline-offset-4">
                      {t.name}
                    </Link>
                  </SpoilerName>
                  <span className="line-clamp-1 text-xs text-muted">{t.game.title}</span>
                  <span className="mt-auto">
                    <RarityBadge rate={t.earnedRate} />
                  </span>
                </li>
              );
            return (
            <li key={t.id}>
              <Link
                href={href}
                className="flex h-full flex-col items-center gap-2 rounded-lg border border-line p-3 text-center hover:border-muted"
              >
                {t.iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={t.iconUrl.replace(/^http:/, "https:")}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="h-16 w-16 rounded-md border border-line bg-surface-2 object-contain"
                  />
                ) : (
                  <TrophyIcon type={t.type} size={48} />
                )}
                <span className="line-clamp-2 text-sm font-semibold">{t.name}</span>
                <span className="line-clamp-1 text-xs text-muted">{t.game.title}</span>
                <span className="mt-auto flex items-center gap-1.5">
                  <TrophyIcon type={t.type} size={16} />
                  <RarityBadge rate={t.earnedRate} />
                </span>
              </Link>
            </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** The last 50 trophies earned, with the exact time each one popped. */
async function TrophyLog({ userId, isOwner }: { userId: string; isOwner: boolean }) {
  const log = await prisma.userTrophy.findMany({
    where: { userId },
    orderBy: { earnedAt: "desc" },
    take: 50,
    include: { trophy: { include: { game: { select: { title: true, slug: true, coverHue: true, iconUrl: true } } } } },
  });
  if (!log.length) return <EmptyState title="No trophies logged yet">Earned trophies show up here after a sync.</EmptyState>;
  return (
    <section>
      <SectionTitle>Last {log.length} trophies earned</SectionTitle>
      <ol className="card divide-y divide-line">
        {log.map(({ id, earnedAt, trophy: t }) => {
          // Hidden trophies stay hidden for visitors who might not have them.
          const secret = t.hidden && !isOwner;
          return (
            <li key={id} className="flex items-center gap-3 px-4 py-3">
              <GameArt title={t.game.title} hue={t.game.coverHue} iconUrl={t.game.iconUrl} size="sm" className="w-10" />
              <div className="min-w-0 flex-1">
                <SpoilerName hidden={secret}>
                  <Link
                    href={t.slug ? trophyHref(t.game.slug, t.slug) : `/trophies/${t.id}`}
                    className="block truncate font-semibold hover:underline hover:underline-offset-4"
                  >
                    {t.name}
                  </Link>
                </SpoilerName>
                <div className="truncate text-xs text-muted">
                  {t.game.title} · <LocalTime date={earnedAt} seconds />
                </div>
              </div>
              <RarityBadge rate={t.earnedRate} />
              <TrophyIcon type={t.type} size={26} />
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Guides the member saved to their favourites. */
async function SavedGuides({ userId, isOwner }: { userId: string; isOwner: boolean }) {
  const saved = await prisma.guideFavourite.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { guide: { include: { game: { select: { title: true, coverHue: true, iconUrl: true } }, author: { select: { username: true } } } } },
  });
  if (!saved.length) {
    return (
      <EmptyState title="No saved guides yet" action={isOwner ? <Link href="/guides" className="btn-ghost">Browse guides</Link> : undefined}>
        {isOwner ? "Open a guide and press Add to favourites. It will be kept here." : "Guides this member saves show up here."}
      </EmptyState>
    );
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {saved.map(({ guide: g }) => (
        <li key={g.id}>
          <Link href={`/guides/${g.slug}`} className="card flex gap-4 p-4 hover:border-muted">
            <GameArt title={g.game.title} hue={g.game.coverHue} iconUrl={g.game.iconUrl} size="sm" className="w-14 self-start" />
            <div className="min-w-0">
              <div className="font-semibold">{g.title}</div>
              <div className="line-clamp-2 text-sm text-muted">{g.summary}</div>
              <div className="mt-1 text-xs text-faint">
                {g.game.title} · by {g.author.username}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

const SHOW = {
  "": "All games",
  complete: "100% complete",
  incomplete: "Not 100%",
  platinum: "Platinum",
  platnot100: "Platinum, not 100%",
} as const;
const PLATFORMS = ["PS5", "PS4", "PS3", "PSVITA"];

async function GamesTab({ userId, username, sort, platform, show }: { userId: string; username: string; sort: string; platform: string; show: string }) {
  const where = {
    userId,
    ...(PLATFORMS.includes(platform) ? { game: { platforms: { contains: platform } } } : {}),
    ...(show === "complete"
      ? { completedAt: { not: null } }
      : show === "incomplete"
        ? { completedAt: null }
        : show === "platinum"
          ? { hasPlatinum: true }
          : show === "platnot100"
            ? { hasPlatinum: true, completedAt: null }
            : {}),
  };
  const total = await prisma.userGame.count({ where: { userId } });
  const orderBy =
    sort === "progress"
      ? [{ progress: "desc" as const }, { lastEarned: { sort: "desc" as const, nulls: "last" as const } }]
      : sort === "title"
        ? { game: { title: "asc" as const } }
        : { lastEarned: { sort: "desc" as const, nulls: "last" as const } };
  const games = await prisma.userGame.findMany({
    where,
    orderBy,
    include: { game: { include: { _count: { select: { trophies: true } } } } },
  });
  if (!total) return <EmptyState title="No games synced yet">Once the PSN account is synced, games show up here.</EmptyState>;

  const sorts = [
    ["recent", "Last played"],
    ["title", "A to Z"],
    ["progress", "Percent complete"],
  ];
  // Every filter link keeps the other two choices.
  const href = (o: { sort?: string; platform?: string; show?: string }) => {
    const p = new URLSearchParams(
      Object.entries({ sort, platform, show, ...o }).filter(([k, v]) => v && !(k === "sort" && v === "recent")) as [string, string][],
    );
    const q = p.toString();
    return `/u/${username}${q ? `?${q}` : ""}`;
  };
  return (
    <div>
      <div className="card mb-4 space-y-3 p-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-20 text-xs font-semibold uppercase tracking-wider text-muted">Platform</span>
          <Link href={href({ platform: "" })} scroll={false} className={clsx("chip min-h-6", !PLATFORMS.includes(platform) && "chip-active")}>All</Link>
          {PLATFORMS.map((p) => (
            <Link key={p} href={href({ platform: p })} scroll={false} className={clsx("chip min-h-6", platform === p && "chip-active")}>
              {p === "PSVITA" ? "PS Vita" : p}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-20 text-xs font-semibold uppercase tracking-wider text-muted">Show</span>
          {Object.entries(SHOW).map(([k, l]) => (
            <Link key={k} href={href({ show: k })} scroll={false} className={clsx("chip min-h-6", (show in SHOW ? show : "") === k && "chip-active")}>
              {l}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-20 text-xs font-semibold uppercase tracking-wider text-muted">Order by</span>
          {sorts.map(([k, l]) => (
            <Link key={k} href={href({ sort: k })} scroll={false} className={clsx("chip min-h-6", sort === k && "chip-active")}>
              {l}
            </Link>
          ))}
          <span className="ml-auto text-xs text-muted">
            {games.length} of {total} games
          </span>
        </div>
      </div>
      {games.length === 0 && <EmptyState title="No games match these filters" action={<Link href={`/u/${username}`} className="btn-ghost">Clear filters</Link>} />}
      <ul className="space-y-2.5">
        {games.map((ug) => (
          <li key={ug.id}>
            <Link
              href={`/u/${username}/${ug.game.slug}`}
              className="card flex items-center gap-4 p-3 hover:border-muted sm:p-4"
            >
              <GameArt title={ug.game.title} hue={ug.game.coverHue} iconUrl={ug.game.iconUrl} size="sm" className="w-14 sm:w-16" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold">{ug.game.title}</span>
                  {ug.hasPlatinum && <TrophyIcon type="PLATINUM" size={16} />}
                  {ug.completedAt && <span className="chip border-good/40 text-good">100%</span>}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted">
                  <span>{ug.game.platforms.replace(",", " · ")}</span>
                  <span>
                    {ug.earnedCount}/{ug.game._count.trophies} trophies
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-flex items-center gap-0.5"><TrophyIcon type="GOLD" size={12} />{ug.earnedGold}</span>
                    <span className="inline-flex items-center gap-0.5"><TrophyIcon type="SILVER" size={12} />{ug.earnedSilver}</span>
                    <span className="inline-flex items-center gap-0.5"><TrophyIcon type="BRONZE" size={12} />{ug.earnedBronze}</span>
                  </span>
                  {ug.lastEarned && <span>last trophy {timeAgo(ug.lastEarned)}</span>}
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <ProgressBar value={ug.progress} tone={ug.progress === 100 ? "plat" : "accent"} className="max-w-md" label={`${ug.game.title} completion`} />
                  <span className="w-10 text-right text-sm font-semibold tabular-nums">{ug.progress}%</span>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

async function PlatinumTracker({ userId, username }: { userId: string; username: string }) {
  const [plats, close] = await Promise.all([
    prisma.userGame.findMany({
      where: { userId, hasPlatinum: true },
      orderBy: { platinumAt: "asc" },
      include: { game: { include: { trophies: { where: { type: "PLATINUM" }, select: { earnedRate: true } } } } },
    }),
    prisma.userGame.findMany({
      where: { userId, hasPlatinum: false, progress: { gte: 50 }, game: { trophies: { some: { type: "PLATINUM" } } } },
      orderBy: { progress: "desc" },
      take: 6,
      include: { game: true },
    }),
  ]);

  return (
    <div className="space-y-10">
      {close.length > 0 && (
        <section>
          <SectionTitle>Closest to platinum</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {close.map((ug) => (
              <Link key={ug.id} href={`/u/${username}/${ug.game.slug}`} className="card flex items-center gap-3 p-3 hover:border-muted">
                <GameArt title={ug.game.title} hue={ug.game.coverHue} iconUrl={ug.game.iconUrl} size="sm" className="w-12" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{ug.game.title}</div>
                  <ProgressBar value={ug.progress} className="mt-1.5" label={`${ug.game.title} completion`} />
                </div>
                <span className="font-bold tabular-nums">{ug.progress}%</span>
              </Link>
            ))}
          </div>
        </section>
      )}
      <section>
        <SectionTitle>Platinum collection</SectionTitle>
        {plats.length === 0 ? (
          <EmptyState title="No platinums yet">The first one is always the sweetest.</EmptyState>
        ) : (
          <ol className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {[...plats].reverse().map((ug) => {
              const n = plats.indexOf(ug) + 1;
              const rate = ug.game.trophies[0]?.earnedRate;
              return (
                <li key={ug.id}>
                  <Link href={`/u/${username}/${ug.game.slug}`} className="group card block p-3 hover:border-plat/60">
                    <div className="relative">
                      <GameArt title={ug.game.title} hue={ug.game.coverHue} iconUrl={ug.game.iconUrl} className="w-full" />
                      <span className="absolute left-2 top-2 rounded-sm bg-bg/80 px-2 py-0.5 text-xs font-bold">
                        #{n}
                      </span>
                      <TrophyIcon type="PLATINUM" size={30} className="absolute bottom-2 right-2 drop-shadow-lg" />
                    </div>
                    <div className="mt-2 truncate font-semibold group-hover:text-accent-text">{ug.game.title}</div>
                    <div className="flex items-center justify-between text-xs text-muted">
                      <span>{formatDate(ug.platinumAt)}</span>
                      {rate != null && <span>{rate.toFixed(1)}%</span>}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

async function Milestones({ userId, stats, isOwner }: { userId: string; stats: Awaited<ReturnType<typeof getUserStats>>; isOwner: boolean }) {
  const [milestones, rarest] = await Promise.all([
    getMilestones(userId, stats),
    prisma.userTrophy.findMany({
      where: { userId },
      orderBy: { trophy: { earnedRate: { sort: "asc", nulls: "last" } } },
      take: 5,
      include: { trophy: { include: { game: true } } },
    }),
  ]);
  const achieved = milestones.filter((m) => m.achieved).sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0));
  const next = milestones.filter((m) => !m.achieved).slice(0, 4);
  const icon = { trophy: "BRONZE", platinum: "PLATINUM", rare: "GOLD", complete: "SILVER" } as const;

  return (
    <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
      <section>
        <SectionTitle>Timeline</SectionTitle>
        <ol className="relative space-y-4 border-l border-line pl-6">
          {achieved.map((m) => (
            <li key={m.key} className="relative">
              <span className="absolute -left-[37px] top-1 flex h-7 w-7 items-center justify-center rounded-sm border border-line bg-surface">
                <TrophyIcon type={icon[m.kind]} size={16} />
              </span>
              <div className="card p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold">{m.label}</span>
                  <span className="text-xs text-muted">{formatDate(m.at)}</span>
                </div>
                {m.detail && (
                  <div className="text-sm text-muted">
                    {m.gameSlug ? <Link href={`/games/${m.gameSlug}`} className="hover:text-text">{m.detail}</Link> : m.detail}
                  </div>
                )}
              </div>
            </li>
          ))}
          {achieved.length === 0 && <li className="text-muted">No milestones yet.</li>}
        </ol>
      </section>
      <div className="space-y-8">
        <section>
          <SectionTitle>Up next</SectionTitle>
          <ul className="space-y-2">
            {next.map((m) => (
              <li key={m.key} className="card flex items-center gap-3 p-3 opacity-80">
                <TrophyIcon type={icon[m.kind]} size={20} dim />
                <span className="font-semibold">{m.label}</span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <SectionTitle>Rarest trophies</SectionTitle>
          <ul className="card divide-y divide-line">
            {rarest.map((ut) => (
              <li key={ut.id} className="flex items-center gap-3 px-4 py-3">
                <TrophyIcon type={ut.trophy.type} size={22} />
                <div className="min-w-0 flex-1">
                  <SpoilerName hidden={ut.trophy.hidden && !isOwner}>
                    <Link href={ut.trophy.slug ? trophyHref(ut.trophy.game.slug, ut.trophy.slug) : `/trophies/${ut.trophy.id}`} className="block truncate font-semibold hover:text-accent-text">{ut.trophy.name}</Link>
                  </SpoilerName>
                  <div className="truncate text-xs text-muted">{ut.trophy.game.title}</div>
                </div>
                <RarityBadge rate={ut.trophy.earnedRate} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

async function FriendsTab({ userId }: { userId: string }) {
  const ids = await getFriendIds(userId);
  const friends = await prisma.user.findMany({
    where: { id: { in: ids } },
    include: { psn: true, _count: { select: { games: { where: { hasPlatinum: true } } } } },
    orderBy: { username: "asc" },
  });
  if (!friends.length) return <EmptyState title="No friends yet" />;
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {friends.map((f) => (
        <li key={f.id}>
          <Link href={`/u/${f.username}`} className="card flex items-center gap-3 p-3 hover:border-muted">
            <Avatar name={f.psn?.onlineId ?? f.username} hue={f.avatarHue} url={f.psn?.avatarUrl} avatar={f.avatar} size={44} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">
                {f.psn?.onlineId ?? f.username} <span className="text-xs">{flag(f.country)}</span>
              </div>
              <div className="text-xs text-muted">@{f.username}</div>
            </div>
            {f.profileVisibility === "PUBLIC" && (
              <span className="inline-flex items-center gap-1 text-sm font-semibold">
                <TrophyIcon type="PLATINUM" size={16} /> {f._count.games}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
