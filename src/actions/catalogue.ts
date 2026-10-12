"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTitleTrophyGroups } from "psn-api";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isAdmin } from "@/lib/forum";
import { ensureGameTrophies, importTitles } from "@/lib/psn/catalogue";
import { psnAuth, sumCounts, toPsnError, withTimeout } from "@/lib/psn/real";
import { getProvider, isDemoMode } from "@/lib/psn/sync";
import type { FormState } from "./auth";

const NPWR = /^NPWR\d{5}_\d{2}$/;

/**
 * Staff: adds a trophy list by its PSN id (NPWR12345_00), even when no
 * player has it yet, which is how lists for unreleased games appear. PSN's
 * PS5 trophy service is tried first, then the older one (PS4, PS3, Vita).
 */
export async function importListById(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser("/games/upcoming");
  if (!isAdmin(user)) return { error: "Only staff can add trophy lists." };
  if (isDemoMode()) return { error: "Demo mode has no PSN connection." };
  const id = String(fd.get("npwr") ?? "")
    .trim()
    .toUpperCase();
  if (!NPWR.test(id)) return { error: "That isn't a trophy list id. They look like NPWR12345_00." };

  const existing = await prisma.game.findUnique({ where: { npCommunicationId: id }, select: { slug: true } });
  if (existing) redirect(`/games/${existing.slug}`);

  let found: { service: "trophy" | "trophy2"; name: string; icon: string | null; platforms: string[]; defined?: number } | null = null;
  for (const service of ["trophy2", "trophy"] as const) {
    try {
      const res = await withTimeout(
        getTitleTrophyGroups(await psnAuth(), id, service === "trophy" ? { npServiceName: "trophy" } : {}),
      );
      found = {
        service,
        name: res.trophyTitleName,
        icon: res.trophyTitleIconUrl ?? null,
        platforms: String(res.trophyTitlePlatform).split(","),
        defined: sumCounts(res.definedTrophies),
      };
      break;
    } catch (err) {
      const e = toPsnError(err);
      if (e.kind === "rate_limited" || e.kind === "auth") return { error: e.message };
      // Not on this service: try the other one.
    }
  }
  if (!found) return { error: `PlayStation Network has no trophy list called ${id}.` };

  const slugs = await importTitles(
    [
      {
        npCommunicationId: id,
        npServiceName: found.service,
        title: found.name,
        iconUrl: found.icon,
        platforms: found.platforms,
        lastUpdated: new Date(),
        definedTrophies: found.defined,
      },
    ],
    null,
  );
  const slug = slugs.get(id)!;
  const game = await prisma.game.findUnique({ where: { slug } });
  if (game) await ensureGameTrophies(getProvider(), game).catch((err) => console.error("[catalogue] list import failed", err));
  revalidatePath("/games/upcoming");
  redirect(`/games/${slug}`);
}
