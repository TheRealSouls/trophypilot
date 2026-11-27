"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { sendNotice } from "@/lib/community";
import { canSetRole, isAdmin, isOwner, isStaff, MODERATOR_MAX_SUSPEND_DAYS, outranks, STAFF_BADGES, type Role } from "@/lib/roles";
import { logStaff } from "@/lib/staff";
import { bust } from "@/lib/cache";
import { queuePlayers } from "@/lib/psn/import-queue";
import { deleteUploadsOf } from "@/lib/uploads";
import { FORUM_RULES_KEY, getSetting, GUIDE_RULES_KEY, HOME_BACKGROUND_KEY, setSetting } from "@/lib/site-settings";
import { DEFAULT_FORUM_RULES, parseRules } from "@/lib/forum-rules";
import { DEFAULT_GUIDE_RULES } from "@/lib/guide-rules";
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

/** Any staff member edits the forum rules. Each save is logged with which rules changed. */
export async function saveForumRules(_: FormState, fd: FormData): Promise<FormState> {
  return saveRules(fd, FORUM_RULES_KEY, DEFAULT_FORUM_RULES, "rules.edit", ["/forums/rules"], "Forum rules saved.");
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

/**
 * Owners and admins set the home page picture for an occasion (Halloween,
 * Christmas, a big release): any https image, or nothing for the game covers.
 */
export async function saveHomeBackground(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireUser("/staff");
  if (!isAdmin(me)) return { error: "Only admins can change the home page." };
  const url = fd.get("clear") ? "" : String(fd.get("url") ?? "").trim();
  if (url && !/^https:\/\/[^\s"<>]+$/i.test(url)) return { error: "Use a picture address starting with https://." };
  if (url) await prisma.siteSetting.upsert({ where: { key: HOME_BACKGROUND_KEY }, create: { key: HOME_BACKGROUND_KEY, value: url, updatedById: me.id }, update: { value: url, updatedById: me.id } });
  else await prisma.siteSetting.deleteMany({ where: { key: HOME_BACKGROUND_KEY } });
  await logStaff(me.id, "home.background", null, url || "back to the game covers");
  revalidatePath("/");
  revalidatePath("/staff");
  return { ok: url ? "Saved. The home page shows it within a minute." : "Removed. The home page shows the game covers again." };
}

/** Any staff member edits the rules shown beside the guide editor, logged the same way. */
export async function saveGuideRules(_: FormState, fd: FormData): Promise<FormState> {
  return saveRules(fd, GUIDE_RULES_KEY, DEFAULT_GUIDE_RULES, "rules.guides", ["/guides/new"], "Guide rules saved.");
}

/** What changed between two versions of the rules, for the audit log: added, removed, reworded and moved. */
function rulesChange(before: string, after: string) {
  const a = parseRules(before);
  const b = parseRules(after);
  const titles = (l: typeof a) => l.map((r) => r.title.toLowerCase());
  const added = b.filter((r) => !titles(a).includes(r.title.toLowerCase())).map((r) => r.title);
  const removed = a.filter((r) => !titles(b).includes(r.title.toLowerCase())).map((r) => r.title);
  const edited = b.filter((r) => a.some((o) => o.title.toLowerCase() === r.title.toLowerCase() && o.text !== r.text)).map((r) => r.title);
  const kept = titles(b).filter((t) => titles(a).includes(t));
  const moved = kept.join("|") !== titles(a).filter((t) => titles(b).includes(t)).join("|");
  const part = (label: string, list: string[]) => (list.length ? `${label}: ${list.map((t) => `"${t}"`).join(", ")}` : null);
  return [part("Added", added), part("Removed", removed), part("Reworded", edited), moved ? "Changed the order" : null].filter(Boolean).join(". ") || "No changes";
}

async function saveRules(fd: FormData, key: string, fallback: string, action: string, paths: string[], ok: string): Promise<FormState> {
  const me = await requireUser("/staff");
  if (!isStaff(me)) return { error: "Only staff can change the rules." };
  const value = String(fd.get("rules") ?? "").trim();
  if (value.length < 20) return { error: "The rules need a little more than that." };
  if (value.length > 20_000) return { error: "Keep the rules under 20,000 characters." };
  const before = (await getSetting(key)) ?? fallback;
  const change = rulesChange(before, value);
  if (change === "No changes") return { ok: "Nothing changed." };
  await setSetting(key, value, me.id);
  await logStaff(me.id, action, null, change);
  for (const p of [...paths, "/staff"]) revalidatePath(p);
  return { ok };
}

/** Admins queue PSN players by Online ID; the players job adds them (level and totals only), a few dozen per run. */
export async function queuePsnPlayers(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireUser("/staff");
  if (!isAdmin(me)) return { error: "Only admins can add players." };
  const text = String(fd.get("names") ?? "");
  if (!text.trim()) return { error: "Paste at least one PSN Online ID." };
  if (text.length > 600_000) return { error: "That's too long. Add 20,000 names or fewer at a time." };
  const r = await queuePlayers(text, me.id);
  await logStaff(me.id, "players.import", null, `${r.added} queued`);
  revalidatePath("/staff");
  const extra = [r.tracked ? `${r.tracked} already tracked` : null, r.invalid ? `${r.invalid} not valid Online IDs` : null].filter(Boolean).join(", ");
  return { ok: `Queued ${r.added} player${r.added === 1 ? "" : "s"}${extra ? ` (${extra})` : ""}. ${r.queued} waiting in total.` };
}

/**
 * Staff void a member's trophy list (faked unlock times, hacked trophies): it stays on their profile,
 * marked, but no leaderboard counts it. Or restore it. The member is told why; both are logged.
 */
export async function setListVoid(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireUser("/staff");
  if (!isStaff(me)) return { error: "Only staff can do this." };
  const ug = await prisma.userGame.findUnique({
    where: { id: String(fd.get("userGameId") ?? "") },
    select: { id: true, userId: true, voidedAt: true, user: { select: { username: true } }, game: { select: { title: true, slug: true } } },
  });
  if (!ug) return { error: "That list is gone." };
  const restore = fd.get("restore") === "1";
  const reason = String(fd.get("reason") ?? "").trim().slice(0, 500);
  if (!restore && reason.length < 5) return { error: "Say why: which times look wrong, or what the report showed." };
  await prisma.userGame.update({
    where: { id: ug.id },
    data: restore ? { voidedAt: null, voidReason: null, voidedById: null } : { voidedAt: new Date(), voidReason: reason, voidedById: me.id },
  });
  await logStaff(me.id, restore ? "trophies.restore" : "trophies.void", { type: "USER", id: ug.userId }, `${ug.user.username}: ${ug.game.title}${restore ? "" : `. ${reason}`}`);
  await prisma.notification.create({
    data: {
      userId: ug.userId,
      kind: restore ? "RESTORED" : "VOIDED",
      title: restore ? `Staff restored your ${ug.game.title} trophies` : `Staff voided your ${ug.game.title} trophies`,
      body: restore ? "They count on the leaderboards again." : `They stay on your profile but don't count on any leaderboard. Reason: ${reason}`,
      url: `/u/${ug.user.username}/${ug.game.slug}`,
    },
  });
  bust("boards");
  revalidatePath(`/u/${ug.user.username}`, "layout");
  return { ok: restore ? "Restored: the list counts again." : "Voided: it no longer counts on the leaderboards." };
}
