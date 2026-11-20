import { after, NextResponse } from "next/server";
import { cronRefusal } from "@/lib/cron-auth";
import { accountsDueForSync, syncUser } from "@/lib/psn/sync";

/**
 * Background sync: re-syncs linked PSN accounts whose plan says they're due
 * (Free every 7 days, Premium every hour; see src/lib/plans.ts), plus
 * libraries still part-way through their first import.
 *
 * Call from a scheduler with `Authorization: Bearer $CRON_SECRET`, e.g. every
 * 10 minutes. It answers straight away and syncs after the response, so a
 * scheduler with a short timeout (cron-job.org allows 30 seconds) is fine.
 */
export const maxDuration = 300;

// Sequential and capped per account (PSN_SYNC_TITLES_PER_RUN) to stay under PSN's rate limits.
const BATCH = Math.max(1, Number(process.env.PSN_SYNC_PER_RUN) || 10);

export async function GET(req: Request) {
  const refused = cronRefusal(req);
  if (refused) return refused;

  const due = await accountsDueForSync(BATCH);

  after(async () => {
    // Sequential on purpose: PSN rate-limits aggressively.
    for (const a of due) {
      try {
        const job = await syncUser(a.userId, { trigger: "AUTO" });
        console.log(`[cron/sync] ${a.onlineId}: ${job.gamesSynced} lists, +${job.trophiesSynced} trophies, ${job.remaining} left`);
      } catch (e) {
        console.error(`[cron/sync] ${a.onlineId}:`, e instanceof Error ? e.message : e);
      }
    }
  });
  return NextResponse.json({ queued: due.map((a) => a.onlineId) });
}
