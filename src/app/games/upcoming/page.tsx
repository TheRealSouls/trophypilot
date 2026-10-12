import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/forum";
import { cached } from "@/lib/cache";
import { formatDate, timeAgo } from "@/lib/utils";
import { GameArt } from "@/components/art";
import { TrophyIcon } from "@/components/TrophyIcon";
import { EmptyState, PageHeader } from "@/components/ui";
import { ImportListForm } from "./ImportListForm";

export const metadata: Metadata = {
  title: "Upcoming trophy lists",
  description: "Trophy lists that have appeared on PlayStation Network before anyone is playing, often before release.",
};

const card = { id: true, slug: true, title: true, platforms: true, iconUrl: true, coverHue: true, releaseDate: true, createdAt: true, npCommunicationId: true } as const;

/**
 * Trophy lists nobody we track is playing yet: games releasing soon, and the
 * newest lists on PSN. A discovered list doesn't mean the game is out, so
 * each one says which is which.
 */
export default async function UpcomingPage() {
  const user = await getCurrentUser();
  const { soon, fresh } = await cached(
    "games:upcoming",
    async () => {
      const unplayed = { players: 0, userGames: { none: {} } } as const;
      const [soon, fresh] = await Promise.all([
        prisma.game.findMany({ where: { ...unplayed, releaseDate: { gt: new Date() } }, orderBy: { releaseDate: "asc" }, take: 30, select: card }),
        prisma.game.findMany({
          where: { ...unplayed, npCommunicationId: { startsWith: "NPWR" } },
          orderBy: { npCommunicationId: "desc" },
          take: 60,
          select: { ...card, _count: { select: { trophies: true } } },
        }),
      ]);
      return { soon, fresh };
    },
    { ttlMs: 10 * 60_000, tags: ["games"] },
  );

  return (
    <div>
      <nav className="mb-4 text-sm text-muted">
        <Link href="/games" className="hover:text-text">Games</Link> <span className="mx-1">/</span> Upcoming
      </nav>
      <PageHeader kicker="Game database" title="Upcoming trophy lists">
        Trophy lists that have appeared on PlayStation Network before anyone we track is playing. Studios often publish them
        before release, so a list being here doesn&apos;t mean the game is out yet. Add one to your wishlist to keep an eye on it.
      </PageHeader>

      {isAdmin(user) && (
        <section className="card mb-8 p-5">
          <h2 className="mb-1 font-bold">Add a trophy list by its id</h2>
          <p className="mb-3 text-sm text-muted">
            Staff only. Paste a PSN trophy list id (like NPWR12345_00) and we&apos;ll fetch its trophies, even if nobody has played it.
          </p>
          <ImportListForm />
        </section>
      )}

      {soon.length > 0 && (
        <section className="mb-10" aria-labelledby="soon">
          <h2 id="soon" className="mb-3 text-sm font-bold uppercase tracking-wider">Releasing soon</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {soon.map((g) => (
              <li key={g.id}>
                <Link href={`/games/${g.slug}`} className="card flex items-center gap-3 p-3 hover:border-muted">
                  <GameArt title={g.title} hue={g.coverHue} iconUrl={g.iconUrl} size="sm" className="w-12" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{g.title}</span>
                    <span className="block text-xs text-muted">
                      Releases {formatDate(g.releaseDate!)} · {g.platforms.split(",").join(" · ")}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="fresh">
        <h2 id="fresh" className="mb-3 text-sm font-bold uppercase tracking-wider">Newest lists, nobody tracked yet</h2>
        {fresh.length === 0 ? (
          <EmptyState title="Nothing new right now">New lists show up here as PSN publishes them.</EmptyState>
        ) : (
          <ul className="card divide-y divide-line">
            {fresh.map((g) => (
              <li key={g.id} className="flex items-center gap-3 px-4 py-3">
                <GameArt title={g.title} hue={g.coverHue} iconUrl={g.iconUrl} size="sm" className="w-11" />
                <span className="min-w-0 flex-1">
                  <Link href={`/games/${g.slug}`} className="block truncate font-semibold hover:underline hover:underline-offset-4">
                    {g.title}
                  </Link>
                  <span className="block truncate text-xs text-muted">
                    {g.platforms.split(",").join(" · ")} · list found {timeAgo(g.createdAt)}
                    {g.releaseDate ? (g.releaseDate > new Date() ? ` · releases ${formatDate(g.releaseDate)}` : " · released") : ""}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted">
                  {g._count.trophies ? (
                    <>
                      <TrophyIcon type="BRONZE" size={13} /> {g._count.trophies} trophies
                    </>
                  ) : (
                    "list not loaded yet"
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
