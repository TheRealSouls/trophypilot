import { prisma } from "./db";

/** Forum threads and replies per page. */
export const THREADS_PER_PAGE = 25;
export const POSTS_PER_PAGE = 20;

/**
 * Staff are admins and moderators. Moderators look after what members post:
 * reports, guide approval, deleting, locking and moving threads. Admins also
 * run the site: forum sections, adding trophy lists, trusting guide writers.
 */
export const isStaff = (user: { role: string } | null | undefined) => user?.role === "ADMIN" || user?.role === "MODERATOR";
export const isAdmin = (user: { role: string } | null | undefined) => user?.role === "ADMIN";

/** The chip shown next to staff names. */
export const staffTitle = (role: string | null | undefined) => (role === "ADMIN" ? "Staff" : role === "MODERATOR" ? "Moderator" : null);

/** The tabs across the top of the forum pages. */
export const FORUM_TABS = [
  { key: "forums", label: "Forums", href: "/forums" },
  { key: "rules", label: "Forum rules", href: "/forums/rules" },
  { key: "staff", label: "Forum staff", href: "/forums/staff" },
];

/** Shown in place of a deleted account's name. */
export const DELETED_USER = "deleted user";

/**
 * Top-level sections with their sub-sections, each with thread and post
 * counts and the most recent thread, for the forum index.
 */
export async function forumIndex() {
  const sections = await prisma.forumSection.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: { id: true, slug: true, name: true, description: true, parentId: true, adminOnly: true },
  });
  const [counts, latest] = await Promise.all([
    prisma.forumThread.groupBy({ by: ["sectionId"], _count: { _all: true }, _sum: { postCount: true } }),
    // The newest thread activity per section.
    prisma.forumThread.findMany({
      distinct: ["sectionId"],
      orderBy: [{ sectionId: "asc" }, { lastPostAt: "desc" }],
      select: { id: true, title: true, sectionId: true, lastPostAt: true },
    }),
  ]);
  const stats = new Map(counts.map((c) => [c.sectionId, { threads: c._count._all, posts: c._sum.postCount ?? 0 }]));
  const last = new Map(latest.map((t) => [t.sectionId, t]));

  const withStats = sections.map((s) => ({
    ...s,
    threads: stats.get(s.id)?.threads ?? 0,
    posts: stats.get(s.id)?.posts ?? 0,
    latest: last.get(s.id) ?? null,
  }));
  type Row = (typeof withStats)[number];
  // A top-level section's totals include its sub-sections.
  const rollUp = (s: Row, kids: Row[]) => {
    const all = [s, ...kids];
    const newest = all.map((x) => x.latest).filter((x): x is NonNullable<Row["latest"]> => !!x);
    newest.sort((a, b) => b.lastPostAt.getTime() - a.lastPostAt.getTime());
    return {
      threads: all.reduce((n, x) => n + x.threads, 0),
      posts: all.reduce((n, x) => n + x.posts, 0),
      latest: newest[0] ?? null,
    };
  };
  return withStats
    .filter((s) => !s.parentId)
    .map((s) => {
      const children = withStats.filter((c) => c.parentId === s.id);
      return { ...s, children, total: rollUp(s, children) };
    });
}

/** "general-discussion", or "general-discussion-2" if taken. */
export async function uniqueSectionSlug(base: string, exceptId?: string) {
  // These are pages of their own under /forums.
  if (!base || ["new", "manage", "thread", "rules", "staff", "user", "search"].includes(base)) base = `${base || "section"}-forum`;
  let slug = base;
  for (let i = 2; ; i++) {
    const hit = await prisma.forumSection.findUnique({ where: { slug }, select: { id: true } });
    if (!hit || hit.id === exceptId) return slug;
    slug = `${base}-${i}`;
  }
}
