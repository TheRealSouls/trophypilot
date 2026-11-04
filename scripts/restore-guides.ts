/**
 * Puts guides back from a file made by scripts/backup-guides.ts.
 *
 *   npm run guides:restore -- backups/guides-2026-11-04.json            dry run: says what it would do
 *   npm run guides:restore -- backups/guides-2026-11-04.json --apply    does it
 *
 * Guides whose address (slug) already exists are left alone, so it's safe to run
 * more than once. A guide is skipped when its game or author isn't on the site;
 * tips, ratings and favourites from members who aren't there are dropped.
 */
import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/db";

try {
  process.loadEnvFile(".env");
} catch {
  // No .env file; rely on the real environment.
}

type Backup = {
  kind: string;
  guides: {
    slug: string;
    title: string;
    summary: string;
    status: string;
    reviewNote: string | null;
    difficulty: number;
    hoursEstimate: number;
    playthroughs: number;
    missableCount: number;
    onlineRequired: boolean;
    videoYoutubeId: string | null;
    views: number;
    createdAt: string;
    author: string;
    game: { slug: string; npCommunicationId: string | null };
    steps: { kind: string; order: number; title: string; body: string; videoYoutubeId: string | null; trophy: { psnTrophyId: number } | null }[];
    tips: { author: string; body: string; createdAt: string; votes: { user: string; value: number }[] }[];
    ratings: { user: string; stars: number; createdAt: string }[];
    favourites: { user: string; createdAt: string }[];
  }[];
};

async function main() {
  const [file, flag] = process.argv.slice(2);
  if (!file) throw new Error("Usage: npm run guides:restore -- <backup file> [--apply]");
  const apply = flag === "--apply";
  const backup = JSON.parse(readFileSync(file, "utf8")) as Backup;
  if (backup.kind !== "trophypilot-guides") throw new Error("That isn't a guides backup.");

  const usernames = new Set<string>();
  for (const g of backup.guides) {
    usernames.add(g.author);
    g.tips.forEach((t) => (usernames.add(t.author), t.votes.forEach((v) => usernames.add(v.user))));
    g.ratings.forEach((r) => usernames.add(r.user));
    g.favourites.forEach((f) => usernames.add(f.user));
  }
  const users = new Map((await prisma.user.findMany({ where: { username: { in: [...usernames] } }, select: { id: true, username: true } })).map((u) => [u.username, u.id]));
  const existing = new Set((await prisma.guide.findMany({ where: { slug: { in: backup.guides.map((g) => g.slug) } }, select: { slug: true } })).map((g) => g.slug));

  let restored = 0;
  for (const g of backup.guides) {
    if (existing.has(g.slug)) continue;
    const authorId = users.get(g.author);
    const game = await prisma.game.findFirst({
      where: { OR: [...(g.game.npCommunicationId ? [{ npCommunicationId: g.game.npCommunicationId }] : []), { slug: g.game.slug }] },
      select: { id: true, trophies: { select: { id: true, psnTrophyId: true } } },
    });
    if (!authorId || !game) {
      console.log(`Skipped "${g.title}": ${!authorId ? `author ${g.author} isn't on the site` : "its game isn't on the site"}.`);
      continue;
    }
    const trophyId = new Map(game.trophies.map((t) => [t.psnTrophyId, t.id]));
    restored++;
    if (!apply) {
      console.log(`Would restore "${g.title}" by ${g.author}.`);
      continue;
    }
    await prisma.guide.create({
      data: {
        slug: g.slug,
        gameId: game.id,
        authorId,
        title: g.title,
        summary: g.summary,
        status: g.status,
        reviewNote: g.reviewNote,
        difficulty: g.difficulty,
        hoursEstimate: g.hoursEstimate,
        playthroughs: g.playthroughs,
        missableCount: g.missableCount,
        onlineRequired: g.onlineRequired,
        videoYoutubeId: g.videoYoutubeId,
        views: g.views,
        createdAt: new Date(g.createdAt),
        ratingCount: g.ratings.filter((r) => users.has(r.user)).length,
        ratingAvg: (() => {
          const kept = g.ratings.filter((r) => users.has(r.user));
          return kept.length ? kept.reduce((a, r) => a + r.stars, 0) / kept.length : null;
        })(),
        steps: {
          create: g.steps.map((s) => ({
            kind: s.kind,
            order: s.order,
            title: s.title,
            body: s.body,
            videoYoutubeId: s.videoYoutubeId,
            trophyId: s.trophy ? (trophyId.get(s.trophy.psnTrophyId) ?? null) : null,
          })),
        },
        tips: {
          create: g.tips
            .filter((t) => users.has(t.author))
            .map((t) => ({
              authorId: users.get(t.author)!,
              body: t.body,
              createdAt: new Date(t.createdAt),
              votes: { create: t.votes.filter((v) => users.has(v.user)).map((v) => ({ userId: users.get(v.user)!, value: v.value })) },
            })),
        },
        ratings: { create: g.ratings.filter((r) => users.has(r.user)).map((r) => ({ userId: users.get(r.user)!, stars: r.stars, createdAt: new Date(r.createdAt) })) },
        favourites: { create: g.favourites.filter((f) => users.has(f.user)).map((f) => ({ userId: users.get(f.user)!, createdAt: new Date(f.createdAt) })) },
      },
    });
    console.log(`Restored "${g.title}" by ${g.author}.`);
  }
  console.log(`${apply ? "Restored" : "Would restore"} ${restored} of ${backup.guides.length} guides (${existing.size} already there).${apply ? "" : " Add --apply to do it."}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
