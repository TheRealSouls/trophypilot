import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";

/** Everything we hold about the signed-in user, as a JSON download. */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      username: true,
      country: true,
      bio: true,
      profileVisibility: true,
      showOnLeaderboards: true,
      showActivity: true,
      createdAt: true,
      psn: { select: { onlineId: true, accountId: true, avatarUrl: true, verified: true, lastSyncedAt: true, createdAt: true } },
      games: { select: { progress: true, hasPlatinum: true, platinumAt: true, completedAt: true, game: { select: { title: true } } } },
      trophies: { select: { earnedAt: true, trophy: { select: { name: true, type: true, game: { select: { title: true } } } } } },
      guides: { select: { title: true, summary: true, createdAt: true, updatedAt: true, steps: { select: { kind: true, title: true, body: true } } } },
      tips: { select: { body: true, createdAt: true } },
      tipVotes: { select: { tipId: true, value: true } },
      sentRequests: { select: { status: true, createdAt: true, addressee: { select: { username: true } } } },
      receivedRequests: { select: { status: true, createdAt: true, requester: { select: { username: true } } } },
      hostedSessions: { select: { title: true, description: true, platform: true, startsAt: true } },
      sessionSlots: { select: { joinedAt: true, session: { select: { title: true } } } },
      syncJobs: { select: { status: true, gamesSynced: true, trophiesSynced: true, startedAt: true, finishedAt: true } },
      theme: true,
      profileAccent: true,
      profileCard: true,
      avatar: true,
      youtubeUrl: true,
      twitchUrl: true,
      streamUrl: true,
      allowMessages: true,
      bannerGame: { select: { title: true } },
      gameRatings: { select: { difficulty: true, rating: true, updatedAt: true, game: { select: { title: true } } } },
      guideFavourites: { select: { createdAt: true, guide: { select: { title: true } } } },
      vault: { select: { position: true, trophy: { select: { name: true, game: { select: { title: true } } } } } },
      sessionComments: { select: { body: true, createdAt: true, session: { select: { title: true } } } },
      following: { select: { createdAt: true, following: { select: { username: true } } } },
      followers: { select: { createdAt: true, follower: { select: { username: true } } } },
      posts: { select: { body: true, createdAt: true, club: { select: { name: true } } } },
      ownedClubs: { select: { name: true, description: true, createdAt: true } },
      clubMemberships: { select: { joinedAt: true, club: { select: { name: true } } } },
      // Their own messages, with which conversation each was in.
      messages: { select: { body: true, createdAt: true, conversationId: true } },
      forumThreads: { select: { title: true, createdAt: true, section: { select: { name: true } } } },
      forumPosts: { select: { body: true, createdAt: true, editedAt: true, thread: { select: { title: true } } } },
    },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = JSON.stringify({ exportedAt: new Date().toISOString(), ...user }, null, 2);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="trophypilot-${user.username}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
