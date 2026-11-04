import { prisma } from "./db";
import { slugify } from "./utils";
import { uniqueSectionSlug } from "./forum";

/**
 * Every game has its own forum, like PSNProfiles: a section under "Game
 * forums" that threads about the game go into automatically (members can't
 * file them elsewhere). All of a game's stacks share one forum, keyed by its
 * titleKey. Sections are made the first time they're needed (a member opens
 * the game's forum or starts a thread about it); until then the game simply
 * has an empty forum.
 */
export const GAME_FORUMS_SLUG = "game-forums";

const keyOf = (g: { id: string; titleKey: string }) => g.titleKey || g.id;

async function parentSection() {
  const existing = await prisma.forumSection.findUnique({ where: { slug: GAME_FORUMS_SLUG }, select: { id: true } });
  if (existing) return existing.id;
  return (
    await prisma.forumSection
      .create({
        data: { slug: GAME_FORUMS_SLUG, name: "Game forums", description: "Every game's own forum: trophy help, boosting and discussion.", order: 900 },
        select: { id: true },
      })
      // Two first threads at once: the other one made it.
      .catch(() => prisma.forumSection.findUniqueOrThrow({ where: { slug: GAME_FORUMS_SLUG }, select: { id: true } }))
  ).id;
}

/** The game's own forum section, made if it doesn't exist yet. */
export async function ensureGameSection(game: { id: string; title: string; titleKey: string }) {
  const gameKey = keyOf(game);
  const find = (db: Pick<typeof prisma, "forumSection">) =>
    db.forumSection.findFirst({ where: { gameKey }, orderBy: { createdAt: "asc" }, select: { id: true, slug: true } });
  const found = await find(prisma);
  if (found) return found;
  const parentId = await parentSection();
  const slug = await uniqueSectionSlug(slugify(game.title) || slugify(game.id));
  // A lock on the game's key, so two members opening a new game's forum at once don't make two of them.
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"game-forum:" + gameKey}))`;
    return (
      (await find(tx)) ??
      tx.forumSection.create({ data: { slug, name: game.title, description: `Trophy talk for ${game.title}.`, parentId, gameKey }, select: { id: true, slug: true } })
    );
  });
}

/** The game a game forum belongs to (any of its stacks), for links back. */
export async function gameOfSection(gameKey: string) {
  return prisma.game.findFirst({
    where: { OR: [{ titleKey: gameKey }, { id: gameKey }] },
    orderBy: { npCommunicationId: "desc" },
    select: { id: true, slug: true, title: true, iconUrl: true, coverHue: true },
  });
}
