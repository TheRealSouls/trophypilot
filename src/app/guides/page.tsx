import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { prisma } from "@/lib/db";
import { formatNumber, timeAgo } from "@/lib/utils";
import { GameArt } from "@/components/art";
import { DifficultyMeter, EmptyState, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Trophy Guides", description: "Community trophy guides and platinum roadmaps." };

export default async function GuidesPage({ searchParams }: { searchParams: Promise<{ q?: string; sort?: string }> }) {
  const { q, sort = "new" } = await searchParams;
  const guides = await prisma.guide.findMany({
    where: q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { game: { title: { contains: q, mode: "insensitive" } } }] } : undefined,
    orderBy: sort === "new" ? { createdAt: "desc" } : sort === "easy" ? { difficulty: "asc" } : { views: "desc" },
    include: { game: true, author: { include: { psn: true } }, _count: { select: { steps: true, tips: true } } },
  });

  return (
    <div>
      <PageHeader kicker="Trophy guides" title="Roadmaps, missables & collectibles">
        Written by hunters who&apos;ve already got the platinum.
      </PageHeader>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <form action="/guides" className="flex-1">
          <input name="q" defaultValue={q} placeholder="Search guides or games…" className="input max-w-md" aria-label="Search guides" />
          <input type="hidden" name="sort" value={sort} />
        </form>
        {[
          ["new", "Newest"],
          ["popular", "Popular"],
          ["easy", "Easiest plats"],
        ].map(([k, l]) => (
          <Link key={k} href={`/guides?sort=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={clsx("chip min-h-6", sort === k && "chip-active")}>
            {l}
          </Link>
        ))}
        <Link href="/guides/new" className="btn-primary">Write a guide</Link>
      </div>

      {guides.length === 0 ? (
        <EmptyState title="No guides found" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {guides.map((g) => (
            <Link key={g.id} href={`/guides/${g.slug}`} className="card flex gap-4 p-4 hover:border-muted">
              <GameArt title={g.game.title} hue={g.game.coverHue} iconUrl={g.game.iconUrl} className="w-20 self-start" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold uppercase tracking-wider text-accent-text">{g.game.title}</div>
                <h2 className="text-lg font-semibold leading-snug">{g.title}</h2>
                <p className="mt-1 line-clamp-2 text-sm text-muted">{g.summary}</p>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                  <DifficultyMeter value={g.difficulty} />
                  <span>{g.hoursEstimate}h</span>
                  <span>{g.playthroughs}× playthrough</span>
                  {g.missableCount > 0 && <span className="text-bad">{g.missableCount} missables</span>}
                  {g.onlineRequired && <span className="text-rare">Online</span>}
                </div>
                <div className="mt-2 text-xs text-faint">
                  by {g.author.psn?.onlineId ?? g.author.username} · updated {timeAgo(g.updatedAt)} · {formatNumber(g.views)} views ·{" "}
                  {g._count.tips} tips
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
