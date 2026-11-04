import type { Metadata } from "next";
import Link from "next/link";
import { plainText } from "@/lib/rich-text";
import clsx from "clsx";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { formatNumber, timeAgo } from "@/lib/utils";
import { GameArt } from "@/components/art";
import { Stars } from "@/components/Stars";
import { DifficultyMeter, EmptyState, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Trophy Guides", description: "Community trophy guides and platinum roadmaps." };

/** Guides per page, on every tab (newest, popular, favourites, my guides). */
const PER_PAGE = 20;

const TABS = [
  ["new", "Newest"],
  ["popular", "Popular"],
  ["top", "Top rated"],
  ["easy", "Easiest plats"],
  ["favourites", "My favourites"],
  ["mine", "My guides"],
] as const;

// Only what the cards show: loading whole game rows (descriptions, screenshot lists) made the page slow.
const card = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  status: true,
  difficulty: true,
  hoursEstimate: true,
  playthroughs: true,
  missableCount: true,
  onlineRequired: true,
  views: true,
  updatedAt: true,
  ratingAvg: true,
  ratingCount: true,
  game: { select: { title: true, coverHue: true, iconUrl: true } },
  author: { select: { username: true, psn: { select: { onlineId: true } } } },
  _count: { select: { tips: true } },
} satisfies Prisma.GuideSelect;

export default async function GuidesPage({ searchParams }: { searchParams: Promise<{ q?: string; sort?: string; page?: string }> }) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const sort = TABS.some(([k]) => k === sp.sort) ? sp.sort! : "new";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  // Favourites are the signed-in member's saved guides, newest save first.
  const favourites = sort === "favourites";
  // "My guides": everything the member wrote, drafts and ones waiting for review included.
  const mine = sort === "mine";
  const viewerId = favourites || mine ? await getSessionUserId() : null;
  const where: Prisma.GuideWhereInput = {
    ...(mine ? { authorId: viewerId! } : { status: "PUBLISHED" }),
    ...(favourites ? { favourites: { some: { userId: viewerId! } } } : {}),
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { game: { title: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  const orderBy: Prisma.GuideOrderByWithRelationInput[] = mine
    ? [{ updatedAt: "desc" }]
    : sort === "new" || favourites
      ? [{ createdAt: "desc" }]
      : sort === "easy"
        ? [{ difficulty: "asc" }, { views: "desc" }]
        : sort === "top"
          ? [{ ratingAvg: { sort: "desc", nulls: "last" } }, { ratingCount: "desc" }]
          : [{ views: "desc" }];
  const blocked = (favourites || mine) && !viewerId;
  const [guides, total] = blocked
    ? [[], 0]
    : await Promise.all([prisma.guide.findMany({ where, orderBy, skip: (page - 1) * PER_PAGE, take: PER_PAGE, select: card }), prisma.guide.count({ where })]);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const href = (o: { sort?: string; page?: number }) => {
    const p = new URLSearchParams({ sort: o.sort ?? sort, ...(q ? { q } : {}), ...(o.page && o.page > 1 ? { page: String(o.page) } : {}) });
    return `/guides?${p}`;
  };

  return (
    <div>
      <PageHeader kicker="Trophy guides" title="Roadmaps, missables & collectibles">
        Written by hunters who&apos;ve already got the platinum.
      </PageHeader>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <form action="/guides" role="search" className="flex-1">
          <input name="q" defaultValue={q} placeholder="Search guides or games…" className="input max-w-md" aria-label="Search guides" />
          <input type="hidden" name="sort" value={sort} />
        </form>
        <nav aria-label="Guide lists" className="flex flex-wrap gap-2">
          {TABS.map(([k, l]) => (
            <Link key={k} href={href({ sort: k })} aria-current={sort === k ? "page" : undefined} className={clsx("chip min-h-7", sort === k && "chip-active")}>
              {l}
            </Link>
          ))}
        </nav>
        <Link href="/guides/new" className="btn-primary">
          Write a guide
        </Link>
      </div>

      {blocked ? (
        <EmptyState
          title={mine ? "Log in to see your guides" : "Log in to see your favourites"}
          action={
            <Link href={`/login?next=${encodeURIComponent(`/guides?sort=${sort}`)}`} className="btn-primary">
              Log in
            </Link>
          }
        >
          {mine ? "Your guides and drafts show up here." : "Save a guide with Add to favourites and it shows up here."}
        </EmptyState>
      ) : guides.length === 0 ? (
        mine ? (
          <EmptyState
            title="You haven't written a guide yet"
            action={
              <Link href="/guides/new" className="btn-primary">
                Write a guide
              </Link>
            }
          >
            Drafts save themselves, so you can start one and finish it later.
          </EmptyState>
        ) : favourites ? (
          <EmptyState title="No favourites yet">Open a guide and press Add to favourites to keep it here.</EmptyState>
        ) : (
          <EmptyState title="No guides found" />
        )
      ) : (
        <>
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
                    {g.ratingCount > 0 && g.ratingAvg != null && (
                      <span className="inline-flex items-center gap-1">
                        <Stars value={g.ratingAvg} size={12} /> {g.ratingAvg.toFixed(1)} ({g.ratingCount})
                      </span>
                    )}
                  </div>
                  <div className="mt-2 text-xs text-faint">
                    by {g.author.psn?.onlineId ?? g.author.username} · updated {timeAgo(g.updatedAt)} · {formatNumber(g.views)} views · {g._count.tips} tips
                  </div>
                </div>
              </Link>
            ))}
          </div>
          {pages > 1 && (
            <nav className="mt-6 flex items-center justify-between border-t border-line pt-4 text-sm" aria-label="Guide pages">
              {page > 1 ? (
                <Link href={href({ page: page - 1 })} className="btn-ghost">
                  ← Previous
                </Link>
              ) : (
                <span />
              )}
              <span className="text-muted">
                Page {page} of {pages} · {formatNumber(total)} guides
              </span>
              {page < pages ? (
                <Link href={href({ page: page + 1 })} className="btn-ghost">
                  Next →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
