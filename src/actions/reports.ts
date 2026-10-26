"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isStaff } from "@/lib/forum";
import { plainText } from "@/lib/rich-text";
import { rateLimit } from "@/lib/rate-limit";
import { trophyHref } from "@/lib/trophy-slug";
import { REPORT_REASONS, REPORT_TYPES, type ReportType } from "@/lib/reports";
import type { FormState } from "./auth";

/**
 * Works out where a reported thing lives and copies its text, from the
 * database rather than anything the browser sent. Null if it doesn't exist
 * (or, for a message, if the reporter isn't in that conversation).
 */
async function locate(type: ReportType, id: string, reporterId: string): Promise<{ url: string; excerpt: string | null } | null> {
  switch (type) {
    case "FORUM_POST": {
      const p = await prisma.forumPost.findUnique({ where: { id }, select: { body: true, threadId: true } });
      return p ? { url: `/forums/thread/${p.threadId}#post-${id}`, excerpt: p.body } : null;
    }
    case "POST": {
      const p = await prisma.post.findUnique({ where: { id }, select: { body: true, club: { select: { slug: true } } } });
      return p ? { url: p.club ? `/clubs/${p.club.slug}` : "/community", excerpt: p.body } : null;
    }
    case "SESSION_COMMENT": {
      const c = await prisma.sessionComment.findUnique({ where: { id }, select: { body: true, sessionId: true } });
      return c ? { url: `/sessions/${c.sessionId}#comment-${id}`, excerpt: c.body } : null;
    }
    case "TIP": {
      const t = await prisma.tip.findUnique({
        where: { id },
        select: { body: true, guide: { select: { slug: true } }, trophy: { select: { id: true, slug: true, game: { select: { slug: true } } } } },
      });
      if (!t) return null;
      const url = t.trophy ? (t.trophy.slug ? trophyHref(t.trophy.game.slug, t.trophy.slug) : `/trophies/${t.trophy.id}`) : t.guide ? `/guides/${t.guide.slug}` : "/";
      return { url: `${url}#tips`, excerpt: t.body };
    }
    case "GUIDE": {
      const g = await prisma.guide.findUnique({ where: { id }, select: { slug: true, title: true, summary: true } });
      return g ? { url: `/guides/${g.slug}`, excerpt: `${g.title}: ${g.summary}` } : null;
    }
    case "MESSAGE": {
      const m = await prisma.message.findUnique({ where: { id }, select: { body: true, conversationId: true } });
      if (!m) return null;
      const member = await prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId: m.conversationId, userId: reporterId } },
        select: { userId: true },
      });
      // Staff can't open private conversations, so the report carries the message itself.
      return member ? { url: `/messages/${m.conversationId}`, excerpt: m.body } : null;
    }
    case "USER": {
      const u = await prisma.user.findUnique({ where: { id }, select: { username: true, bio: true } });
      return u ? { url: `/u/${u.username}`, excerpt: u.bio } : null;
    }
    case "CLUB": {
      const c = await prisma.club.findUnique({ where: { id }, select: { slug: true, name: true, description: true } });
      return c ? { url: `/clubs/${c.slug}`, excerpt: `${c.name}: ${c.description}` } : null;
    }
    case "SESSION": {
      const s = await prisma.session.findUnique({ where: { id }, select: { title: true, description: true } });
      return s ? { url: `/sessions/${id}`, excerpt: s.description ? `${s.title}: ${s.description}` : s.title } : null;
    }
  }
}

/** A member flags something for staff. One open report per person per item. */
export async function reportContent(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireUser();
  if (!(await rateLimit("report", 10, 60 * 60_000, me.id))) return { error: "You've sent a lot of reports this hour. Try again later." };
  const type = String(fd.get("targetType") ?? "") as ReportType;
  const targetId = String(fd.get("targetId") ?? "");
  const reason = String(fd.get("reason") ?? "");
  const details = String(fd.get("details") ?? "").trim().slice(0, 1000) || null;
  if (!REPORT_TYPES.includes(type) || !targetId) return { error: "Something went wrong. Reload the page and try again." };
  if (!(reason in REPORT_REASONS)) return { error: "Pick a reason." };
  if (reason === "OTHER" && !details) return { error: "Say a few words about what's wrong." };

  const where = await locate(type, targetId, me.id);
  if (!where) return { error: "That can't be reported (it may have been deleted)." };
  const already = await prisma.report.findFirst({ where: { reporterId: me.id, targetType: type, targetId, status: "OPEN" }, select: { id: true } });
  if (already) return { ok: "You've already reported this. Staff will look at it." };

  await prisma.report.create({
    data: {
      reporterId: me.id,
      targetType: type,
      targetId,
      url: where.url,
      reason,
      details,
      excerpt: where.excerpt ? plainText(where.excerpt).slice(0, 600) : null,
    },
  });
  revalidatePath("/reports");
  return { ok: "Thanks. Staff will take a look." };
}

/** Staff: take the reported thing down, or dismiss the report. Every open report on the same item closes with it. */
export async function resolveReport(fd: FormData) {
  const me = await requireUser("/reports");
  if (!isStaff(me)) return;
  const report = await prisma.report.findUnique({ where: { id: String(fd.get("reportId")) } });
  if (!report || report.status !== "OPEN") return;
  const remove = fd.get("decision") === "remove";

  if (remove) await removeTarget(report.targetType as ReportType, report.targetId);
  await prisma.report.updateMany({
    where: { targetType: report.targetType, targetId: report.targetId, status: "OPEN" },
    data: { status: remove ? "REMOVED" : "DISMISSED", resolvedAt: new Date(), resolvedById: me.id },
  });
  revalidatePath("/reports");
  revalidatePath(report.url.split("#")[0]);
}

/** Deletes reported content. Profiles aren't deleted from here; staff contact the member instead. */
async function removeTarget(type: ReportType, id: string) {
  switch (type) {
    case "FORUM_POST": {
      const post = await prisma.forumPost.findUnique({ where: { id }, include: { thread: true } });
      if (!post) return;
      const first = await prisma.forumPost.findFirst({ where: { threadId: post.threadId }, orderBy: { createdAt: "asc" }, select: { id: true } });
      // The opening post takes its thread with it.
      if (first?.id === post.id) {
        await prisma.forumThread.delete({ where: { id: post.threadId } });
      } else {
        await prisma.$transaction(async (tx) => {
          await tx.forumPost.delete({ where: { id } });
          const newest = await tx.forumPost.findFirst({ where: { threadId: post.threadId }, orderBy: { createdAt: "desc" } });
          await tx.forumThread.update({
            where: { id: post.threadId },
            data: { postCount: { decrement: 1 }, lastPostAt: newest?.createdAt ?? post.thread.createdAt },
          });
        });
      }
      revalidatePath("/forums", "layout");
      return;
    }
    case "POST":
      await prisma.post.deleteMany({ where: { id } });
      revalidatePath("/community");
      return;
    case "SESSION_COMMENT":
      await prisma.sessionComment.deleteMany({ where: { id } });
      return;
    case "TIP":
      await prisma.tip.deleteMany({ where: { id } });
      return;
    case "GUIDE":
      await prisma.guide.deleteMany({ where: { id } });
      revalidatePath("/guides");
      return;
    case "MESSAGE":
      await prisma.message.deleteMany({ where: { id } });
      return;
    case "CLUB":
      await prisma.club.deleteMany({ where: { id } });
      revalidatePath("/clubs");
      return;
    case "SESSION":
      await prisma.session.deleteMany({ where: { id } });
      revalidatePath("/sessions");
      return;
    case "USER":
      return;
  }
}
