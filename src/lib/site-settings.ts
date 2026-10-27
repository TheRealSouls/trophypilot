import { prisma } from "./db";

/** Site-wide text staff edit from the dashboard (SiteSetting rows). */
export const FORUM_RULES_KEY = "forum-rules";

export async function getSetting(key: string) {
  return (await prisma.siteSetting.findUnique({ where: { key } }))?.value ?? null;
}
