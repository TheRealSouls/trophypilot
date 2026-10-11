import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { after } from "next/server";
import { datePlatinums, storePlayerTitles } from "@/lib/psn/players";
import { getPsnProfile, getPsnTitles, PSN_ONLINE_ID, type PsnPublicProfile } from "@/lib/psn/lookup";
import { isDemoMode } from "@/lib/psn/sync";
import { rateLimit } from "@/lib/rate-limit";
import { SITE } from "@/lib/site";
import { formatNumber, timeAgo } from "@/lib/utils";
import { GameArt } from "@/components/art";
import { TrophyCounts, TrophyIcon } from "@/components/TrophyIcon";
import {
  Avatar,
  EmptyState,
  LevelMeter,
  Notice,
  ProgressBar,
  SectionTitle,
  SkeletonRows,
  SkeletonRegion,
  Stat,
  StatGrid,
} from "@/components/ui";

export const dynamic = "force-dynamic";

type Params = { onlineId: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const id = decodeURIComponent((await params).onlineId);
  return {
    title: `${id} on PSN`,
    description: `${id}'s PlayStation trophy level, trophy counts and recently played games.`,
    robots: { index: false },
  };
}

const PER_PAGE = 200;

export default async function PsnProfilePage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ page?: string }>;
}) {
  const page = Math.max(1, Number.parseInt((await searchParams).page ?? "1", 10) || 1);
  const onlineId = decodeURIComponent((await params).onlineId).trim();
  if (!PSN_ONLINE_ID.test(onlineId)) notFound();

  if (isDemoMode()) {
    return (
      <Wrapper onlineId={onlineId}>
        <EmptyState title="PSN lookups are switched off">
          This server is running in demo mode without a PSN service token, so it can&apos;t read live profiles from PlayStation
          Network. The operator can enable lookups by setting PSN_NPSSO.
        </EmptyState>
      </Wrapper>
    );
  }

  if (!(await rateLimit("psn-lookup", 40, 10 * 60_000))) {
    return (
      <Wrapper onlineId={onlineId}>
        <Notice tone="warn">You&apos;ve looked up a lot of profiles in a short time. Wait a few minutes and try again.</Notice>
      </Wrapper>
    );
  }

  // When we've seen this player before, their games start loading alongside the profile instead of after it.
  const known = await prisma.psnPlayer.findFirst({
    where: { onlineId: { equals: onlineId, mode: "insensitive" } },
    select: { accountId: true },
  });
  const titlesEarly = known ? getPsnTitles(known.accountId, { limit: PER_PAGE, offset: (page - 1) * PER_PAGE }) : null;
  const res = await getPsnProfile(onlineId);
  if (!res.ok) {
    return (
      <Wrapper onlineId={onlineId}>
        <Notice tone={res.kind === "rate_limited" ? "warn" : "bad"}>
          {res.kind === "rate_limited"
            ? "PlayStation Network is limiting how fast we can ask for profiles. Try again in a minute."
            : "We couldn't reach PlayStation Network just now. Try again in a few minutes."}
        </Notice>
      </Wrapper>
    );
  }
  if (!res.data) {
    return (
      <Wrapper onlineId={onlineId}>
        <EmptyState
          title={`No PSN account called ${onlineId}`}
          action={
            <Link href="/search" className="btn-ghost">
              Search again
            </Link>
          }
        >
          Online IDs are exact. Check the spelling, including underscores and hyphens.
        </EmptyState>
      </Wrapper>
    );
  }

  const p = res.data;
  const [linked, viewer, tracked] = await Promise.all([
    prisma.psnAccount.findFirst({
      where: { accountId: p.accountId, verified: true },
      select: { user: { select: { username: true } } },
    }),
    getCurrentUser(),
    prisma.psnPlayer.findUnique({ where: { accountId: p.accountId }, select: { hidden: true } }),
  ]);
  if (tracked?.hidden && !linked) {
    return (
      <Wrapper onlineId={p.onlineId}>
        <EmptyState title="This profile isn't shown here">The player asked to be removed from {SITE.name}.</EmptyState>
      </Wrapper>
    );
  }

  return (
    <div>
      <nav className="mb-4 text-xs text-muted">
        <Link href="/search" className="hover:text-text">
          Search
        </Link>{" "}
        <span className="mx-1">/</span> PSN profile
      </nav>
      <Header profile={p} />

      {linked ? (
        <Notice className="mb-8">
          {p.onlineId} is on {SITE.name}.{" "}
          <Link href={`/u/${linked.user.username}`} className="link">
            See their full trophy history, platinums and milestones
          </Link>
          .
        </Notice>
      ) : (
        <Notice className="mb-8">
          Is this your account?{" "}
          <Link href={viewer ? "/settings#psn" : "/register"} className="link">
            {viewer ? "Link it" : "Create a free account and link it"}
          </Link>{" "}
          to sync your full trophy history and appear on the leaderboards.
        </Notice>
      )}

      <Suspense
        fallback={
          <SkeletonRegion label="Loading games">
            <SkeletonRows rows={8} />
          </SkeletonRegion>
        }
      >
        <TitleList
          accountId={p.accountId}
          onlineId={p.onlineId}
          page={page}
          early={known?.accountId === p.accountId ? titlesEarly : null}
        />
      </Suspense>
    </div>
  );
}

function Wrapper({ onlineId, children }: { onlineId: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl">
      <nav className="mb-4 text-xs text-muted">
        <Link href="/search" className="hover:text-text">
          Search
        </Link>{" "}
        <span className="mx-1">/</span> PSN profile
      </nav>
      <h1 className="mb-6 text-2xl font-bold">{onlineId}</h1>
      {children}
    </div>
  );
}

function Header({ profile: p }: { profile: PsnPublicProfile }) {
  const total = p.earned.platinum + p.earned.gold + p.earned.silver + p.earned.bronze;
  return (
    <section className="mb-6 border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-5 p-5 sm:p-6">
        <Avatar name={p.onlineId} hue={0} url={p.avatarUrl} size={96} className="border border-line" />
        <div className="min-w-0 flex-1">
          <h1 className="break-all text-2xl font-bold tracking-tight sm:text-3xl">{p.onlineId}</h1>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <span className="chip">PSN</span>
            {p.isPlus && <span className="chip border-gold/50 text-gold">PS Plus</span>}
            {p.verified && <span className="chip">Verified by PlayStation</span>}
          </div>
        </div>
        {p.trophyLevel > 0 ? (
          <div className="w-full sm:w-56">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] uppercase tracking-wider text-muted">Trophy level</span>
              <span className="text-2xl font-bold tabular-nums">{p.trophyLevel}</span>
            </div>
            <LevelMeter level={p.trophyLevel} progress={p.levelProgress} className="mt-1.5" />
          </div>
        ) : (
          <span className="chip">Trophies private</span>
        )}
      </div>
      {p.trophyLevel > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 sm:px-6">
          <TrophyCounts {...p.earned} size={18} className="flex-wrap" />
          <span className="text-sm text-muted">{formatNumber(total)} trophies</span>
        </div>
      )}
    </section>
  );
}

async function TitleList({
  accountId,
  onlineId,
  page,
  early,
}: {
  accountId: string;
  onlineId: string;
  page: number;
  /** The same request, already started alongside the profile. */
  early: ReturnType<typeof getPsnTitles> | null;
}) {
  const res = await (early ?? getPsnTitles(accountId, { limit: PER_PAGE, offset: (page - 1) * PER_PAGE }));
  if (!res.ok) {
    if (res.kind === "private")
      return (
        <EmptyState title="This trophy list is private">
          {onlineId} has set their PSN trophies to private, so only their profile summary is visible. Players can change this on
          PS5 under Settings, Users and Accounts, Privacy, Gaming | Media.
        </EmptyState>
      );
    return <Notice tone="bad">We couldn&apos;t load {onlineId}&apos;s games from PlayStation Network. Try again shortly.</Notice>;
  }
  const { titles, total } = res.data;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  if (titles.length === 0 && page > 1)
    return (
      <EmptyState title="No more games">
        {onlineId} has {formatNumber(total)} games in total.
      </EmptyState>
    );
  if (titles.length === 0)
    return <EmptyState title="No games yet">{onlineId} hasn&apos;t synced any trophies to PSN.</EmptyState>;

  // Every game we see grows the catalogue, so it becomes searchable on the site.
  // Link games already in the catalogue now; new ones are added in the background below (storePlayerTitles imports them).
  const slugs = new Map(
    (
      await prisma.game.findMany({
        where: { npCommunicationId: { in: titles.map((t) => t.npCommunicationId) } },
        select: { slug: true, npCommunicationId: true },
      })
    ).map((g) => [g.npCommunicationId!, g.slug]),
  );
  // Their recent games and platinums also feed the home page and weekly boards. Runs after the response.
  after(async () => {
    try {
      await storePlayerTitles(
        accountId,
        titles.map((t) => ({
          npCommunicationId: t.npCommunicationId,
          npServiceName: t.npServiceName,
          trophyTitleName: t.title,
          trophyTitleIconUrl: t.iconUrl,
          trophyTitlePlatform: t.platforms.join(","),
          progress: t.progress,
          earnedTrophies: t.earned,
          definedTrophies: t.defined,
          lastUpdatedDateTime: t.lastUpdated,
        })),
      );
      await datePlatinums(accountId, 3);
      await prisma.psnPlayer.updateMany({ where: { accountId }, data: { titlesRefreshedAt: new Date() } });
    } catch (err) {
      console.error("[players] storing lookup titles failed", err);
    }
  });
  const plats = titles.filter((t) => t.earned.platinum > 0).length;
  const avg = Math.round(titles.reduce((s, t) => s + t.progress, 0) / titles.length);
  const complete = titles.filter((t) => t.progress === 100).length;
  // PSN pages the list; lifetime totals are in the header.
  const partial = pages > 1;
  const base = `/psn/${encodeURIComponent(onlineId)}`;

  return (
    <section>
      <StatGrid className="mb-8 grid-cols-2 sm:grid-cols-4">
        <Stat
          label="Games"
          value={formatNumber(total)}
          sub={
            partial
              ? `showing ${formatNumber((page - 1) * PER_PAGE + 1)} to ${formatNumber((page - 1) * PER_PAGE + titles.length)}`
              : undefined
          }
        />
        <Stat label="Platinums" value={formatNumber(plats)} sub={partial ? "on this page" : undefined} />
        <Stat label="100% games" value={formatNumber(complete)} sub={partial ? "on this page" : undefined} />
        <Stat label="Avg completion" value={`${avg}%`} sub={partial ? "on this page" : undefined} />
      </StatGrid>

      <SectionTitle
        action={
          partial ? (
            <span className="text-xs text-muted">
              Page {page} of {pages}
            </span>
          ) : undefined
        }
      >
        {page === 1 ? "Recently played" : "Games"}
      </SectionTitle>
      <ul className="divide-y divide-line border-y border-line">
        {titles.map((t) => {
          const slug = slugs.get(t.npCommunicationId);
          const earned = t.earned.platinum + t.earned.gold + t.earned.silver + t.earned.bronze;
          const defined = t.defined.platinum + t.defined.gold + t.defined.silver + t.defined.bronze;
          const body = (
            <>
              <GameArt title={t.title} hue={0} iconUrl={t.iconUrl} size="sm" className="w-12 sm:w-14" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold group-hover:underline group-hover:underline-offset-4">
                    {t.title}
                  </span>
                  {t.earned.platinum > 0 && <TrophyIcon type="PLATINUM" size={15} />}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
                  <span>{t.platforms.join(" / ")}</span>
                  <span>
                    {earned}/{defined} trophies
                  </span>
                  <span>last trophy {timeAgo(t.lastUpdated)}</span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <ProgressBar value={t.progress} tone={t.progress === 100 ? "plat" : "accent"} className="max-w-sm" label={`${t.title} completion`} />
                  <span className="w-10 text-right text-xs font-semibold tabular-nums">{t.progress}%</span>
                </div>
              </div>
            </>
          );
          return (
            <li key={t.npCommunicationId}>
              {slug ? (
                <Link href={`/games/${slug}`} className="group flex items-center gap-4 py-3">
                  {body}
                </Link>
              ) : (
                <div className="flex items-center gap-4 py-3">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
      {partial && (
        <nav className="mt-6 flex items-center justify-between text-sm" aria-label="Pagination">
          {page > 1 ? (
            <Link href={`${base}?page=${page - 1}`} className="btn-ghost">
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link href={`${base}?page=${page + 1}`} className="btn-ghost">
              Next
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </section>
  );
}
