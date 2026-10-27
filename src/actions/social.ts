"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { logStaff } from "@/lib/staff";
import { requireUser } from "@/lib/auth";
import { verifyFirst } from "@/lib/email";
import { formText, hateSpeechError } from "@/lib/moderation";
import { blockBetween } from "@/lib/blocks";
import { clubActive } from "@/lib/idle-clubs";
import { COMMENT_MAX, POST_MAX, REACTIONS } from "@/lib/community";
import { isStaff } from "@/lib/forum";
import { rateLimit } from "@/lib/rate-limit";
import { isOurUpload } from "@/lib/uploads";
import { slugify } from "@/lib/utils";
import { PROFILE_CARDS } from "@/lib/profile-themes";
import { AVATAR_PRESETS } from "@/components/avatars";
import type { FormState } from "./auth";

// ─── Follows ─────────────────────────────────────────────────────────────────

/** Follow or unfollow. Following needs no approval, unlike a friend request. */
export async function toggleFollow(fd: FormData) {
  const me = await requireUser();
  const target = await prisma.user.findUnique({ where: { id: String(fd.get("userId")) }, select: { id: true, username: true } });
  if (!target || target.id === me.id) return;
  const key = { followerId_followingId: { followerId: me.id, followingId: target.id } };
  if (await prisma.follow.findUnique({ where: key })) await prisma.follow.delete({ where: key });
  else if (!(await blockBetween(me.id, target.id))) await prisma.follow.create({ data: { followerId: me.id, followingId: target.id } });
  revalidatePath(`/u/${target.username}`);
  revalidatePath("/community");
}

// ─── Updates ─────────────────────────────────────────────────────────────────

export async function createPost(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireUser("/community");
  const unverified = verifyFirst(me);
  if (unverified) return { error: unverified };
  const hate = hateSpeechError(...formText(fd));
  if (hate) return { error: hate };
  if (!(await rateLimit("post", 10, 10 * 60_000, me.id))) return { error: "You've posted a lot just now. Try again in a few minutes." };
  const body = String(fd.get("body") ?? "").trim();
  if (body.length < 2) return { error: "Write something first." };
  if (body.length > POST_MAX) return { error: `Keep updates under ${POST_MAX.toLocaleString("en-GB")} characters.` };
  const clubId = (fd.get("clubId") as string) || null;
  if (clubId && !(await prisma.clubMember.findUnique({ where: { clubId_userId: { clubId, userId: me.id } } }))) {
    return { error: "Join the club to post in it." };
  }
  await prisma.post.create({ data: { authorId: me.id, clubId, body } });
  if (clubId) await clubActive(clubId);
  revalidatePath("/community");
  revalidatePath("/clubs", "layout");
  return { ok: "Posted." };
}

/** Adds the member's reaction to an update, or takes it off again. */
export async function toggleReaction(fd: FormData) {
  const me = await requireUser();
  const emoji = String(fd.get("emoji") ?? "");
  if (!REACTIONS.some(([e]) => e === emoji)) return;
  if (!(await rateLimit("reaction", 60, 60_000, me.id))) return;
  const post = await prisma.post.findUnique({ where: { id: String(fd.get("postId")) }, select: { id: true, clubId: true, club: { select: { slug: true } } } });
  if (!post) return;
  const key = { postId_userId_emoji: { postId: post.id, userId: me.id, emoji } };
  if (await prisma.postReaction.findUnique({ where: key })) await prisma.postReaction.delete({ where: key });
  else {
    await prisma.postReaction.create({ data: key.postId_userId_emoji });
    if (post.clubId) await clubActive(post.clubId);
  }
  if (post.club) revalidatePath(`/clubs/${post.club.slug}`);
  revalidatePath("/community");
}

/** A reply under an update. Anyone signed in can comment, unless the update's author blocked them. */
export async function addComment(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireUser("/community");
  const unverified = verifyFirst(me);
  if (unverified) return { error: unverified };
  if (!(await rateLimit("comment", 20, 10 * 60_000, me.id))) return { error: "You've commented a lot just now. Try again in a few minutes." };
  const body = String(fd.get("body") ?? "").trim();
  if (body.length < 1) return { error: "Write a comment first." };
  if (body.length > COMMENT_MAX) return { error: `Keep comments under ${COMMENT_MAX} characters.` };
  const hate = hateSpeechError(body);
  if (hate) return { error: hate };
  const post = await prisma.post.findUnique({ where: { id: String(fd.get("postId") ?? "") }, select: { id: true, authorId: true, clubId: true, club: { select: { slug: true } } } });
  if (!post) return { error: "That update was deleted." };
  if (await blockBetween(me.id, post.authorId)) return { error: "You can't comment on this update." };
  await prisma.postComment.create({ data: { postId: post.id, authorId: me.id, body } });
  if (post.clubId) await clubActive(post.clubId);
  if (post.club) revalidatePath(`/clubs/${post.club.slug}`);
  revalidatePath("/community");
  return { ok: "Comment posted." };
}

/** The comment's author, the update's author or staff can delete a comment. */
export async function deleteComment(fd: FormData) {
  const me = await requireUser();
  const c = await prisma.postComment.findUnique({
    where: { id: String(fd.get("commentId") ?? "") },
    select: { id: true, authorId: true, post: { select: { authorId: true, club: { select: { slug: true } } } } },
  });
  if (!c || (c.authorId !== me.id && c.post.authorId !== me.id && !isStaff(me))) return;
  await prisma.postComment.delete({ where: { id: c.id } });
  if (c.post.club) revalidatePath(`/clubs/${c.post.club.slug}`);
  revalidatePath("/community");
}

export async function deletePost(fd: FormData) {
  const me = await requireUser();
  const post = await prisma.post.findUnique({ where: { id: String(fd.get("postId")) } });
  if (!post || (post.authorId !== me.id && !isStaff(me))) return;
  await prisma.post.delete({ where: { id: post.id } });
  revalidatePath("/community");
  revalidatePath("/clubs", "layout");
}

// ─── Clubs ───────────────────────────────────────────────────────────────────

const clubSchema = z.object({
  name: z.string().trim().min(3, "Give the club a name of at least 3 characters.").max(50, "Keep the name under 50 characters."),
  description: z.string().trim().max(300, "Keep the description under 300 characters.").default(""),
  theme: z
    .string()
    .default("")
    .transform((t) => (t in PROFILE_CARDS ? t : "")),
});

export async function createClub(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireUser("/clubs");
  const unverified = verifyFirst(me);
  if (unverified) return { error: unverified };
  const hate = hateSpeechError(...formText(fd));
  if (hate) return { error: hate };
  if (!(await rateLimit("club", 3, 60 * 60_000, me.id))) return { error: "You've created a few clubs already. Try again later." };
  const parsed = clubSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const base = slugify(parsed.data.name) || "club";
  // /clubs/new would clash with nothing today, but keep the word free.
  let slug = base === "new" ? "new-club" : base;
  for (let i = 2; await prisma.club.findUnique({ where: { slug }, select: { id: true } }); i++) slug = `${base}-${i}`;
  await prisma.club.create({
    data: { ...parsed.data, slug, ownerId: me.id, members: { create: { userId: me.id } } },
  });
  revalidatePath("/clubs");
  redirect(`/clubs/${slug}`);
}

/** The owner (or an admin) changes the club's card theme. */
export async function setClubTheme(fd: FormData) {
  const me = await requireUser("/clubs");
  const club = await prisma.club.findUnique({ where: { id: String(fd.get("clubId")) }, select: { id: true, slug: true, ownerId: true } });
  if (!club || (club.ownerId !== me.id && !isStaff(me))) return;
  const theme = String(fd.get("theme") ?? "");
  // Club picture: one of the built-in pictures, or none (its initial).
  const pick = String(fd.get("avatar") ?? "");
  const avatar = pick.startsWith("preset:") && pick.slice(7) in AVATAR_PRESETS ? pick : null;
  await prisma.club.update({ where: { id: club.id }, data: { theme: theme in PROFILE_CARDS ? theme : "", avatar } });
  revalidatePath(`/clubs/${club.slug}`);
  revalidatePath("/clubs");
}

const CLUB_RULES_MAX = 3000;

/**
 * The owner (or staff) sets the club's rules and banner. The banner is a
 * game's artwork we already show on the site, or a picture uploaded here;
 * nothing else, so a club can't hotlink arbitrary images.
 */
export async function saveClubDetails(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireUser("/clubs");
  const club = await prisma.club.findUnique({ where: { id: String(fd.get("clubId")) }, select: { id: true, slug: true, ownerId: true } });
  if (!club || (club.ownerId !== me.id && !isStaff(me))) return { error: "Only the club's owner can change this." };
  const rules = String(fd.get("rules") ?? "").trim();
  if (rules.length > CLUB_RULES_MAX) return { error: `Keep the rules under ${CLUB_RULES_MAX.toLocaleString("en-GB")} characters.` };
  const hate = hateSpeechError(rules);
  if (hate) return { error: hate };
  const banner = String(fd.get("bannerUrl") ?? "").trim();
  let bannerUrl: string | null = null;
  if (banner) {
    const fromGame = await prisma.game.findFirst({ where: { screenshots: { contains: JSON.stringify(banner).slice(1, -1) } }, select: { id: true } });
    if (!fromGame && !isOurUpload(banner)) return { error: "Pick one of the game pictures, or upload one." };
    bannerUrl = banner;
  }
  await prisma.club.update({ where: { id: club.id }, data: { rules, bannerUrl } });
  if (club.ownerId !== me.id) await logStaff(me.id, "club.edit", { type: "CLUB", id: club.id });
  revalidatePath(`/clubs/${club.slug}`);
  revalidatePath("/clubs");
  return { ok: "Saved." };
}

/** Join or leave. The owner can't leave their own club; they delete it instead. */
export async function toggleClubMembership(fd: FormData) {
  const me = await requireUser("/clubs");
  const club = await prisma.club.findUnique({ where: { id: String(fd.get("clubId")) } });
  if (!club || club.ownerId === me.id) return;
  const key = { clubId_userId: { clubId: club.id, userId: me.id } };
  if (await prisma.clubMember.findUnique({ where: key })) await prisma.clubMember.delete({ where: key });
  else {
    await prisma.clubMember.create({ data: { clubId: club.id, userId: me.id } });
    await clubActive(club.id);
  }
  revalidatePath("/clubs", "layout");
  revalidatePath("/community");
}

export async function deleteClub(fd: FormData) {
  const me = await requireUser("/clubs");
  const club = await prisma.club.findUnique({ where: { id: String(fd.get("clubId")) } });
  if (!club || (club.ownerId !== me.id && !isStaff(me))) return;
  await prisma.club.delete({ where: { id: club.id } });
  if (club.ownerId !== me.id) await logStaff(me.id, "club.delete", { type: "CLUB", id: club.id }, club.name);
  revalidatePath("/clubs", "layout");
  redirect("/clubs");
}
