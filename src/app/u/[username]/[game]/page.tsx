import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { GameArt } from "@/components/art";
import { TrophyList } from "@/components/TrophyList";
import { ReportButton } from "@/components/ReportButton";
import { sortParam } from "@/lib/trophies";
import { RevealAllButton, SpoilerGroup } from "@/components/client";
import { TrophyIcon } from "@/components/TrophyIcon";
import { EmptyState, ProgressBar } from "@/components/ui";
import { loadProfile } from "../profile-data";
import { getCurrentUser } from "@/lib/auth";
import { isStaff } from "@/lib/roles";
import { checkTimestamps } from "@/lib/timestamps";
import { Notice } from "@/components/ui";
import { VoidForm } from "./VoidForm";

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
  const staff = isStaff(await getCurrentUser());

  return (
    <div>
      <nav className="mb-4 text-sm text-muted">
        <Link href={`/u/${owner.username}`} className="hover:text-text">{display}</Link> <span className="mx-1">/</span> {game.title}
      </nav>
      {/* Picture and title side by side, actions underneath on phones; one row from tablets up. */}
      <header className="card mb-6 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
          <div className="flex min-w-0 flex-1 items-center gap-4 sm:gap-5">
            <GameArt title={game.title} hue={game.coverHue} iconUrl={game.iconUrl} className="w-16 shrink-0 sm:w-24" />
            <div className="min-w-0 flex-1">
              <h1 className="break-words text-xl font-bold leading-tight sm:text-2xl">{game.title}</h1>
              <p className="mt-0.5 text-sm text-muted">
                {display}&apos;s progress
                {ug?.firstEarned && <> · started {formatDate(ug.firstEarned)}</>}
                {ug?.platinumAt && <> · platinum {formatDate(ug.platinumAt)}</>}
              </p>
              <div className="mt-3 flex max-w-lg items-center gap-3">
                <ProgressBar value={ug?.progress ?? 0} tone={ug?.progress === 100 ? "plat" : "accent"} />
                <span className="text-lg font-bold tabular-nums">{ug?.progress ?? 0}%</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
            {ug?.hasPlatinum && (
              <span className="inline-flex items-center gap-2 rounded-sm border border-plat/40 bg-plat/10 px-3 py-1 text-sm font-semibold text-plat">
                <TrophyIcon type="PLATINUM" size={16} /> Platinum
              </span>
            )}
            <Link href={`/games/${game.slug}`} className="btn-ghost">Game page & guides</Link>
            {ug && (
              <ReportButton
                type="TROPHY_LIST"
                id={`${owner.id}:${game.id}`}
                authorId={owner.id}
                what={`${display}'s ${game.title} trophy list`}
                label="Report as hacked or cheated"
              />
            )}
          </div>
        </div>
      </header>

      {ug?.voidedAt && (
        <Notice tone="bad" className="mb-6">
          <strong>Voided by staff.</strong> These trophies don&apos;t count on any leaderboard. {ug.voidReason}
        </Notice>
      )}

      {staff && ug && earnedRows.length > 0 && (
        <TimestampCheck
          userGameId={ug.id}
          voided={!!ug.voidedAt}
          release={game.releaseDate}
          unlocks={earnedRows.flatMap((r) => {
            const t = game.trophies.find((x) => x.id === r.trophyId);
            return t ? [{ id: t.id, name: t.name, type: t.type, earnedAt: r.earnedAt, isDlc: !!game.groups.find((g) => g.id === t.groupId)?.isDlc }] : [];
          })}
        />
      )}

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

/**
 * Staff only: every unlock on this list in order, to the second in UTC, with the gap since the one before,
 * and anything that looks edited flagged. Voiding takes the list off the leaderboards.
 */
function TimestampCheck({
  userGameId,
  voided,
  release,
  unlocks,
}: {
  userGameId: string;
  voided: boolean;
  release: Date | null;
  unlocks: { id: string; name: string; type: string; earnedAt: Date; isDlc: boolean }[];
}) {
  const list = [...unlocks].sort((a, b) => a.earnedAt.getTime() - b.earnedAt.getTime());
  const flags = checkTimestamps(list, release);
  const flagged = new Set(flags.flatMap((f) => f.ids));
  const gap = (ms: number) =>
    ms < 60_000 ? `${Math.round(ms / 1000)}s` : ms < 3_600_000 ? `${Math.round(ms / 60_000)}m` : ms < 86_400_000 ? `${Math.round(ms / 3_600_000)}h` : `${Math.round(ms / 86_400_000)}d`;
  return (
    <details className="card mb-6 p-4" open={flags.length > 0}>
      <summary className="cursor-pointer font-semibold">
        Staff: unlock times {flags.length ? <span className="ml-2 chip border-bad/50 text-bad">{flags.length} to check</span> : <span className="ml-2 chip">nothing unusual</span>}
      </summary>
      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="min-w-0">
          {flags.length > 0 && (
            <ul className="mb-3 space-y-1 text-sm text-bad">
              {flags.map((f) => (
                <li key={f.kind + f.text}>{f.text}</li>
              ))}
            </ul>
          )}
          <div className="max-h-96 overflow-y-auto rounded-md border border-line">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-surface-2 text-muted">
                <tr>
                  <th className="px-3 py-2 font-semibold">Earned (UTC)</th>
                  <th className="px-3 py-2 font-semibold">Gap</th>
                  <th className="px-3 py-2 font-semibold">Trophy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.map((u, i) => (
                  <tr key={u.id} className={flagged.has(u.id) ? "bg-bad/10" : undefined}>
                    <td className="whitespace-nowrap px-3 py-1.5 font-mono tabular-nums">{u.earnedAt.toISOString().replace("T", " ").slice(0, 19)}</td>
                    <td className="px-3 py-1.5 tabular-nums text-muted">{i ? gap(u.earnedAt.getTime() - list[i - 1].earnedAt.getTime()) : ""}</td>
                    <td className="px-3 py-1.5">
                      <span className="inline-flex items-center gap-1.5">
                        <TrophyIcon type={u.type} size={12} /> {u.name}
                        {u.isDlc && <span className="text-faint">DLC</span>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-faint">Times are as PSN reports them. Bursts can be normal (a cutscene unlocking several trophies); compare with the game&apos;s guide.</p>
        </div>
        <VoidForm userGameId={userGameId} voided={voided} />
      </div>
    </details>
  );
}
