"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { verifyFirst } from "@/lib/email";
import { slugify, youtubeId } from "@/lib/utils";
import { refreshEstimates } from "@/lib/estimates";
import { isAdmin, isStaff } from "@/lib/forum";
import type { FormState } from "./auth";

// ─── Tips ────────────────────────────────────────────────────────────────────

export async function addTip(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const unverified = verifyFirst(user);
  if (unverified) return { error: unverified };
  const body = String(fd.get("body") ?? "").trim();
  const trophyId = (fd.get("trophyId") as string) || null;
  const guideId = (fd.get("guideId") as string) || null;
  const path = String(fd.get("path") ?? "/");
  if (body.length < 10) return { error: "Tips need at least 10 characters." };
  if (body.length > 1000) return { error: "Keep tips under 1,000 characters." };
  if (!trophyId && !guideId) return { error: "Nothing to attach this tip to." };

  await prisma.tip.create({ data: { authorId: user.id, body, trophyId, guideId } });
  revalidatePath(path);
  return { ok: "Thanks, your tip is live." };
}

export async function voteTip(fd: FormData) {
  const user = await requireUser();
  const tipId = String(fd.get("tipId"));
  const value = fd.get("value") === "-1" ? -1 : 1;
  const existing = await prisma.tipVote.findUnique({ where: { userId_tipId: { userId: user.id, tipId } } });
  if (existing?.value === value) {
    await prisma.tipVote.delete({ where: { userId_tipId: { userId: user.id, tipId } } });
  } else {
    await prisma.tipVote.upsert({
      where: { userId_tipId: { userId: user.id, tipId } },
      create: { userId: user.id, tipId, value },
      update: { value },
    });
  }
  revalidatePath(String(fd.get("path") ?? "/"));
}

// ─── Guides ──────────────────────────────────────────────────────────────────

const stepSchema = z.object({
  kind: z.enum(["ROADMAP", "MISSABLE", "COLLECTIBLE", "SPEEDRUN", "TROPHY"]),
  title: z.string().trim().min(2, "Give this step a title.").max(120, "Step titles must be under 120 characters."),
  body: z.string().trim().min(2, "Add some details to this step.").max(4000, "Step details must be under 4,000 characters."),
  trophyId: z.string().optional().nullable(),
  video: z.string().optional().nullable(),
});

const guideSchema = z.object({
  gameId: z.string().min(1, "Pick a game."),
  title: z.string().trim().min(5, "Title is too short.").max(120),
  summary: z.string().trim().min(20, "Summary should be at least 20 characters.").max(600),
  difficulty: z.coerce.number().int().min(1).max(10),
  hoursEstimate: z.coerce.number().int().min(1).max(2000),
  playthroughs: z.coerce.number().int().min(1).max(20),
  video: z.string().optional(),
  steps: z.array(stepSchema).min(1, "Add at least one step."),
});

export async function createGuide(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const unverified = verifyFirst(user);
  if (unverified) return { error: unverified };
  let steps: unknown;
  try {
    steps = JSON.parse(String(fd.get("steps") ?? "[]"));
  } catch {
    return { error: "Couldn't read guide steps." };
  }
  const parsed = guideSchema.safeParse({ ...Object.fromEntries(fd), steps });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue.path[0] === "steps" && issue.path.length > 1 ? `Step ${Number(issue.path[1]) + 1}: ${issue.message}` : issue.message };
  }
  const g = parsed.data;
  const game = await prisma.game.findUnique({ where: { id: g.gameId }, include: { trophies: { select: { id: true, missable: true } } } });
  if (!game) return { error: "Unknown game." };
  const validTrophies = new Set(game.trophies.map((t) => t.id));

  const base = slugify(g.title) || "guide";
  let slug = base;
  for (let i = 2; await prisma.guide.findUnique({ where: { slug }, select: { id: true } }); i++) slug = `${base}-${i}`;

  // Staff and trusted members publish straight away; other guides wait for staff to approve them.
  const publish = isStaff(user) || user.trusted;
  await prisma.guide.create({
    data: {
      slug,
      status: publish ? "PUBLISHED" : "PENDING",
      gameId: game.id,
      authorId: user.id,
      title: g.title,
      summary: g.summary,
      difficulty: g.difficulty,
      hoursEstimate: g.hoursEstimate,
      playthroughs: g.playthroughs,
      onlineRequired: fd.get("onlineRequired") === "on",
      missableCount: g.steps.filter((s) => s.kind === "MISSABLE").length,
      videoYoutubeId: youtubeId(g.video),
      steps: {
        create: g.steps.map((s, order) => ({
          order,
          kind: s.kind,
          title: s.title,
          body: s.body,
          trophyId: s.trophyId && validTrophies.has(s.trophyId) ? s.trophyId : null,
          videoYoutubeId: youtubeId(s.video),
        })),
      },
    },
  });
  if (publish) {
    await refreshEstimates([game.id]);
    revalidatePath("/guides");
    revalidatePath("/games", "layout");
  }
  revalidatePath("/reports");
  redirect(`/guides/${slug}`);
}

/** Staff approve a waiting guide, or send it back to its author with a note. */
export async function reviewGuide(fd: FormData) {
  const user = await requireUser("/reports");
  if (!isStaff(user)) return;
  const guide = await prisma.guide.findUnique({ where: { id: String(fd.get("guideId")) }, select: { id: true, slug: true, gameId: true, status: true } });
  if (!guide || guide.status !== "PENDING") return;
  const approve = fd.get("decision") === "approve";
  const note = String(fd.get("note") ?? "").trim().slice(0, 500) || null;
  await prisma.guide.update({
    where: { id: guide.id },
    data: approve ? { status: "PUBLISHED", reviewNote: null, createdAt: new Date() } : { status: "REJECTED", reviewNote: note ?? "Staff didn't approve this guide." },
  });
  if (approve) {
    await refreshEstimates([guide.gameId]);
    revalidatePath("/guides");
    revalidatePath("/games", "layout");
    revalidatePath("/");
  }
  revalidatePath(`/guides/${guide.slug}`);
  revalidatePath("/reports");
}

/** Staff let a member publish guides without approval, or take that back. */
export async function setTrusted(fd: FormData) {
  const user = await requireUser();
  if (!isAdmin(user)) return;
  const target = await prisma.user.findUnique({ where: { id: String(fd.get("userId")) }, select: { id: true, username: true } });
  if (!target) return;
  await prisma.user.update({ where: { id: target.id }, data: { trusted: fd.get("trusted") === "1" } });
  revalidatePath(`/u/${target.username}`);
}

/** Saves a guide to the member's favourites, or removes it. */
export async function toggleGuideFavourite(fd: FormData) {
  const user = await requireUser();
  const guide = await prisma.guide.findUnique({ where: { id: String(fd.get("guideId")) }, select: { id: true, slug: true } });
  if (!guide) return;
  const key = { userId_guideId: { userId: user.id, guideId: guide.id } };
  if (await prisma.guideFavourite.findUnique({ where: key })) await prisma.guideFavourite.delete({ where: key });
  else await prisma.guideFavourite.create({ data: { userId: user.id, guideId: guide.id } });
  revalidatePath(`/guides/${guide.slug}`);
  revalidatePath(`/u/${user.username}`);
}

// ─── Sessions ────────────────────────────────────────────────────────────────

const sessionSchema = z.object({
  gameId: z.string().min(1, "Pick a game."),
  title: z.string().trim().min(4, "Title is too short.").max(100),
  description: z.string().trim().max(500).optional(),
  platform: z.enum(["PS5", "PS4", "PS3", "PSVITA"]),
  startsAt: z.coerce.date().refine((d) => d.getTime() > Date.now() - 60_000, "Start time must be in the future."),
  slots: z.coerce.number().int().min(2).max(16),
});

export async function createSession(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const unverified = verifyFirst(user);
  if (unverified) return { error: unverified };
  const parsed = sessionSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  // Trophies the session is going for: only ones from the chosen game's list count.
  const wanted = fd.getAll("trophyIds").map(String).filter(Boolean).slice(0, 30);
  const trophies = wanted.length
    ? await prisma.trophy.findMany({ where: { id: { in: wanted }, gameId: parsed.data.gameId }, select: { id: true } })
    : [];
  const s = await prisma.session.create({
    data: {
      ...parsed.data,
      hostId: user.id,
      members: { create: { userId: user.id } },
      trophies: { create: trophies.map((t) => ({ trophyId: t.id })) },
    },
  });
  revalidatePath("/sessions");
  revalidatePath("/");
  redirect(`/sessions/${s.id}`);
}

export async function addSessionComment(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const unverified = verifyFirst(user);
  if (unverified) return { error: unverified };
  const sessionId = String(fd.get("sessionId"));
  const body = String(fd.get("body") ?? "").trim();
  if (body.length < 2) return { error: "Write something first." };
  if (body.length > 1000) return { error: "Keep comments under 1,000 characters." };
  if (!(await prisma.session.findUnique({ where: { id: sessionId }, select: { id: true } }))) return { error: "That session was cancelled." };
  await prisma.sessionComment.create({ data: { sessionId, authorId: user.id, body } });
  revalidatePath(`/sessions/${sessionId}`);
  return { ok: "Comment posted." };
}

export async function deleteSessionComment(fd: FormData) {
  const user = await requireUser();
  const c = await prisma.sessionComment.findUnique({ where: { id: String(fd.get("commentId")) }, include: { session: { select: { hostId: true } } } });
  // The author, the session's host or an admin can remove a comment.
  if (!c || (c.authorId !== user.id && c.session.hostId !== user.id && !isStaff(user))) return;
  await prisma.sessionComment.delete({ where: { id: c.id } });
  revalidatePath(`/sessions/${c.sessionId}`);
}

export async function toggleSession(fd: FormData) {
  const user = await requireUser();
  const sessionId = String(fd.get("sessionId"));
  const session = await prisma.session.findUnique({ where: { id: sessionId }, include: { _count: { select: { members: true } } } });
  if (!session) return;
  const member = await prisma.sessionMember.findUnique({ where: { sessionId_userId: { sessionId, userId: user.id } } });
  if (member) {
    if (session.hostId === user.id) {
      // The host leaving cancels the session.
      await prisma.session.delete({ where: { id: sessionId } });
      revalidatePath("/sessions", "layout");
      revalidatePath("/");
      redirect("/sessions");
    }
    await prisma.sessionMember.delete({ where: { sessionId_userId: { sessionId, userId: user.id } } });
  } else if (session._count.members < session.slots) {
    await prisma.sessionMember.create({ data: { sessionId, userId: user.id } });
  }
  revalidatePath("/sessions", "layout");
}
