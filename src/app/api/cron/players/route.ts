import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { discoverPlayers, refreshPlayer } from "@/lib/psn/players";
import { toPsnError } from "@/lib/psn/real";
import { getProvider, isDemoMode } from "@/lib/psn/sync";
import { keepListsFresh } from "@/lib/psn/catalogue";
import { cleanUpIdleClubs } from "@/lib/idle-clubs";
import { sendSessionReminders } from "@/lib/session-reminders";

/**
 * Keeps tracked PSN players fresh: re-reads the stalest few (level, totals,
 * recent games, new platinums), which feeds the weekly/monthly boards and the
 * home page. With PSN_DISCOVERY=on it also adds new players found through the
 * public friends lists of the best-ranked ones.
 *
 * Call with `Authorization: Bearer $CRON_SECRET`, e.g. every 10 minutes. Each refresh
 * also reads the full games list (games played, average completion) and counts
 * ultra rares in up to 40 more lists (see countUltraRares). Only the newest
 * 300 lists per player are kept as rows (KEEP_TITLES).
 * Each run costs up to about 50 PSN requests per refreshed player (2 to 3
 * for the profile and games list, up to 5 platinum dates, up to 40 lists) and 2 per
 * discovered one. It also loads the trophy lists of the newest games and
 * lists that gained DLC (PSN_NEW_LISTS_PER_RUN, PSN_GROWN_LISTS_PER_RUN).
 */
export const maxDuration = 300;

const REFRESH_PER_RUN = Math.max(1, Number(process.env.PSN_REFRESH_PER_RUN) || 10);
const DISCOVER_PER_RUN = Math.max(0, Number(process.env.PSN_DISCOVER_PER_RUN) || 20);

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Clubs nobody has used for a while: warn their owners, then delete (src/lib/idle-clubs.ts). Not PSN, so demo mode too.
  const clubs = await cleanUpIdleClubs().catch((err) => ({ error: String(err) }));
  // "Your session is today" notices for the players of sessions starting soon.
  const reminders = await sendSessionReminders().catch((err) => ({ error: String(err) }));
  if (isDemoMode()) return NextResponse.json({ skipped: "demo mode", clubs, reminders });

  // Players with no completion or ultra rare figures yet come first (country boards rank by them), then the stalest.
  const missing = await prisma.psnPlayer.findMany({
    where: {
      hidden: false,
      trophiesPrivate: false,
      OR: [{ avgCompletion: null }, { ultraRare: null }],
      // Not ones done in the last few hours: a player with no games keeps empty figures and mustn't hog every run.
      AND: [{ OR: [{ titlesRefreshedAt: null }, { titlesRefreshedAt: { lt: new Date(Date.now() - 6 * 3_600_000) } }] }],
    },
    orderBy: { points: "desc" },
    take: REFRESH_PER_RUN,
    select: { onlineId: true },
  });
  const stale = [
    ...missing,
    ...(missing.length < REFRESH_PER_RUN
      ? await prisma.psnPlayer.findMany({
          where: { hidden: false, onlineId: { notIn: missing.map((p) => p.onlineId) } },
          orderBy: [{ titlesRefreshedAt: { sort: "asc", nulls: "first" } }, { points: "desc" }],
          take: REFRESH_PER_RUN - missing.length,
          select: { onlineId: true },
        })
      : []),
  ];

  const refreshed = [];
  for (const p of stale) {
    try {
      const r = await refreshPlayer(p.onlineId);
      refreshed.push({ onlineId: p.onlineId, ok: !!r, titles: r?.titles ?? 0, platinumsDated: r?.platinumsDated ?? 0 });
    } catch (err) {
      const e = toPsnError(err);
      refreshed.push({ onlineId: p.onlineId, ok: false, error: e.message });
      // Stop early rather than hammer PSN while it's limiting us or the token is bad.
      if (e.kind === "rate_limited" || e.kind === "auth") break;
    }
  }

  const discovery =
    process.env.PSN_DISCOVERY === "on" && DISCOVER_PER_RUN > 0
      ? await discoverPlayers({ maxNew: DISCOVER_PER_RUN }).catch((err) => ({ error: toPsnError(err).message }))
      : "off";

  // New games and new DLC for the home page.
  const lists = await keepListsFresh(getProvider(), {
    newest: Math.max(0, Number(process.env.PSN_NEW_LISTS_PER_RUN) || 5),
    grown: Math.max(0, Number(process.env.PSN_GROWN_LISTS_PER_RUN) || 5),
  }).catch((err) => ({ error: toPsnError(err).message }));

  return NextResponse.json({ refreshed, discovery, lists, clubs, reminders });
}
