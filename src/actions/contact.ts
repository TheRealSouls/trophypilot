"use server";

import { createHmac } from "node:crypto";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { clientIp } from "@/lib/rate-limit";

const DAY_MS = 24 * 3600_000;

/** A keyed hash of the IP, so the address itself is never stored. */
function ipKey(ip: string) {
  const secret = process.env.SESSION_SECRET ?? "trophypilot";
  return `ip:${createHmac("sha256", secret).update(ip).digest("hex").slice(0, 32)}`;
}

/**
 * One contact message a day per IP address and per signed-in member. Called
 * just before the form goes to Formspree: it claims today's slot, or says when
 * the next one opens. If the send then fails, releaseContactSlot gives it back.
 */
export async function claimContactSlot(): Promise<{ ok: true; ids: string[] } | { ok: false; error: string }> {
  const keys = [ipKey(await clientIp())];
  const userId = await getSessionUserId();
  if (userId) keys.push(`user:${userId}`);

  const since = new Date(Date.now() - DAY_MS);
  const last = await prisma.contactSend.findFirst({
    where: { key: { in: keys }, createdAt: { gt: since } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (last) {
    const hours = Math.max(1, Math.ceil((last.createdAt.getTime() + DAY_MS - Date.now()) / 3600_000));
    return {
      ok: false,
      error: `You've already sent a message today. You can send another in about ${hours} hour${hours === 1 ? "" : "s"}. We'll reply to the one you sent.`,
    };
  }

  // Tidy up as we go: nothing older than two days is needed.
  await prisma.contactSend.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 2 * DAY_MS) } } });
  const rows = await prisma.$transaction(keys.map((key) => prisma.contactSend.create({ data: { key }, select: { id: true } })));
  return { ok: true, ids: rows.map((r) => r.id) };
}

/** The message didn't go through (validation, captcha or network), so the slot is given back. */
export async function releaseContactSlot(ids: string[]) {
  if (!Array.isArray(ids) || ids.length > 2) return;
  await prisma.contactSend.deleteMany({ where: { id: { in: ids.map(String) }, createdAt: { gt: new Date(Date.now() - 3600_000) } } });
}
