import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { GameArt } from "@/components/art";
import { TrophyList } from "@/components/TrophyList";
import { TrophyIcon } from "@/components/TrophyIcon";
import { Stat, StatGrid } from "@/components/ui";
import { loadGame } from "../../data";

type Params = { slug: string; group: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug, group } = await params;
  const game = await loadGame(slug);
  const g = game.groups.find((x) => x.psnGroupId === group);
  return { title: g ? `${g.name} (${game.title} DLC) Trophies` : "DLC" };
}

export default async function DlcPage({ params }: { params: Promise<Params> }) {
  const { slug, group } = await params;
  const game = await loadGame(slug);
  const dlc = game.groups.find((g) => g.psnGroupId === group && g.isDlc);
  if (!dlc) notFound();

  const trophies = game.trophies.filter((t) => t.groupId === dlc.id);
  const viewerId = await getSessionUserId();
  const [mine, completers] = await Promise.all([
    viewerId
      ? prisma.userTrophy.findMany({ where: { userId: viewerId, trophyId: { in: trophies.map((t) => t.id) } }, select: { trophyId: true, earnedAt: true } })
      : [],
    // Players who have every trophy in this DLC.
    prisma.userTrophy.groupBy({
      by: ["userId"],
      where: { trophyId: { in: trophies.map((t) => t.id) } },
      _count: true,
      having: { trophyId: { _count: { equals: trophies.length } } },
    }),
  ]);
  const rates = trophies.map((t) => t.earnedRate).filter((r): r is number => r != null);
  const rarest = rates.length ? Math.min(...rates) : null;
  const owners = await prisma.userGame.count({ where: { gameId: game.id } });
  const hasProgress = viewerId ? await prisma.userGame.findUnique({ where: { userId_gameId: { userId: viewerId, gameId: game.id } } }) : null;

  return (
    <div>
      <nav className="mb-4 text-sm text-muted">
        <Link href={`/games/${game.slug}`} className="hover:text-text">{game.title}</Link> <span className="mx-1">/</span> DLC
      </nav>
      <header className="card mb-6 flex flex-wrap items-center gap-5 p-6">
        <GameArt title={dlc.name} hue={(game.coverHue + 40) % 360} iconUrl={dlc.iconUrl ?? game.iconUrl} className="w-24" />
        <div className="flex-1">
          <span className="chip border-very/40 text-very">DLC · {game.title}</span>
          <h1 className="mt-2 text-3xl font-bold">{dlc.name}</h1>
          <p className="text-sm text-muted">
            {dlc.releaseDate ? `Released ${formatDate(dlc.releaseDate)}` : ""} · {trophies.length} trophies · not required for the platinum
          </p>
        </div>
        <div className="flex gap-3 text-sm font-semibold">
          {(["GOLD", "SILVER", "BRONZE"] as const).map((t) => (
            <span key={t} className="inline-flex items-center gap-1">
              <TrophyIcon type={t} size={18} /> {trophies.filter((x) => x.type === t).length}
            </span>
          ))}
        </div>
      </header>
      <StatGrid className="mb-6 grid-cols-2 sm:grid-cols-3">
        <Stat label="Members with 100%" value={completers.length} />
        <Stat label="Completion rate" value={owners ? `${Math.round((completers.length / owners) * 100)}%` : "n/a"} sub="of members who own the game" />
        <Stat label="Rarest trophy" value={rarest != null ? `${rarest.toFixed(1)}%` : "n/a"} />
      </StatGrid>
      <TrophyList
        gameSlug={game.slug}
        groups={[dlc]}
        trophies={trophies}
        earned={hasProgress ? new Map(mine.map((m) => [m.trophyId, m.earnedAt])) : undefined}
      />
    </div>
  );
}
