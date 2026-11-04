/**
 * Saves every guide (all statuses, drafts included) to a JSON file, so none are lost:
 * steps, tips with their votes, star ratings and favourites. Games, trophies and members are
 * stored by their lasting keys (PSN list id, PSN trophy id, username) rather than database ids,
 * so scripts/restore-guides.ts can put them back into a new or rebuilt database.
 *
 *   npm run guides:backup                 writes backups/guides-<date>.json
 *   npm run guides:backup -- my-file.json writes there instead
 *
 * Read-only: it changes nothing in the database. The backups folder is git-ignored
 * (it holds members' writing), so keep a copy somewhere safe as well.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { prisma } from "../src/lib/db";

try {
  process.loadEnvFile(".env");
} catch {
  // No .env file; rely on the real environment.
}

const BATCH = 50;

async function main() {
  const out = process.argv[2] ?? `backups/guides-${new Date().toISOString().slice(0, 10)}.json`;
  const guides = [];
  let cursor: string | undefined;
  // In batches, so a big site doesn't load every guide at once.
  for (;;) {
    const batch = await prisma.guide.findMany({
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      include: {
        game: { select: { title: true, slug: true, npCommunicationId: true, titleKey: true } },
        author: { select: { username: true } },
        steps: { orderBy: [{ kind: "asc" }, { order: "asc" }], include: { trophy: { select: { psnTrophyId: true, name: true } } } },
        tips: {
          orderBy: { createdAt: "asc" },
          include: { author: { select: { username: true } }, votes: { select: { value: true, user: { select: { username: true } } } } },
        },
        ratings: { select: { stars: true, createdAt: true, user: { select: { username: true } } } },
        favourites: { select: { createdAt: true, user: { select: { username: true } } } },
      },
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;
    for (const g of batch) {
      guides.push({
        slug: g.slug,
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
        createdAt: g.createdAt,
        updatedAt: g.updatedAt,
        author: g.author.username,
        game: g.game,
        steps: g.steps.map((s) => ({
          kind: s.kind,
          order: s.order,
          title: s.title,
          body: s.body,
          videoYoutubeId: s.videoYoutubeId,
          trophy: s.trophy ? { psnTrophyId: s.trophy.psnTrophyId, name: s.trophy.name } : null,
        })),
        tips: g.tips.map((t) => ({ author: t.author.username, body: t.body, createdAt: t.createdAt, votes: t.votes.map((v) => ({ user: v.user.username, value: v.value })) })),
        ratings: g.ratings.map((r) => ({ user: r.user.username, stars: r.stars, createdAt: r.createdAt })),
        favourites: g.favourites.map((f) => ({ user: f.user.username, createdAt: f.createdAt })),
      });
    }
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ kind: "trophypilot-guides", version: 1, savedAt: new Date(), count: guides.length, guides }, null, 2));
  const byStatus = guides.reduce<Record<string, number>>((m, g) => ({ ...m, [g.status]: (m[g.status] ?? 0) + 1 }), {});
  console.log(`Saved ${guides.length} guides to ${out}`, byStatus);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
