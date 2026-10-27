import { prisma } from "./db";
import { sendNotice } from "./community";
import { SITE } from "./site";

/** How far ahead a session's players are reminded: on the day, within these hours of the start. */
export const REMIND_WITHIN_HOURS = 12;

/**
 * Sends each player in an upcoming session a "your session is today" notice
 * in Messages, once. Players who left aren't members any more and cancelled
 * sessions are deleted, so neither gets one. Runs with the players cron.
 */
export async function sendSessionReminders(now = new Date()) {
  const due = await prisma.sessionMember.findMany({
    where: { remindedAt: null, session: { startsAt: { gt: now, lte: new Date(now.getTime() + REMIND_WITHIN_HOURS * 3_600_000) } } },
    take: 200,
    include: { session: { select: { id: true, title: true, startsAt: true, platform: true, game: { select: { title: true } } } } },
  });
  for (const m of due) {
    const s = m.session;
    const hours = Math.max(1, Math.round((s.startsAt.getTime() - now.getTime()) / 3_600_000));
    // The time is UTC (we don't know each player's zone here); the session page shows it in theirs.
    const at = s.startsAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
    await sendNotice(
      m.userId,
      `**Reminder: your gaming session is today.** ${s.title} (${s.game.title}, ${s.platform}) starts in about ${hours} hour${hours === 1 ? "" : "s"}, at ${at} UTC. [Open the session](${SITE.url}/sessions/${s.id})`,
    );
    await prisma.sessionMember.update({ where: { sessionId_userId: { sessionId: m.sessionId, userId: m.userId } }, data: { remindedAt: now } });
  }
  return { reminded: due.length };
}
