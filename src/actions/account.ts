"use server";

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { destroySession, requireUser } from "@/lib/auth";
import { COUNTRIES } from "@/lib/countries";
import { toPsnError } from "@/lib/psn/real";
import { checkCanSync, getProvider, syncUntilDone } from "@/lib/psn/sync";
import { bust } from "@/lib/cache";
import { rateLimit } from "@/lib/rate-limit";
import { isDemoAccount } from "@/lib/demo";
import { needsVerification, sendVerificationEmail } from "@/lib/email";
import { deleteUploadsOf } from "@/lib/uploads";
import { formText, hateSpeechError } from "@/lib/moderation";
import { PROFILE_ACCENTS, PROFILE_CARDS, streamLink } from "@/lib/profile-themes";
import { AVATAR_PRESETS } from "@/components/avatars";
import { refreshEstimates } from "@/lib/estimates";
import type { FormState } from "./auth";

const DEMO_LOCKED = "The shared demo account can't do this. Create your own account to link PSN or delete an account.";

/** Sends a fresh verification link, a few times an hour at most. */
export async function resendVerification(): Promise<FormState> {
  const user = await requireUser("/settings");
  if (!needsVerification(user)) return { ok: "Your email address is already confirmed." };
  if (!(await rateLimit("verify-email", 3, 60 * 60_000, user.id))) return { error: "We've sent a few links already. Check your spam folder, or try again in an hour." };
  try {
    await sendVerificationEmail(user);
  } catch (err) {
    console.error("[email] verification email failed", err);
    return { error: "The email didn't send. Try again in a few minutes." };
  }
  return { ok: "Sent. Check your inbox (and spam folder) for the link." };
}

export async function updateProfile(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const hate = hateSpeechError(...formText(fd));
  if (hate) return { error: hate };
  const bio =
    String(fd.get("bio") ?? "")
      .trim()
      .slice(0, 280) || null;
  const country = String(fd.get("country") ?? "");

  // Stream links: only real links to the right sites are kept.
  const given = (k: string) => String(fd.get(k) ?? "").trim();
  const youtubeUrl = streamLink(given("youtubeUrl"), ["youtube.com", "youtu.be"]);
  const twitchUrl = streamLink(given("twitchUrl"), ["twitch.tv"]);
  const streamUrl = streamLink(given("streamUrl"));
  if (given("youtubeUrl") && !youtubeUrl) return { error: "That doesn't look like a YouTube link." };
  if (given("twitchUrl") && !twitchUrl) return { error: "That doesn't look like a Twitch link." };
  if (given("streamUrl") && !streamUrl) return { error: "The other streaming link isn't a valid web address." };

  const allow = given("allowMessages");

  await prisma.user.update({
    where: { id: user.id },
    data: {
      bio,
      country: country in COUNTRIES ? country : null,
      youtubeUrl,
      twitchUrl,
      streamUrl,
      allowMessages: ["EVERYONE", "FRIENDS", "NOBODY"].includes(allow) ? allow : "EVERYONE",
    },
  });
  revalidatePath(`/u/${user.username}`);
  return { ok: "Profile saved." };
}

/**
 * Profile look: card theme, picture, banner and accent colour. Pictures and
 * banners come from built-in art or the member's own games (no uploads).
 */
export async function updateLook(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const given = (k: string) => String(fd.get(k) ?? "").trim();

  const card = given("profileCard");
  const accent = given("profileAccent");

  // The banner is art from one of the member's own games.
  const bannerId = given("bannerGameId");
  const banner = bannerId
    ? await prisma.userGame.findUnique({ where: { userId_gameId: { userId: user.id, gameId: bannerId } }, select: { gameId: true } })
    : null;

  // Picture: default (PSN avatar or initial), the initial, a built-in one, or the icon of one of their games.
  const pick = given("avatar");
  let avatar: string | null = null;
  if (pick === "letter") avatar = "letter";
  else if (pick.startsWith("preset:") && pick.slice(7) in AVATAR_PRESETS) avatar = pick;
  else if (pick.startsWith("game:")) {
    const owned = await prisma.userGame.findUnique({
      where: { userId_gameId: { userId: user.id, gameId: pick.slice(5) } },
      select: { game: { select: { iconUrl: true } } },
    });
    const icon = owned?.game.iconUrl?.replace(/^http:/, "https:");
    if (!icon?.startsWith("https://")) return { error: "That game has no artwork to use as a picture." };
    avatar = icon;
  }

  // Favourite platinum: one of their own platinums, or none.
  const favId = given("favouritePlatinumGameId");
  const fav = favId
    ? await prisma.userGame.findFirst({ where: { userId: user.id, gameId: favId, hasPlatinum: true }, select: { gameId: true } })
    : null;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      favouritePlatinumGameId: fav?.gameId ?? null,
      profileCard: card in PROFILE_CARDS ? card : "",
      profileAccent: accent in PROFILE_ACCENTS ? accent : "",
      bannerGameId: banner?.gameId ?? null,
      avatar,
    },
  });
  revalidatePath(`/u/${user.username}`);
  revalidatePath("/settings");
  return { ok: "Profile look saved." };
}

export type VaultTrophy = { id: string; name: string; game: string; type: string; rate: number | null };

/**
 * Searches the member's own earned trophies for the vault picker, by trophy
 * or game name, rarest first. Empty search: their 40 rarest.
 */
export async function searchMyTrophies(q: string, type: string): Promise<VaultTrophy[]> {
  const user = await requireUser();
  const text = String(q ?? "").trim().slice(0, 80);
  const grade = ["PLATINUM", "GOLD", "SILVER", "BRONZE"].includes(type) ? type : null;
  const rows = await prisma.userTrophy.findMany({
    where: {
      userId: user.id,
      trophy: {
        ...(grade ? { type: grade } : {}),
        ...(text
          ? { OR: [{ name: { contains: text, mode: "insensitive" } }, { game: { title: { contains: text, mode: "insensitive" } } }] }
          : {}),
      },
    },
    orderBy: { trophy: { earnedRate: { sort: "asc", nulls: "last" } } },
    take: 40,
    select: { trophy: { select: { id: true, name: true, type: true, earnedRate: true, game: { select: { title: true } } } } },
  });
  return rows.map(({ trophy: t }) => ({ id: t.id, name: t.name, game: t.game.title, type: t.type, rate: t.earnedRate }));
}

/** The Trophy Vault: up to five of the member's earned trophies, shown at the top of their profile. */
export async function updateVault(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const ids = [...new Set(fd.getAll("trophyIds").map(String).filter(Boolean))];
  if (ids.length > 5) return { error: "The vault holds five trophies. Untick some first." };
  // Only trophies they've actually earned.
  const earned = await prisma.userTrophy.findMany({ where: { userId: user.id, trophyId: { in: ids } }, select: { trophyId: true } });
  const ok = new Set(earned.map((e) => e.trophyId));
  const keep = ids.filter((id) => ok.has(id));
  await prisma.$transaction([
    prisma.vaultTrophy.deleteMany({ where: { userId: user.id } }),
    prisma.vaultTrophy.createMany({ data: keep.map((trophyId, position) => ({ userId: user.id, trophyId, position })) }),
  ]);
  revalidatePath(`/u/${user.username}`);
  return { ok: keep.length ? `Vault saved with ${keep.length} troph${keep.length === 1 ? "y" : "ies"}.` : "Vault emptied." };
}

const privacySchema = z.object({
  profileVisibility: z.enum(["PUBLIC", "FRIENDS", "PRIVATE"]),
});

/**
 * Saves light or dark to the account. The browser has already switched (see
 * ThemeForm), so nothing re-renders here, which keeps the switch instant.
 */
export async function updateTheme(theme: string) {
  const user = await requireUser("/settings");
  await prisma.user.update({ where: { id: user.id }, data: { theme: theme === "dark" ? "dark" : "light" } });
}

export async function updatePrivacy(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = privacySchema.safeParse({ profileVisibility: fd.get("profileVisibility") });
  if (!parsed.success) return { error: "Invalid visibility option." };
  await prisma.user.update({
    where: { id: user.id },
    data: {
      profileVisibility: parsed.data.profileVisibility,
      showOnLeaderboards: fd.get("showOnLeaderboards") === "on",
      showActivity: fd.get("showActivity") === "on",
    },
  });
  revalidatePath("/", "layout");
  return { ok: "Privacy settings saved." };
}

const onlineIdSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z][A-Za-z0-9_-]{2,15}$/, "PSN Online IDs are 3 to 16 characters and start with a letter.");

export async function startPsnLink(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (isDemoAccount(user)) return { error: DEMO_LOCKED };
  const parsed = onlineIdSchema.safeParse(fd.get("onlineId"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const onlineId = parsed.data;

  const existing = await prisma.psnAccount.findUnique({ where: { onlineId } });
  if (existing && existing.userId !== user.id) {
    if (existing.verified) return { error: "That PSN account is already linked to another TrophyPilot profile." };
    // An unverified claim proves nothing. Whoever verifies ownership first wins.
    await prisma.psnAccount.delete({ where: { id: existing.id } });
  }

  const code = `HUNT-${randomBytes(3).toString("hex").toUpperCase()}`;
  await prisma.psnAccount.upsert({
    where: { userId: user.id },
    create: { userId: user.id, onlineId, verificationCode: code },
    update: { onlineId, verificationCode: code, verified: false, accountId: null },
  });
  revalidatePath("/settings");
  return { ok: "Code generated. Add it to your PSN About Me, then verify." };
}

export async function verifyPsn(_: FormState): Promise<FormState> {
  const user = await requireUser();
  if (isDemoAccount(user)) return { error: DEMO_LOCKED };
  const link = await prisma.psnAccount.findUnique({ where: { userId: user.id } });
  if (!link?.verificationCode) return { error: "Start linking first." };

  if (!(await rateLimit("psn-verify", 10, 10 * 60_000, user.id))) return { error: "Too many attempts. Wait a few minutes." };
  const provider = getProvider();
  let profile;
  try {
    profile = await provider.getProfile(link.onlineId);
  } catch (err) {
    const e = toPsnError(err);
    console.error("[psn] verify failed:", e.kind, e.message);
    return { error: e.kind === "rate_limited" ? e.message : "PSN isn't responding right now. Try again in a few minutes." };
  }
  if (!profile) return { error: `Couldn't find the PSN profile "${link.onlineId}". Check the spelling.` };
  if (!profile.aboutMe.includes(link.verificationCode)) {
    return { error: `We couldn't find ${link.verificationCode} in your About Me yet. PSN can take a minute to update.` };
  }

  await prisma.psnAccount.update({
    where: { id: link.id },
    data: {
      verified: true,
      verificationCode: null,
      accountId: profile.accountId,
      onlineId: profile.onlineId,
      avatarUrl: profile.avatarUrl,
      trophyLevel: profile.trophyLevel,
      levelProgress: profile.levelProgress,
    },
  });

  // Import in the background after the response is sent: a big library takes
  // many capped runs. Progress shows from the SyncJob rows on the settings page.
  after(() => syncUntilDone(user.id, { trigger: "IMPORT" }).catch((err) => console.error("[psn] initial sync failed", err)));
  revalidatePath("/", "layout");
  redirect("/settings?linked=1");
}

/**
 * Starts a sync and answers at once: the checks (linked, not already running,
 * cooldown) run first so problems show straight away, then the sync itself
 * runs in the background. The Sync buttons follow it through /api/sync.
 */
export async function syncNow(_: FormState): Promise<FormState> {
  const user = await requireUser();
  try {
    await checkCanSync(user.id, "MANUAL");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sync failed." };
  }
  after(async () => {
    try {
      await syncUntilDone(user.id, { trigger: "MANUAL" });
    } catch (err) {
      console.error("[psn] sync failed", err);
    } finally {
      bust("boards");
      revalidatePath(`/u/${user.username}`);
    }
  });
  return { ok: "Syncing your trophies…" };
}

export async function unlinkPsn() {
  const user = await requireUser();
  if (isDemoAccount(user)) return;
  await prisma.$transaction([
    prisma.userTrophy.deleteMany({ where: { userId: user.id } }),
    prisma.userGame.deleteMany({ where: { userId: user.id } }),
    prisma.psnTitleSync.deleteMany({ where: { userId: user.id } }),
    prisma.psnAccount.deleteMany({ where: { userId: user.id } }),
  ]);
  revalidatePath("/", "layout");
}

/** Permanently deletes the account and everything tied to it (cascades in the schema). */
export async function deleteAccount(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (isDemoAccount(user)) return { error: DEMO_LOCKED };
  const password = String(fd.get("password") ?? "");
  const full = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
  if (!(await bcrypt.compare(password, full.passwordHash))) return { error: "That password is incorrect." };
  if (fd.get("confirm") !== user.username) return { error: `Type your username (${user.username}) to confirm.` };

  // Their public PSN summary goes too, so they drop off the leaderboards.
  if (user.psn?.accountId) await prisma.psnPlayer.deleteMany({ where: { accountId: user.psn.accountId } });
  // Their guides go with them, so the estimates they fed are worked out again without them.
  const guided = await prisma.guide.findMany({ where: { authorId: user.id }, select: { gameId: true }, distinct: ["gameId"] });
  // Pictures they uploaded go too (the rows go with the account).
  await deleteUploadsOf(user.id).catch((err) => console.error("[uploads] couldn't delete a member's pictures", err));
  await prisma.user.delete({ where: { id: user.id } });
  await refreshEstimates(guided.map((g) => g.gameId));
  await destroySession();
  redirect("/?deleted=1");
}
