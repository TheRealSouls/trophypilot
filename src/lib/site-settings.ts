import { prisma } from "./db";

/** Site-wide text staff edit from the dashboard (SiteSetting rows). */
export const FORUM_RULES_KEY = "forum-rules";
/** The home page hero picture staff set for an occasion (an https image address); none shows the game covers. */
export const HOME_BACKGROUND_KEY = "home-background";
/** Rules shown beside the guide editor. */
export const GUIDE_RULES_KEY = "guide-rules";

export async function getSetting(key: string) {
  return (await prisma.siteSetting.findUnique({ where: { key } }))?.value ?? null;
}
