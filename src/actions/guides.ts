"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { verifyFirst } from "@/lib/email";
import { hasHateSpeech, HATE_MESSAGE } from "@/lib/moderation";
import { rateLimit } from "@/lib/rate-limit";
import { refreshEstimates } from "@/lib/estimates";
import { slugify, youtubeId } from "@/lib/utils";
import { isStaff } from "@/lib/roles";
import { logStaff } from "@/lib/staff";


/**
 * Writing guides: drafts that save themselves while you type, publishing
 * (or sending for review), editing later, and deleting your own.
 */

export type GuideStepInput = { kind: string; title: string; body: string; trophyId: string | null; video: string | null };
export type GuideInput = {
  id?: string | null;
  gameId: string;
  title: string;
  summary: string;
  difficulty: number;
  hoursEstimate: number;
  playthroughs: number;
  video: string;
  onlineRequired: boolean;
  steps: GuideStepInput[];
};
export type SaveResult = { ok: true; id: string; slug: string; savedAt: string } | { ok: false; error: string };

const KINDS = ["ROADMAP", "MISSABLE", "COLLECTIBLE", "SPEEDRUN", "TROPHY"] as const;

const stepSchema = z.object({
  kind: z.enum(KINDS),
  title: z.string().trim().min(2, "Give this step a title.").max(120, "Step titles must be under 120 characters."),
  body: z.string().trim().min(2, "Add some details to this step.").max(4000, "Step details must be under 4,000 characters."),
  trophyId: z.string().optional().nullable(),
  video: z.string().optional().nullable(),
});
const publishSchema = z.object({
  gameId: z.string().min(1, "Pick a game."),
  title: z.string().trim().min(5, "The title is too short.").max(120),
  summary: z.string().trim().min(20, "The summary should be at least 20 characters.").max(600),
  difficulty: z.coerce.number().int().min(1).max(10),
  hoursEstimate: z.coerce.number().int().min(1).max(2000),
  playthroughs: z.coerce.number().int().min(1).max(20),
  video: z.string().optional(),
  steps: z.array(stepSchema).min(1, "Add at least one step."),
});

const clamp = (n: unknown, lo: number, hi: number, fallback: number) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
};
const allText = (g: GuideInput) => [g.title, g.summary, g.video, ...g.steps.flatMap((s) => [s.title, s.body])];

async function uniqueSlug(title: string) {
  const base = slugify(title) || "guide";
  let slug = base;
  for (let i = 2; await prisma.guide.findUnique({ where: { slug }, select: { id: true } }); i++) slug = `${base}-${i}`;
  return slug;
}

/** Trophy-by-trophy notes are titled with their trophy's name (the editor sends them untitled). */
async function withTrophyNames(gameId: string, steps: GuideStepInput[]) {
  const names = new Map((await prisma.trophy.findMany({ where: { gameId }, select: { id: true, name: true } })).map((t) => [t.id, t.name]));
  return steps
    .filter((s) => s.kind !== "TROPHY" || (s.trophyId && names.has(s.trophyId)))
    .map((s) => (s.kind === "TROPHY" ? { ...s, title: names.get(s.trophyId!)!.slice(0, 120) } : s));
}

/** Steps for the guide, keeping only trophies from its own list. */
async function stepRows(gameId: string, steps: GuideStepInput[], strict: boolean) {
  const valid = new Set((await prisma.trophy.findMany({ where: { gameId }, select: { id: true } })).map((t) => t.id));
  return (await withTrophyNames(gameId, steps))
    .filter((s) => (KINDS as readonly string[]).includes(s.kind) && (strict || s.title.trim() || s.body.trim()))
    .slice(0, 400)
    .map((s, order) => ({
      order,
      kind: s.kind,
      title: s.title.trim().slice(0, 120) || "Untitled step",
      body: s.body.trim().slice(0, 4000),
      trophyId: s.trophyId && valid.has(s.trophyId) ? s.trophyId : null,
      videoYoutubeId: youtubeId(s.video ?? ""),
    }));
}

/** The guide this member may edit, or null. Staff can edit anyone's. */
async function editable(id: string, user: { id: string; role: string }) {
  const g = await prisma.guide.findUnique({ where: { id }, select: { id: true, slug: true, authorId: true, status: true, gameId: true } });
  return g && (g.authorId === user.id || isStaff(user)) ? g : null;
}

/**
 * Saves a draft as it is, however unfinished. The first save creates it (it
 * needs a game); later saves update it. Published guides aren't changed by
 * autosave: their edits go through publishGuide.
 */
export async function saveGuideDraft(input: GuideInput): Promise<SaveResult> {
  const user = await requireUser("/guides/new");
  const blocked = verifyFirst(user);
  if (blocked) return { ok: false, error: blocked };
  if (!(await rateLimit("guide-draft", 120, 60 * 60_000, user.id))) return { ok: false, error: "Saving a lot just now. Wait a minute." };
  if (!input.gameId) return { ok: false, error: "Pick a game to start saving." };
  if (hasHateSpeech(...allText(input))) return { ok: false, error: HATE_MESSAGE };
  const game = await prisma.game.findUnique({ where: { id: input.gameId }, select: { id: true } });
  if (!game) return { ok: false, error: "That game doesn't exist." };

  const data = {
    gameId: game.id,
    title: input.title.trim().slice(0, 120) || "Untitled guide",
    summary: input.summary.trim().slice(0, 600),
    difficulty: clamp(input.difficulty, 1, 10, 5),
    hoursEstimate: clamp(input.hoursEstimate, 1, 2000, 20),
    playthroughs: clamp(input.playthroughs, 1, 20, 1),
    onlineRequired: !!input.onlineRequired,
    videoYoutubeId: youtubeId(input.video ?? ""),
    missableCount: input.steps.filter((s) => s.kind === "MISSABLE").length,
  };
  const steps = await stepRows(game.id, input.steps, false);

  if (input.id) {
    const g = await editable(input.id, user);
    if (!g) return { ok: false, error: "You can't edit this guide." };
    if (g.status === "PUBLISHED" || g.status === "PENDING") return { ok: false, error: "Published guides save when you press Save changes." };
    const saved = await prisma.$transaction(async (tx) => {
      await tx.guideStep.deleteMany({ where: { guideId: g.id } });
      return tx.guide.update({ where: { id: g.id }, data: { ...data, status: "DRAFT", steps: { create: steps } }, select: { id: true, slug: true, updatedAt: true } });
    });
    return { ok: true, id: saved.id, slug: saved.slug, savedAt: saved.updatedAt.toISOString() };
  }
  const created = await prisma.guide.create({
    data: { ...data, slug: await uniqueSlug(data.title), status: "DRAFT", authorId: user.id, steps: { create: steps } },
    select: { id: true, slug: true, updatedAt: true },
  });
  return { ok: true, id: created.id, slug: created.slug, savedAt: created.updatedAt.toISOString() };
}

/**
 * Publishes the guide (staff and trusted writers) or sends it for review
 * (everyone else). Also how an edited, already published guide is saved.
 */
export async function publishGuide(input: GuideInput): Promise<{ ok: false; error: string } | { ok: true; slug: string; status: string }> {
  const user = await requireUser("/guides/new");
  const blocked = verifyFirst(user);
  if (blocked) return { ok: false, error: blocked };
  if (hasHateSpeech(...allText(input))) return { ok: false, error: HATE_MESSAGE };
  const steps = input.gameId ? await withTrophyNames(input.gameId, input.steps.filter((s) => s.kind === "TROPHY" || s.title.trim() || s.body.trim())) : [];
  const parsed = publishSchema.safeParse({ ...input, steps });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue.path[0] === "steps" && issue.path.length > 1 ? `Step ${Number(issue.path[1]) + 1}: ${issue.message}` : issue.message };
  }
  const g = parsed.data;
  const game = await prisma.game.findUnique({ where: { id: g.gameId }, select: { id: true } });
  if (!game) return { ok: false, error: "Unknown game." };

  const existing = input.id ? await editable(input.id, user) : null;
  if (input.id && !existing) return { ok: false, error: "You can't edit this guide." };
  // Staff and trusted members publish straight away; other guides wait for staff. An edit to a published
  // guide by its trusted author or staff stays published; anyone else's edit goes back for review.
  const publish = isStaff(user) || user.trusted;
  const status = publish ? "PUBLISHED" : "PENDING";
  const data = {
    gameId: game.id,
    title: g.title,
    summary: g.summary,
    difficulty: g.difficulty,
    hoursEstimate: g.hoursEstimate,
    playthroughs: g.playthroughs,
    onlineRequired: !!input.onlineRequired,
    missableCount: g.steps.filter((s) => s.kind === "MISSABLE").length,
    videoYoutubeId: youtubeId(g.video ?? ""),
    status,
    reviewNote: null,
  };
  const rows = await stepRows(game.id, g.steps as GuideStepInput[], true);
  let slug: string;
  if (existing) {
    await prisma.$transaction(async (tx) => {
      await tx.guideStep.deleteMany({ where: { guideId: existing.id } });
      // A guide first published now counts as new, for "Latest guides".
      await tx.guide.update({
        where: { id: existing.id },
        data: { ...data, steps: { create: rows }, ...(existing.status === "DRAFT" || existing.status === "REJECTED" ? { createdAt: new Date() } : {}) },
      });
    });
    slug = existing.slug;
    if (existing.authorId !== user.id) await logStaff(user.id, "guide.edit", { type: "GUIDE", id: existing.id });
  } else {
    slug = await uniqueSlug(g.title);
    await prisma.guide.create({ data: { ...data, slug, authorId: user.id, steps: { create: rows } } });
  }
  await refreshEstimates([game.id, ...(existing && existing.gameId !== game.id ? [existing.gameId] : [])]);
  revalidatePath("/guides");
  revalidatePath(`/guides/${slug}`);
  revalidatePath("/games", "layout");
  revalidatePath("/reports");
  return { ok: true, slug, status };
}

/** Deletes a guide: its author, or staff (logged). Its steps and tips go with it. */
export async function deleteGuide(fd: FormData) {
  const user = await requireUser();
  const g = await editable(String(fd.get("guideId") ?? ""), user);
  if (!g) return;
  await prisma.guide.delete({ where: { id: g.id } });
  if (g.authorId !== user.id) await logStaff(user.id, "guide.delete", { type: "GUIDE", id: g.id });
  await refreshEstimates([g.gameId]);
  revalidatePath("/guides");
  revalidatePath("/games", "layout");
  redirect("/guides?sort=mine&deleted=1");
}
