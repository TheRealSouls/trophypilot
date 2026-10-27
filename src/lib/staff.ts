import { prisma } from "./db";

/**
 * The staff audit trail: who did what to which thing. Every staff action
 * records a line (shown on the staff dashboard), so decisions can be checked
 * later. Failures to log never block the action itself.
 */
export async function logStaff(actorId: string, action: string, target?: { type: string; id: string } | null, detail?: string | null) {
  await prisma.staffAction
    .create({ data: { actorId, action, targetType: target?.type ?? null, targetId: target?.id ?? null, detail: detail?.slice(0, 500) ?? null } })
    .catch((err) => console.error("[staff] couldn't log", action, err));
}

/** How audit lines read on the dashboard. */
export const ACTION_NAMES: Record<string, string> = {
  "report.remove": "Removed reported content",
  "report.dismiss": "Dismissed a report",
  "guide.approve": "Approved a guide",
  "guide.reject": "Sent a guide back",
  "guide.trust": "Changed guide trust",
  "user.warn": "Warned a member",
  "user.suspend": "Suspended a member",
  "user.unsuspend": "Lifted a suspension",
  "user.delete": "Deleted an account",
  "role.set": "Changed a role",
  "rules.edit": "Edited the forum rules",
  "online.approve": "Approved an online flag",
  "online.reject": "Rejected an online flag",
  "online.set": "Set a trophy's online status",
  "game.obtainable": "Changed obtainability",
  "game.hours": "Set the time to platinum",
  "club.delete": "Deleted a club",
  "thread.moderate": "Moderated a thread",
};
