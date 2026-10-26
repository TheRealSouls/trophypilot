"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isAdmin, isStaff, POSTS_PER_PAGE, uniqueSectionSlug } from "@/lib/forum";
import { rateLimit } from "@/lib/rate-limit";
import { slugify } from "@/lib/utils";
import type { FormState } from "./auth";

const body = z.string().trim().min(2, "Write something first.").max(10_000, "Posts can be up to 10,000 characters.");

async function requireAdmin() {
  const user = await requireUser("/forums");
  if (!isAdmin(user)) throw new Error("Only admins can do that.");
  return user;
}

/** The page of a thread that shows its newest post. */
async function lastPageOf(threadId: string) {
  const count = await prisma.forumPost.count({ where: { threadId } });
  return Math.max(1, Math.ceil(count / POSTS_PER_PAGE));
}

// ─── Sections (admins) ───────────────────────────────────────────────────────

const sectionSchema = z.object({
  name: z.string().trim().min(2, "Give the section a name.").max(60, "Keep names under 60 characters."),
  description: z.string().trim().max(200, "Keep descriptions under 200 characters.").default(""),
  parentId: z.string().optional().transform((v) => v || null),
  order: z.coerce.number().int().min(0).max(999).default(0),
  adminOnly: z.literal("on").optional(),
});

export async function saveSection(_: FormState, fd: FormData): Promise<FormState> {
  try {
    await requireAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }
  const parsed = sectionSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const s = parsed.data;
  const id = (fd.get("id") as string) || null;

  if (s.parentId) {
    const parent = await prisma.forumSection.findUnique({ where: { id: s.parentId }, select: { id: true, parentId: true } });
    if (!parent || parent.parentId) return { error: "Sub-sections can only go inside a top-level section." };
    if (parent.id === id) return { error: "A section can't be inside itself." };
    if (id && (await prisma.forumSection.count({ where: { parentId: id } }))) {
      return { error: "This section has sub-sections, so it has to stay top-level." };
    }
  }

  const data = {
    name: s.name,
    description: s.description,
    parentId: s.parentId,
    order: s.order,
    adminOnly: s.adminOnly === "on",
  };
  if (id) {
    await prisma.forumSection.update({ where: { id }, data: { ...data, slug: await uniqueSectionSlug(slugify(s.name), id) } });
  } else {
    await prisma.forumSection.create({ data: { ...data, slug: await uniqueSectionSlug(slugify(s.name)) } });
  }
  revalidatePath("/forums", "layout");
  return { ok: id ? `Saved "${s.name}".` : `Created "${s.name}".` };
}

export async function deleteSection(fd: FormData) {
  await requireAdmin();
  await prisma.forumSection.delete({ where: { id: String(fd.get("id")) } });
  revalidatePath("/forums", "layout");
}

// ─── Threads and posts ───────────────────────────────────────────────────────

const threadSchema = z.object({
  sectionId: z.string().min(1, "Pick a section."),
  title: z.string().trim().min(4, "Give the thread a title of at least 4 characters.").max(120, "Keep titles under 120 characters."),
  body,
  gameId: z.string().optional().transform((v) => v || null),
});

export async function createThread(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser("/forums");
  if (!(await rateLimit("forum-thread", 5, 10 * 60_000, user.id))) {
    return { error: "You've started a lot of threads just now. Try again in a few minutes." };
  }
  const parsed = threadSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const t = parsed.data;

  const section = await prisma.forumSection.findUnique({ where: { id: t.sectionId } });
  if (!section) return { error: "That section doesn't exist any more." };
  if (section.adminOnly && !isStaff(user)) return { error: "Only admins can start threads in this section." };
  if (t.gameId && !(await prisma.game.findUnique({ where: { id: t.gameId }, select: { id: true } }))) {
    return { error: "Unknown game." };
  }

  const thread = await prisma.forumThread.create({
    data: {
      sectionId: section.id,
      authorId: user.id,
      gameId: t.gameId,
      title: t.title,
      posts: { create: { authorId: user.id, body: t.body } },
    },
  });
  revalidatePath("/forums", "layout");
  if (t.gameId) revalidatePath("/games", "layout");
  redirect(`/forums/thread/${thread.id}`);
}

export async function replyToThread(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser("/forums");
  if (!(await rateLimit("forum-post", 10, 60_000, user.id))) return { error: "Slow down a little and try again in a minute." };
  const threadId = String(fd.get("threadId"));
  const parsed = body.safeParse(fd.get("body"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const thread = await prisma.forumThread.findUnique({ where: { id: threadId }, select: { id: true, locked: true } });
  if (!thread) return { error: "That thread was deleted." };
  if (thread.locked && !isStaff(user)) return { error: "This thread is locked." };

  const post = await prisma.$transaction(async (tx) => {
    const p = await tx.forumPost.create({ data: { threadId, authorId: user.id, body: parsed.data } });
    await tx.forumThread.update({ where: { id: threadId }, data: { postCount: { increment: 1 }, lastPostAt: p.createdAt } });
    return p;
  });
  revalidatePath("/forums", "layout");
  redirect(`/forums/thread/${threadId}?page=${await lastPageOf(threadId)}#post-${post.id}`);
}

export async function editPost(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser("/forums");
  const post = await prisma.forumPost.findUnique({ where: { id: String(fd.get("postId")) } });
  if (!post) return { error: "That post was deleted." };
  if (post.authorId !== user.id && !isStaff(user)) return { error: "You can only edit your own posts." };
  const parsed = body.safeParse(fd.get("body"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await prisma.forumPost.update({ where: { id: post.id }, data: { body: parsed.data, editedAt: new Date() } });
  revalidatePath(`/forums/thread/${post.threadId}`);
  return { ok: "Saved." };
}

/** Deleting the first post deletes the whole thread. */
export async function deletePost(fd: FormData) {
  const user = await requireUser("/forums");
  const post = await prisma.forumPost.findUnique({ where: { id: String(fd.get("postId")) }, include: { thread: true } });
  if (!post || (post.authorId !== user.id && !isStaff(user))) return;

  const first = await prisma.forumPost.findFirst({ where: { threadId: post.threadId }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (first?.id === post.id) {
    const section = await prisma.forumSection.findUnique({ where: { id: post.thread.sectionId }, select: { slug: true } });
    await prisma.forumThread.delete({ where: { id: post.threadId } });
    revalidatePath("/forums", "layout");
    redirect(`/forums/${section?.slug ?? ""}`);
  }
  await prisma.$transaction(async (tx) => {
    await tx.forumPost.delete({ where: { id: post.id } });
    const newest = await tx.forumPost.findFirst({ where: { threadId: post.threadId }, orderBy: { createdAt: "desc" } });
    await tx.forumThread.update({
      where: { id: post.threadId },
      data: { postCount: { decrement: 1 }, lastPostAt: newest?.createdAt ?? post.thread.createdAt },
    });
  });
  revalidatePath("/forums", "layout");
}

/** Admin moderation: pin, unpin, lock, unlock, move or delete a thread. */
export async function moderateThread(fd: FormData) {
  const user = await requireUser("/forums");
  if (!isStaff(user)) return;
  const id = String(fd.get("threadId"));
  const action = String(fd.get("action"));
  const thread = await prisma.forumThread.findUnique({ where: { id }, include: { section: { select: { slug: true } } } });
  if (!thread) return;
  if (action === "delete") {
    await prisma.forumThread.delete({ where: { id } });
    revalidatePath("/forums", "layout");
    redirect(`/forums/${thread.section.slug}`);
  }
  const data =
    action === "pin" ? { pinned: true }
    : action === "unpin" ? { pinned: false }
    : action === "lock" ? { locked: true }
    : action === "unlock" ? { locked: false }
    : action === "move" && fd.get("sectionId") ? { sectionId: String(fd.get("sectionId")) }
    : null;
  if (data) await prisma.forumThread.update({ where: { id }, data });
  revalidatePath("/forums", "layout");
}
