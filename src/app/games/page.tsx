import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { cached } from "@/lib/cache";
import { familiesFor } from "@/lib/games";
import { GameCard } from "@/components/GameCard";
import { EmptyState, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Games", description: "Every PlayStation game with trophy lists, difficulty and time-to-platinum estimates." };

const SORTS = {
  popular: "Most played",
  release: "Newest",
  easiest: "Easiest platinum",
  hardest: "Hardest platinum",
  shortest: "Shortest",
  title: "A to Z",
} as const;

type Search = { q?: string; platform?: string; genre?: string; sort?: keyof typeof SORTS; online?: string; page?: string };

const PER_PAGE = 60;

export default async function GamesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const sort = sp.sort && sp.sort in SORTS ? sp.sort : "popular";

  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const filters = { q: sp.q?.trim().slice(0, 80) ?? "", platform: sp.platform ?? "", genre: sp.genre ?? "", online: sp.online === "0" };

  // Shared by everyone browsing the same filters, so it's cached for a few minutes.
  const [{ games, total }, genres] = await Promise.all([
    cached(`games:${JSON.stringify([filters, sort, page])}`, () => gamesPage(filters, sort, page), { ttlMs: 5 * 60_000, tags: ["games"] }),
    cached(
      "games:genres",
      () =>
        prisma.$queryRaw<{ genre: string }[]>`SELECT DISTINCT "genre" FROM "Game" WHERE "genre" IS NOT NULL ORDER BY "genre"`,
      { ttlMs: 60 * 60_000, tags: ["games"] },
    ),
  ]);
  const families = await familiesFor(games.map((g) => g.titleKey));
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));

  const qs = (o: Partial<Search>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, page: undefined, ...o }).filter(([, v]) => v) as [string, string][]);
    return `/games?${p}`;
  };

  return (
    <div>
      <PageHeader kicker="Game database" title="Games">
        Trophy lists, DLC, difficulty and time estimates for every game in the catalogue.
      </PageHeader>

      <form className="card mb-6 grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto_auto]" action="/games">
        <label className="sr-only" htmlFor="gq">Search games</label>
        <input id="gq" name="q" defaultValue={sp.q} placeholder="Search by title…" className="input" />
        <select name="platform" defaultValue={sp.platform ?? ""} className="input" aria-label="Platform">
          <option value="">All platforms</option>
          {["PS5", "PS4", "PS3", "PSVITA"].map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select name="genre" defaultValue={sp.genre ?? ""} className="input" aria-label="Genre">
          <option value="">All genres</option>
          {genres.map((g) => (
            <option key={g.genre} value={g.genre!}>{g.genre}</option>
          ))}
        </select>
        <input type="hidden" name="sort" value={sort} />
        <button className="btn-primary">Filter</button>
        <label className="flex items-center gap-2 text-sm text-muted sm:col-span-4">
          <input type="checkbox" name="online" value="0" defaultChecked={sp.online === "0"} className="accent-[var(--color-accent)]" />
          Hide games with online trophies
        </label>
      </form>

      <div className="mb-5 flex flex-wrap gap-2">
        {Object.entries(SORTS).map(([k, l]) => (
          <Link key={k} href={qs({ sort: k as keyof typeof SORTS })} className={clsx("chip min-h-6", sort === k && "chip-active")}>
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
            Page {page} of {pages}
          </span>
          {page < pages ? <Link href={qs({ page: String(page + 1) })} className="btn-ghost">Next</Link> : <span />}
        </nav>
      )}
    </div>
  );
}

type GameFilters = { q: string; platform: string; genre: string; online: boolean };
type SortKey = keyof typeof SORTS;

/**
 * One page of games, one card per game: the trophy lists that share a
 * titleKey collapse into one, represented by the PS5 list when there is one.
 * The database picks the 60 ids (DISTINCT ON), so only those rows load.
 * "Most played" counts tracked players and members across all of a game's lists.
 */
async function gamesPage(f: GameFilters, sort: SortKey, page: number) {
  const where: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (f.q) where.push(Prisma.sql`g."title" ILIKE ${`%${f.q.replace(/[\%_]/g, (c) => `\${c}`)}%`}`);
  if (f.platform) where.push(Prisma.sql`g."platforms" LIKE ${`%${f.platform}%`}`);
  if (f.genre) where.push(Prisma.sql`g."genre" = ${f.genre}`);
  if (f.online) where.push(Prisma.sql`g."hasOnlineTrophies" = FALSE`);
  const filter = Prisma.join(where, " AND ");

  const order = {
    popular: Prisma.sql`COALESCE(p.n, 0) DESC`,
    release: Prisma.sql`r."releaseDate" DESC NULLS LAST`,
    easiest: Prisma.sql`r."difficulty" ASC NULLS LAST`,
    hardest: Prisma.sql`r."difficulty" DESC NULLS LAST`,
    shortest: Prisma.sql`r."hoursToPlatinum" ASC NULLS LAST`,
    title: Prisma.sql`r."title" ASC`,
  }[sort];
  const popularity =
    sort === "popular"
      ? Prisma.sql`LEFT JOIN (
          SELECT COALESCE(NULLIF(g2."titleKey", ''), g2."id") AS fam, COUNT(*) AS n
          FROM (SELECT "gameId" FROM "PsnPlayerTitle" UNION ALL SELECT "gameId" FROM "UserGame") x
          JOIN "Game" g2 ON g2."id" = x."gameId"
          GROUP BY 1
        ) p ON p.fam = r.fam`
      : Prisma.sql`LEFT JOIN (SELECT NULL::text AS fam, 0 AS n) p ON FALSE`;

  const [ids, count] = await Promise.all([
    prisma.$queryRaw<{ id: string }[]>`
      SELECT r."id" FROM (
        SELECT DISTINCT ON (COALESCE(NULLIF(g."titleKey", ''), g."id"))
          COALESCE(NULLIF(g."titleKey", ''), g."id") AS fam, g."id", g."title", g."releaseDate", g."difficulty", g."hoursToPlatinum"
        FROM "Game" g
        WHERE ${filter}
        ORDER BY COALESCE(NULLIF(g."titleKey", ''), g."id"), g."npServiceName" DESC NULLS LAST, g."title"
      ) r
      ${popularity}
      ORDER BY ${order}, r."title" ASC
      LIMIT ${PER_PAGE} OFFSET ${(page - 1) * PER_PAGE}`,
    prisma.$queryRaw<{ n: number }[]>`
      SELECT CAST(COUNT(DISTINCT COALESCE(NULLIF(g."titleKey", ''), g."id")) AS INTEGER) AS n FROM "Game" g WHERE ${filter}`,
  ]);
  const rows = await prisma.game.findMany({
    where: { id: { in: ids.map((r) => r.id) } },
    include: { trophies: { where: { type: "PLATINUM" }, select: { earnedRate: true } }, _count: { select: { trophies: true } } },
  });
  const byId = new Map(rows.map((g) => [g.id, g]));
  return { games: ids.flatMap((r) => byId.get(r.id) ?? []), total: Number(count[0]?.n ?? 0) };
}
