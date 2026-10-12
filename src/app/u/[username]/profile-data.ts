import { cache } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { canViewProfile, friendState } from "@/lib/social";

/** Loads a profile owner plus the viewer's relationship/permissions. */
export const loadProfile = cache(async (username: string) => {
  const owner = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
    include: {
      psn: true,
      bannerGame: { select: { title: true, slug: true, coverHue: true, screenshots: true, iconUrl: true } },
      nowPlayingGame: { select: { title: true, slug: true } },
      favouritePlatinumGame: { select: { title: true, slug: true, coverHue: true, iconUrl: true } },
    },
  });
  if (!owner) notFound();
  const viewerId = await getSessionUserId();
  const [canView, relation] = await Promise.all([canViewProfile(viewerId, owner), friendState(viewerId, owner.id)]);
  return { owner, viewerId, canView, relation };
});

export type ProfileOwner = Awaited<ReturnType<typeof loadProfile>>["owner"];
