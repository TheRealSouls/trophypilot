import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { GameArt } from "@/components/art";
import { TrophyList } from "@/components/TrophyList";
import { sortParam } from "@/lib/trophies";
import { RevealAllButton, SpoilerGroup } from "@/components/client";
import { TrophyIcon } from "@/components/TrophyIcon";
import { EmptyState, ProgressBar } from "@/components/ui";
import { loadProfile } from "../profile-data";

type Params = { username: string; game: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { username, game } = await params;
  const g = await prisma.game.findUnique({ where: { slug: game }, select: { title: true } });
  return { title: `${username} · ${g?.title ?? "Game"} trophies` };
}

export default async function UserGamePage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ sort?: string; filter?: string }>;
}) {
  const { username, game: slug } = await params;
  const { sort = "default", filter = "all" } = await searchParams;
  const { owner, canView } = await loadProfile(username);
  if (!canView) return <EmptyState title="This profile isn't visible to you" />;

  const game = await prisma.game.findUnique({
    where: { slug },
    include: {
      groups: { orderBy: { psnGroupId: "asc" } },
      trophies: { include: { _count: { select: { tips: true } } } },
    },
  });
  if (!game) notFound();

  const [ug, earnedRows] = await Promise.all([
    prisma.userGame.findUnique({ where: { userId_gameId: { userId: owner.id, gameId: game.id } } }),
    prisma.userTrophy.findMany({ where: { userId: owner.id, trophy: { gameId: game.id } }, select: { trophyId: true, earnedAt: true } }),
  ]);
  const earned = new Map(earnedRows.map((r) => [r.trophyId, r.earnedAt]));
  const hiddenLeft = game.trophies.filter((t) => t.hidden && !earned.has(t.id)).length;
  const display = owner.psn?.onlineId ?? owner.username;

  return (
    <div>
      <nav className="mb-4 text-sm text-muted">
        <Link href={`/u/${owner.username}`} className="hover:text-text">{display}</Link> <span className="mx-1">/</span> {game.title}
      </nav>
      <header className="card mb-6 flex flex-wrap items-center gap-5 p-5">
        <GameArt title={game.title} hue={game.coverHue} iconUrl={game.iconUrl} className="w-24" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">{game.title}</h1>
          <p className="text-sm text-muted">
            {display}&apos;s progress
            {ug?.firstEarned && <> · started {formatDate(ug.firstEarned)}</>}
            {ug?.platinumAt && <> · platinum {formatDate(ug.platinumAt)}</>}
          </p>
          <div className="mt-3 flex max-w-lg items-center gap-3">
            <ProgressBar value={ug?.progress ?? 0} tone={ug?.progress === 100 ? "plat" : "accent"} />
            <span className="text-lg font-bold tabular-nums">{ug?.progress ?? 0}%</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {ug?.hasPlatinum && (
            <span className="inline-flex items-center gap-2 rounded-sm border border-plat/40 bg-plat/10 px-3 py-1 text-sm font-semibold text-plat">
              <TrophyIcon type="PLATINUM" size={16} /> Platinum
            </span>
          )}
          <Link href={`/games/${game.slug}`} className="btn-ghost">Game page & guides</Link>
        </div>
      </header>

      <SpoilerGroup>
      <h2 className="sr-only">Trophies</h2>
      {hiddenLeft > 0 && (
        <div className="mb-3 flex justify-end">
          <RevealAllButton count={hiddenLeft} className="chip hover:text-text" />
        </div>
      )}

      <TrophyList
        gameSlug={game.slug}
        groups={game.groups}
        trophies={game.trophies}
        earned={earned}
        ownerLabel={display}
        sort={sortParam(sort)}
        show={filter === "earned" || filter === "unearned" ? filter : "all"}
      />
      </SpoilerGroup>
    </div>
  );
}
