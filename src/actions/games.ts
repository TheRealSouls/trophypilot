"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { refreshEstimates } from "@/lib/estimates";
import { isAdmin } from "@/lib/forum";
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

/** Admins flag a list whose platinum or 100% can't be earned any more, with the reason. */
export async function setUnobtainable(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!isAdmin(user)) return { error: "Only admins can change this." };
  const parsed = unobtainableSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: "Keep the reason under 300 characters." };
  const { gameId, unobtainable, reason } = parsed.data;
  if (unobtainable && !reason) return { error: "Say why: servers shut down, a glitched trophy, a delisted DLC…" };
  await prisma.game.update({
    where: { id: gameId },
    data: { unobtainable: unobtainable || null, unobtainableReason: unobtainable ? reason : null },
  });
  await refreshGamePage(gameId);
  return { ok: "Saved." };
}
