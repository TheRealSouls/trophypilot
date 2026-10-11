import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { familiesFor } from "@/lib/games";
import { GAME_PLATFORMS, GAME_SORTS, GAMES_PER_PAGE, gameGenres, gamesListPage, type GameSort } from "@/lib/games-list";
import { platformName } from "@/lib/utils";
import { GameCard } from "@/components/GameCard";
import { EmptyState, PageHeader } from "@/components/ui";
import { GameFilterForm } from "./GameFilterForm";

export const metadata: Metadata = { title: "Games", description: "Every PlayStation game with trophy lists, difficulty and time-to-platinum estimates." };

type Search = { q?: string; platform?: string; genre?: string; sort?: string; online?: string; page?: string };

export default async function GamesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const sort: GameSort = sp.sort && sp.sort in GAME_SORTS ? (sp.sort as GameSort) : "popular";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const platform = GAME_PLATFORMS.includes(sp.platform ?? "") ? sp.platform! : "";
  const filters = { q: sp.q?.trim().slice(0, 80) ?? "", platform, genre: sp.genre ?? "", online: sp.online === "0" };

  const [{ games, total }, genres] = await Promise.all([gamesListPage(filters, sort, page), gameGenres()]);
  const families = await familiesFor(games.map((g) => g.titleKey));
  const pages = Math.max(1, Math.ceil(total / GAMES_PER_PAGE));

  const qs = (o: Partial<Search>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, page: undefined, ...o }).filter(([, v]) => v) as [string, string][]);
    return `/games?${p}`;
  };

  return (
    <div>
      <PageHeader kicker="Game database" title="Games">
        Trophy lists, DLC, difficulty and time estimates for every game in the catalogue.
      </PageHeader>

      <GameFilterForm q={filters.q} platform={platform} genre={filters.genre} online={filters.online} sort={sort} genres={genres} />

      <nav aria-label="Platform" className="mb-3 flex flex-wrap items-center gap-2">
        <span className="w-20 text-xs uppercase tracking-wider text-muted">Platform</span>
        {["", ...GAME_PLATFORMS].map((p) => (
          <Link
            key={p || "all"}
            href={qs({ platform: p || undefined })}
            aria-current={platform === p ? "true" : undefined}
            className={clsx("chip min-h-7 px-3", platform === p && "chip-active")}
          >
            {p ? platformName(p) : "All"}
          </Link>
        ))}
      </nav>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="w-20 text-xs uppercase tracking-wider text-muted">Sort</span>
        {Object.entries(GAME_SORTS).map(([k, l]) => (
          <Link key={k} href={qs({ sort: k })} className={clsx("chip min-h-6", sort === k && "chip-active")}>
            {l}
          </Link>
        ))}
        <span className="ml-auto text-sm text-muted">{total.toLocaleString("en-GB")} games</span>
      </div>

      <h2 className="sr-only">Results</h2>
      {games.length === 0 ? (
        <EmptyState title="No games match" action={<Link href="/games" className="btn-ghost">Clear filters</Link>} />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {games.map((g) => (
            <GameCard key={g.id} game={{ ...g, platRate: g.trophies[0]?.earnedRate ?? null }} family={families.get(g.titleKey)} />
          ))}
        </div>
      )}

      {pages > 1 && (
        <nav className="mt-8 flex items-center justify-between border-t border-line pt-4 text-sm" aria-label="Pagination">
          {page > 1 ? <Link href={qs({ page: String(page - 1) })} className="btn-ghost">Previous</Link> : <span />}
          <span className="text-muted">
            Page {page} of {pages.toLocaleString("en-GB")}
          </span>
          {page < pages ? <Link href={qs({ page: String(page + 1) })} className="btn-ghost">Next</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
