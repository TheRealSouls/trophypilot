"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { refreshEstimates } from "@/lib/estimates";
import { isStaff } from "@/lib/forum";
import { logStaff } from "@/lib/staff";
import { verifyFirst } from "@/lib/email";
import { hateSpeechError } from "@/lib/moderation";
import { rateLimit } from "@/lib/rate-limit";
import { bust } from "@/lib/cache";
import type { FormState } from "./auth";

const ratingSchema = z.object({
  gameId: z.string().min(1),
  difficulty: z.coerce.number().int().min(0).max(10),
  rating: z.coerce.number().int().min(0).max(5),
});

/** A member's own difficulty (1 to 10) and quality (1 to 5 stars) for a game. 0 clears that part. */
export async function rateGame(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = ratingSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: "Pick a difficulty from 1 to 10 and a rating from 1 to 5." };
  const { gameId, difficulty, rating } = parsed.data;
  const game = await prisma.game.findUnique({ where: { id: gameId }, select: { id: true } });
  if (!game) return { error: "Unknown game." };

  if (!difficulty && !rating) {
    await prisma.gameRating.deleteMany({ where: { userId: user.id, gameId } });
  } else {
    const data = { difficulty: difficulty || null, rating: rating || null };
    await prisma.gameRating.upsert({
      where: { userId_gameId: { userId: user.id, gameId } },
      create: { userId: user.id, gameId, ...data },
      update: data,
    });
  }
  await refreshEstimates([gameId]);
  await refreshGamePage(gameId);
  return { ok: difficulty || rating ? "Thanks, your rating is saved." : "Rating removed." };
}

/** Adds a game to the member's wishlist, or takes it off. */
export async function toggleWishlist(fd: FormData) {
  const user = await requireUser();
  const gameId = String(fd.get("gameId") ?? "");
  const game = await prisma.game.findUnique({ where: { id: gameId }, select: { id: true, slug: true } });
  if (!game) return;
  const key = { userId_gameId: { userId: user.id, gameId } };
  if (await prisma.wishlistGame.findUnique({ where: key })) await prisma.wishlistGame.delete({ where: key });
  else await prisma.wishlistGame.create({ data: { userId: user.id, gameId } });
  revalidatePath(`/u/${user.username}`);
  revalidatePath(`/games/${game.slug}`);
}

/** How long "Playing now" stays up before it clears itself. */
const PLAYING_FOR_MS = 3 * 3600_000;

/**
 * Sets or clears the member's "Playing now" status. Pass no gameId to clear
 * it; `from` is the game page it was pressed on. Only that page and the
 * member's profile are refreshed, which keeps it quick.
 */
export async function setNowPlaying(fd: FormData) {
  const user = await requireUser();
  const gameId = (fd.get("gameId") as string) || null;
  const game = gameId ? await prisma.game.findUnique({ where: { id: gameId }, select: { id: true } }) : null;
  await prisma.user.update({
    where: { id: user.id },
    data: game ? { nowPlayingGameId: game.id, nowPlayingUntil: new Date(Date.now() + PLAYING_FOR_MS) } : { nowPlayingGameId: null, nowPlayingUntil: null },
  });
  revalidatePath(`/u/${user.username}`);
  const from = String(fd.get("from") ?? "") || user.nowPlayingGameId;
  if (from) await refreshGamePage(from, false);
}

/** Drops a game's cached details and re-renders its page (and its other lists' pages). */
async function refreshGamePage(gameId: string, details = true) {
  const game = await prisma.game.findUnique({ where: { id: gameId }, select: { slug: true, titleKey: true } });
  if (!game) return;
  if (details) bust(`game:${game.slug}`);
  revalidatePath(`/games/${game.slug}`);
}

const unobtainableSchema = z.object({
  gameId: z.string().min(1),
  unobtainable: z.enum(["", "PLATINUM", "COMPLETION"]),
  reason: z.string().trim().max(300).optional(),
});

/** Staff flag a list whose platinum or 100% can't be earned any more, with the reason. */
export async function setUnobtainable(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!isStaff(user)) return { error: "Only staff can change this." };
  const parsed = unobtainableSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: "Keep the reason under 300 characters." };
  const { gameId, unobtainable, reason } = parsed.data;
  if (unobtainable && !reason) return { error: "Say why: servers shut down, a glitched trophy, a delisted DLC…" };
  await prisma.game.update({
    where: { id: gameId },
    // When and by whom, so the game page can say how current it is.
    data: { unobtainable: unobtainable || null, unobtainableReason: unobtainable ? reason : null, unobtainableAt: new Date(), unobtainableById: user.id },
  });
  await logStaff(user.id, "game.obtainable", { type: "GAME", id: gameId }, unobtainable ? `${unobtainable}: ${reason}` : "obtainable");
  await refreshGamePage(gameId);
  return { ok: "Saved." };
}

/**
 * Staff estimate of the hours to platinum, for games no guide covers yet. It
 * applies to every list of the game; once a guide is published, its estimate
 * is shown instead. 0 clears it.
 */
export async function setStaffHours(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!isStaff(user)) return { error: "Only staff can change this." };
  const hours = Math.round(Number(fd.get("hours")));
  if (!(hours >= 0 && hours <= 2000)) return { error: "Enter the hours as a number, 0 to clear." };
  const game = await prisma.game.findUnique({ where: { id: String(fd.get("gameId") ?? "") }, select: { id: true, titleKey: true } });
  if (!game) return { error: "That game doesn't exist." };
  await prisma.game.updateMany({ where: game.titleKey ? { titleKey: game.titleKey } : { id: game.id }, data: { staffHours: hours || null } });
  await logStaff(user.id, "game.hours", { type: "GAME", id: game.id }, hours ? `${hours}h` : "cleared");
  await refreshGamePage(game.id);
  return { ok: hours ? `Saved: about ${hours} hours.` : "Cleared." };
}

/**
 * A member says a trophy needs online play (or doesn't). It waits for staff
 * (Online flags on the staff dashboard) and changes nothing until approved.
 */
export async function flagOnline(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const unverified = verifyFirst(user);
  if (unverified) return { error: unverified };
  if (!(await rateLimit("online-flag", 20, 60 * 60_000, user.id))) return { error: "You've sent a lot of these this hour. Try again later." };
  const note = String(fd.get("note") ?? "").trim().slice(0, 300) || null;
  const hate = hateSpeechError(note);
  if (hate) return { error: hate };
  const trophy = await prisma.trophy.findUnique({ where: { id: String(fd.get("trophyId") ?? "") }, select: { id: true, online: true } });
  if (!trophy) return { error: "That trophy doesn't exist." };
  const online = fd.get("online") !== "0";
  if (online === trophy.online) return { ok: online ? "It's already marked as needing online." : "It's already marked as offline." };
  await prisma.onlineFlag.upsert({
    where: { trophyId_userId: { trophyId: trophy.id, userId: user.id } },
    create: { trophyId: trophy.id, userId: user.id, online, note },
    update: { online, note, status: "PENDING", createdAt: new Date(), reviewedAt: null, reviewedById: null },
  });
  revalidatePath("/staff");
  return { ok: "Thanks. Staff will check it before it shows on the trophy." };
}
