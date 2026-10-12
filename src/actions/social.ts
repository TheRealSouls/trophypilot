"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { POST_MAX } from "@/lib/community";
import { isAdmin } from "@/lib/forum";
import { rateLimit } from "@/lib/rate-limit";
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
  else await prisma.follow.create({ data: { followerId: me.id, followingId: target.id } });
  revalidatePath(`/u/${target.username}`);
  revalidatePath("/community");
}

// ─── Updates ─────────────────────────────────────────────────────────────────

export async function createPost(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireUser("/community");
  if (!(await rateLimit("post", 10, 10 * 60_000, me.id))) return { error: "You've posted a lot just now. Try again in a few minutes." };
  const body = String(fd.get("body") ?? "").trim();
  if (body.length < 2) return { error: "Write something first." };
  if (body.length > POST_MAX) return { error: `Keep updates under ${POST_MAX.toLocaleString("en-GB")} characters.` };
  const clubId = (fd.get("clubId") as string) || null;
  if (clubId && !(await prisma.clubMember.findUnique({ where: { clubId_userId: { clubId, userId: me.id } } }))) {
    return { error: "Join the club to post in it." };
  }
  await prisma.post.create({ data: { authorId: me.id, clubId, body } });
  revalidatePath("/community");
  revalidatePath("/clubs", "layout");
  return { ok: "Posted." };
}

export async function deletePost(fd: FormData) {
  const me = await requireUser();
  const post = await prisma.post.findUnique({ where: { id: String(fd.get("postId")) } });
  if (!post || (post.authorId !== me.id && !isAdmin(me))) return;
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
  if (!club || (club.ownerId !== me.id && me.role !== "ADMIN")) return;
  const theme = String(fd.get("theme") ?? "");
  // Club picture: one of the built-in pictures, or none (its initial).
  const pick = String(fd.get("avatar") ?? "");
  const avatar = pick.startsWith("preset:") && pick.slice(7) in AVATAR_PRESETS ? pick : null;
  await prisma.club.update({ where: { id: club.id }, data: { theme: theme in PROFILE_CARDS ? theme : "", avatar } });
  revalidatePath(`/clubs/${club.slug}`);
  revalidatePath("/clubs");
}

/** Join or leave. The owner can't leave their own club; they delete it instead. */
export async function toggleClubMembership(fd: FormData) {
  const me = await requireUser("/clubs");
  const club = await prisma.club.findUnique({ where: { id: String(fd.get("clubId")) } });
  if (!club || club.ownerId === me.id) return;
  const key = { clubId_userId: { clubId: club.id, userId: me.id } };
  if (await prisma.clubMember.findUnique({ where: key })) await prisma.clubMember.delete({ where: key });
  else await prisma.clubMember.create({ data: { clubId: club.id, userId: me.id } });
  revalidatePath("/clubs", "layout");
  revalidatePath("/community");
}

export async function deleteClub(fd: FormData) {
  const me = await requireUser("/clubs");
  const club = await prisma.club.findUnique({ where: { id: String(fd.get("clubId")) } });
  if (!club || (club.ownerId !== me.id && !isAdmin(me))) return;
  await prisma.club.delete({ where: { id: club.id } });
  revalidatePath("/clubs", "layout");
  redirect("/clubs");
}
