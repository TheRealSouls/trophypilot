import type { Metadata } from "next";
import Link from "next/link";
import { plainText } from "@/lib/rich-text";
import clsx from "clsx";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { formatNumber, timeAgo } from "@/lib/utils";
import { GameArt } from "@/components/art";
import { DifficultyMeter, EmptyState, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Trophy Guides", description: "Community trophy guides and platinum roadmaps." };

export default async function GuidesPage({ searchParams }: { searchParams: Promise<{ q?: string; sort?: string }> }) {
  const { q, sort = "new" } = await searchParams;
  // Favourites are the signed-in member's saved guides, newest save first.
  const favourites = sort === "favourites";
  // "My guides": everything the member wrote, drafts and ones waiting for review included.
  const mine = sort === "mine";
  const viewerId = favourites || mine ? await getSessionUserId() : null;
  const guides = (favourites || mine) && !viewerId ? [] : await prisma.guide.findMany({
    where: {
      ...(mine ? { authorId: viewerId! } : { status: "PUBLISHED" }),
      ...(favourites ? { favourites: { some: { userId: viewerId! } } } : {}),
      ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { game: { title: { contains: q, mode: "insensitive" } } }] } : {}),
    },
    orderBy: mine ? { updatedAt: "desc" } : sort === "new" || favourites ? { createdAt: "desc" } : sort === "easy" ? { difficulty: "asc" } : { views: "desc" },
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
          ["favourites", "My favourites"],
          ["mine", "My guides"],
        ].map(([k, l]) => (
          <Link key={k} href={`/guides?sort=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={clsx("chip min-h-6", sort === k && "chip-active")}>
            {l}
          </Link>
        ))}
        <Link href="/guides/new" className="btn-primary">Write a guide</Link>
      </div>

      {(favourites || mine) && !viewerId ? (
        <EmptyState title={mine ? "Log in to see your guides" : "Log in to see your favourites"} action={<Link href={`/login?next=/guides?sort=${sort}`} className="btn-primary">Log in</Link>}>
          {mine ? "Your guides and drafts show up here." : "Save a guide with Add to favourites and it shows up here."}
        </EmptyState>
      ) : guides.length === 0 ? (
        mine ? (
          <EmptyState title="You haven't written a guide yet" action={<Link href="/guides/new" className="btn-primary">Write a guide</Link>}>
            Drafts save themselves, so you can start one and finish it later.
          </EmptyState>
        ) : favourites ? (
          <EmptyState title="No favourites yet">Open a guide and press Add to favourites to keep it here.</EmptyState>
        ) : (
          <EmptyState title="No guides found" />
        )
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {guides.map((g) => (
            <Link key={g.id} href={g.status === "DRAFT" ? `/guides/${g.slug}/edit` : `/guides/${g.slug}`} className="card flex gap-4 p-4 hover:border-muted">
              <GameArt title={g.game.title} hue={g.game.coverHue} iconUrl={g.game.iconUrl} className="w-20 self-start" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-accent-text">{g.game.title}</span>
                  {g.status !== "PUBLISHED" && (
                    <span className="chip">{g.status === "DRAFT" ? "Draft" : g.status === "PENDING" ? "Waiting for review" : "Sent back"}</span>
                  )}
                </div>
                <h2 className="text-lg font-semibold leading-snug">{g.title}</h2>
                <p className="mt-1 line-clamp-2 text-sm text-muted">{plainText(g.summary)}</p>
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
