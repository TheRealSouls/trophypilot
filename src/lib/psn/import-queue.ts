import { getProfileFromUserName } from "psn-api";
import { prisma } from "../db";
import { getSetting, setSetting } from "../site-settings";
import { recordPlayer, snapshotFromProfile } from "./players";
import { psnAuth, toPsnError, withTimeout } from "./real";

/**
 * PSN players staff add from a list of Online IDs (Staff > Players). The names
 * wait in one SiteSetting row and the players job adds a few dozen per run, one
 * PSN request each. They're stored summary-only: level and trophy totals for the
 * boards, refreshed weekly, without their games list, so thousands of them take
 * a few megabytes instead of hundreds.
 */
const QUEUE_KEY = "psn-import-queue";

/** PSN Online IDs: 3 to 16 letters, digits, hyphens and underscores. */
const ONLINE_ID = /^[A-Za-z][A-Za-z0-9_-]{2,15}$/;

async function readQueue() {
  return ((await getSetting(QUEUE_KEY)) ?? "").split("\n").filter(Boolean);
}

export async function queuedCount() {
  return (await readQueue()).length;
}

/** Adds names to the queue, leaving out bad ones, repeats and players already tracked. */
export async function queuePlayers(text: string, by?: string) {
  const names = text
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const valid = names.filter((n) => ONLINE_ID.test(n));
  const queue = await readQueue();
  const seen = new Set(queue.map((n) => n.toLowerCase()));
  const fresh = valid.filter((n) => !seen.has(n.toLowerCase()) && !!seen.add(n.toLowerCase()));
  // Already tracked (exact name; PSN keeps the capitals people chose).
  const known = new Set<string>();
  for (let i = 0; i < fresh.length; i += 1000) {
    const rows = await prisma.psnPlayer.findMany({ where: { onlineId: { in: fresh.slice(i, i + 1000) } }, select: { onlineId: true } });
    for (const r of rows) known.add(r.onlineId);
  }
  const added = fresh.filter((n) => !known.has(n));
  if (added.length) await setSetting(QUEUE_KEY, [...queue, ...added].join("\n"), by);
  return { added: added.length, invalid: names.length - valid.length, tracked: known.size, queued: queue.length + added.length };
}

/** Adds up to `limit` queued players. Stops early when PSN rate limits or the token is bad. */
export async function workQueue(limit: number, pauseMs = 400) {
  const batch = (await readQueue()).slice(0, limit);
  if (!batch.length) return { added: 0, missing: 0, failed: 0, left: 0, stopped: null };
  const done = new Set<string>();
  let added = 0;
  let missing = 0;
  let failed = 0;
  let stopped: string | null = null;
  for (const name of batch) {
    try {
      const { profile } = await withTimeout(getProfileFromUserName(await psnAuth(), name));
      const known = await prisma.psnPlayer.findUnique({ where: { accountId: profile.accountId }, select: { accountId: true } });
      if (!known) {
        await recordPlayer(snapshotFromProfile(profile));
        await prisma.psnPlayer.update({ where: { accountId: profile.accountId }, data: { summaryOnly: true } });
        added++;
      }
      done.add(name);
    } catch (err) {
      const e = toPsnError(err);
      if (e.kind === "rate_limited" || e.kind === "auth") {
        stopped = e.message;
        break;
      }
      // Renamed or deleted accounts, private ones and odd errors: drop the name rather than retry it forever.
      if (e.kind === "not_found") missing++;
      else failed++;
      done.add(name);
    }
    await new Promise((r) => setTimeout(r, pauseMs));
  }
  // Read again before writing, in case staff added names while this ran.
  const left = (await readQueue()).filter((n) => !done.has(n));
  await setSetting(QUEUE_KEY, left.join("\n"));
  return { added, missing, failed, left: left.length, stopped };
}
