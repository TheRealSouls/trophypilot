"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { sendNotice } from "@/lib/community";
import { canSetRole, isAdmin, isOwner, isStaff, MODERATOR_MAX_SUSPEND_DAYS, outranks, STAFF_BADGES, type Role } from "@/lib/roles";
import { logStaff } from "@/lib/staff";
import { deleteUploadsOf } from "@/lib/uploads";
import { FORUM_RULES_KEY } from "@/lib/site-settings";
import type { FormState } from "./auth";

/**
 * What staff do to members and the site, from the staff dashboard (/staff).
 * Each action checks the actor's role here on the server, can only touch
 * members ranked below them, and writes a line to the audit log.
 */

async function target(fd: FormData) {
  return prisma.user.findUnique({ where: { id: String(fd.get("userId") ?? "") }, select: { id: true, username: true, role: true } });
}

/** A private note to a member from staff, in their TrophyPilot messages. */
export async function warnMember(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireUser("/staff");
  if (!isStaff(me)) return { error: "Only staff can do that." };
  const t = await target(fd);
  if (!t || !outranks(me, t)) return { error: "You can't warn this member." };
  const message = String(fd.get("message") ?? "").trim().slice(0, 1000);
  if (message.length < 5) return { error: "Write what the warning is about." };
  await sendNotice(t.id, `**A warning from TrophyPilot staff**\n\n${message}\n\nPlease read the forum rules. Repeated problems can lead to a suspension.`);
  await logStaff(me.id, "user.warn", { type: "USER", id: t.id }, message);
  revalidatePath("/staff");
  return { ok: `Warning sent to ${t.username}.` };
}

/** Stops a member posting, messaging or starting anything for a while. Moderators can suspend for up to a week. */
export async function suspendMember(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireUser("/staff");
  if (!isStaff(me)) return { error: "Only staff can do that." };
  const t = await target(fd);
  if (!t || !outranks(me, t)) return { error: "You can't suspend this member." };
  const days = Math.round(Number(fd.get("days")));
  const max = isAdmin(me) ? 365 : MODERATOR_MAX_SUSPEND_DAYS;
  if (!(days >= 1 && days <= max)) return { error: `Pick between 1 and ${max} days.` };
  const reason = String(fd.get("reason") ?? "").trim().slice(0, 500);
  if (reason.length < 5) return { error: "Say why, so the member knows." };
  const until = new Date(Date.now() + days * 86_400_000);
  await prisma.user.update({ where: { id: t.id }, data: { suspendedUntil: until, suspendReason: reason } });
  await sendNotice(
    t.id,
    `**Your account is suspended for ${days} day${days === 1 ? "" : "s"}.**\n\n${reason}\n\nYou can still read the site, but you can't post or message until ${until.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}.`,
  );
  await logStaff(me.id, "user.suspend", { type: "USER", id: t.id }, `${days} days: ${reason}`);
  revalidatePath("/staff");
  return { ok: `${t.username} is suspended for ${days} day${days === 1 ? "" : "s"}.` };
}

export async function unsuspendMember(fd: FormData) {
  const me = await requireUser("/staff");
  if (!isStaff(me)) return;
  const t = await target(fd);
  if (!t || !outranks(me, t)) return;
  await prisma.user.update({ where: { id: t.id }, data: { suspendedUntil: null, suspendReason: null } });
  await sendNotice(t.id, "Your suspension has been lifted. Welcome back.");
  await logStaff(me.id, "user.unsuspend", { type: "USER", id: t.id });
  revalidatePath("/staff");
}

/** Appoints or removes staff. The owner appoints admins; admins appoint moderators. */
export async function setRole(fd: FormData) {
  const me = await requireUser("/staff");
  const t = await target(fd);
  const to = String(fd.get("role") ?? "") as Role;
  if (!t || !["USER", "MODERATOR", "ADMIN"].includes(to) || !canSetRole(me, t, to)) return;
  await prisma.user.update({ where: { id: t.id }, data: { role: to } });
  await sendNotice(
    t.id,
    to === "USER" ? "You're no longer on the TrophyPilot staff team. Thanks for your help." : `You're now a TrophyPilot ${STAFF_BADGES[to].label.toLowerCase()}. The staff dashboard is in your account menu.`,
  );
  await logStaff(me.id, "role.set", { type: "USER", id: t.id }, `${t.role} → ${to}`);
  revalidatePath("/staff");
  revalidatePath(`/u/${t.username}`);
}

/** Owner only: permanently deletes a member's account and everything they posted. */
export async function deleteMemberAccount(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireUser("/staff");
  if (!isOwner(me)) return { error: "Only the owner can delete accounts." };
  const t = await target(fd);
  if (!t || t.id === me.id) return { error: "That account can't be deleted from here." };
  if (String(fd.get("confirm") ?? "").trim().toLowerCase() !== t.username) return { error: `Type ${t.username} to confirm.` };
  await deleteUploadsOf(t.id).catch((err) => console.error("[uploads] couldn't delete a member's pictures", err));
  await prisma.user.delete({ where: { id: t.id } });
  await logStaff(me.id, "user.delete", { type: "USER", id: t.id }, t.username);
  revalidatePath("/staff");
  redirect("/staff?tab=members");
}

/** Owners and admins edit the site-wide forum rules. Moderators enforce them but can't change them. */
export async function saveForumRules(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireUser("/staff");
  if (!isAdmin(me)) return { error: "Only admins can change the forum rules." };
  const value = String(fd.get("rules") ?? "").trim();
  if (value.length < 20) return { error: "The rules need a little more than that." };
  if (value.length > 20_000) return { error: "Keep the rules under 20,000 characters." };
  await prisma.siteSetting.upsert({ where: { key: FORUM_RULES_KEY }, create: { key: FORUM_RULES_KEY, value, updatedById: me.id }, update: { value, updatedById: me.id } });
  await logStaff(me.id, "rules.edit", null, `${value.length} characters`);
  revalidatePath("/forums/rules");
  revalidatePath("/staff");
  return { ok: "Forum rules saved." };
}

/** Approves or rejects a member's "this trophy needs online" flag. Approving sets the trophy. */
export async function reviewOnlineFlag(fd: FormData) {
  const me = await requireUser("/staff");
  if (!isStaff(me)) return;
  const flag = await prisma.onlineFlag.findUnique({
    where: { id: String(fd.get("flagId") ?? "") },
    include: { trophy: { select: { id: true, gameId: true, game: { select: { slug: true } } } } },
  });
  if (!flag || flag.status !== "PENDING") return;
  const approve = fd.get("decision") === "approve";
  await prisma.$transaction([
    ...(approve ? [prisma.trophy.update({ where: { id: flag.trophyId }, data: { online: flag.online } })] : []),
    // Everyone who flagged the same thing gets the same answer.
    prisma.onlineFlag.updateMany({
      where: { trophyId: flag.trophyId, online: flag.online, status: "PENDING" },
      data: { status: approve ? "APPROVED" : "REJECTED", reviewedAt: new Date(), reviewedById: me.id },
    }),
  ]);
  if (approve) await refreshOnlineFlagOnGame(flag.trophy.gameId);
  await logStaff(me.id, approve ? "online.approve" : "online.reject", { type: "TROPHY", id: flag.trophyId });
  revalidatePath("/staff");
  revalidatePath(`/games/${flag.trophy.game.slug}`, "layout");
}

/** Staff set a trophy's online status directly (from the trophy page). */
export async function setTrophyOnline(fd: FormData) {
  const me = await requireUser();
  if (!isStaff(me)) return;
  const trophy = await prisma.trophy.findUnique({ where: { id: String(fd.get("trophyId") ?? "") }, select: { id: true, gameId: true, game: { select: { slug: true } } } });
  if (!trophy) return;
  const online = fd.get("online") === "1";
  await prisma.$transaction([
    prisma.trophy.update({ where: { id: trophy.id }, data: { online } }),
    prisma.onlineFlag.updateMany({ where: { trophyId: trophy.id, status: "PENDING" }, data: { status: "APPROVED", reviewedAt: new Date(), reviewedById: me.id } }),
  ]);
  await refreshOnlineFlagOnGame(trophy.gameId);
  await logStaff(me.id, "online.set", { type: "TROPHY", id: trophy.id }, online ? "online" : "not online");
  revalidatePath(`/games/${trophy.game.slug}`, "layout");
}

/** The game's "Online trophies" chip follows its trophies. */
async function refreshOnlineFlagOnGame(gameId: string) {
  const any = await prisma.trophy.count({ where: { gameId, online: true } });
  await prisma.game.update({ where: { id: gameId }, data: { hasOnlineTrophies: any > 0 } });
}
