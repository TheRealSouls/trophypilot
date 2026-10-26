import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import { sendNotice } from "./community";
import { SITE } from "./site";

/**
 * Clubs nobody uses are cleared away. Activity is a new member joining, an
 * update or a reaction. After WARN_AFTER days without any, the owner gets a
 * notice in Messages and the club page shows a warning; if nothing happens in
 * the DELETE_AFTER days that follow, the club is deleted. Any activity cancels
 * the warning (clubActive). Runs with the players cron.
 */
export const WARN_AFTER_DAYS = 5;
export const DELETE_AFTER_WARNING_DAYS = 2;
const DAY = 86_400_000;

/** Something happened in the club: drop any idle warning. */
export async function clubActive(clubId: string) {
  await prisma.club.updateMany({ where: { id: clubId, idleWarnedAt: { not: null } }, data: { idleWarnedAt: null } });
}

/** When a warned club will be deleted. */
export const deletionDate = (warnedAt: Date) => new Date(warnedAt.getTime() + DELETE_AFTER_WARNING_DAYS * DAY);

export async function cleanUpIdleClubs(now = new Date()) {
  const clubs = await prisma.$queryRaw<{ id: string; slug: string; name: string; ownerId: string; idleWarnedAt: Date | null; lastActivity: Date }[]>`
    SELECT c.id, c.slug, c.name, c."ownerId", c."idleWarnedAt",
      GREATEST(
        c."createdAt",
        (SELECT max(m."joinedAt") FROM "ClubMember" m WHERE m."clubId" = c.id AND m."userId" <> c."ownerId"),
        (SELECT max(p."createdAt") FROM "Post" p WHERE p."clubId" = c.id),
        (SELECT max(r."createdAt") FROM "PostReaction" r JOIN "Post" p ON p.id = r."postId" WHERE p."clubId" = c.id)
      ) AS "lastActivity"
    FROM "Club" c`;
  let warned = 0;
  let deleted = 0;
  for (const c of clubs) {
    const warning = c.idleWarnedAt && c.idleWarnedAt > c.lastActivity ? c.idleWarnedAt : null;
    if (warning && now >= deletionDate(warning)) {
      await prisma.club.deleteMany({ where: { id: c.id } });
      await sendNotice(
        c.ownerId,
        `Your club **${c.name}** has been deleted because nobody joined, posted or reacted in it for ${WARN_AFTER_DAYS + DELETE_AFTER_WARNING_DAYS} days. You can start a new one any time from [Clubs](${SITE.url}/clubs).`,
      );
      deleted++;
    } else if (!warning && now.getTime() - c.lastActivity.getTime() >= WARN_AFTER_DAYS * DAY) {
      await prisma.club.update({ where: { id: c.id }, data: { idleWarnedAt: now } });
      await sendNotice(
        c.ownerId,
        `Your club **${c.name}** has been quiet for ${WARN_AFTER_DAYS} days. It will be deleted in ${DELETE_AFTER_WARNING_DAYS} days unless someone joins, posts an update or reacts to one. [Open the club](${SITE.url}/clubs/${c.slug})`,
      );
      warned++;
    }
  }
  if (warned || deleted) revalidatePath("/clubs", "layout");
  return { warned, deleted };
}
