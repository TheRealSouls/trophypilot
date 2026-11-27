/**
 * Checks a member's unlock times on one trophy list for signs they were
 * edited (timestamp modding) or the list was hacked. Nothing here decides
 * anything: staff look at the flags and the times, then void the list or not.
 */

export type Unlock = { id: string; name: string; type: string; earnedAt: Date; isDlc: boolean };
export type TimestampFlag = { kind: "burst" | "early" | "future" | "platinum-order" | "fast"; text: string; ids: string[] };

/** Trophies popping within this many seconds of each other count as one burst. */
const BURST_SECONDS = 2;
/** This many or more in one burst is worth a look (the platinum pops with the last trophy, so it isn't counted). */
const BURST_MIN = 4;

export function checkTimestamps(unlocks: Unlock[], release: Date | null, now = new Date()): TimestampFlag[] {
  const list = [...unlocks].sort((a, b) => a.earnedAt.getTime() - b.earnedAt.getTime());
  const flags: TimestampFlag[] = [];

  // Many trophies in the same couple of seconds: normal for some games (a cutscene unlocking a chapter's
  // trophies), suspicious across unrelated trophies.
  let run: Unlock[] = [];
  const closeRun = () => {
    const counted = run.filter((u) => u.type !== "PLATINUM");
    if (counted.length >= BURST_MIN) {
      flags.push({
        kind: "burst",
        text: `${counted.length} trophies unlocked within ${BURST_SECONDS} seconds of each other (${fmt(run[0].earnedAt)}).`,
        ids: run.map((u) => u.id),
      });
    }
    run = [];
  };
  for (const u of list) {
    if (run.length && u.earnedAt.getTime() - run[run.length - 1].earnedAt.getTime() > BURST_SECONDS * 1000) closeRun();
    run.push(u);
  }
  closeRun();

  // Earned before the game came out (a day's grace for time zones and early access).
  if (release) {
    const early = list.filter((u) => u.earnedAt.getTime() < release.getTime() - 86_400_000);
    if (early.length) flags.push({ kind: "early", text: `${early.length} earned before the game's release on ${fmt(release, false)}.`, ids: early.map((u) => u.id) });
  }

  const future = list.filter((u) => u.earnedAt.getTime() > now.getTime() + 3_600_000);
  if (future.length) flags.push({ kind: "future", text: `${future.length} dated in the future.`, ids: future.map((u) => u.id) });

  // The platinum unlocks with the last base-game trophy: base-game trophies after it mean edited times.
  const plat = list.find((u) => u.type === "PLATINUM");
  if (plat) {
    const after = list.filter((u) => !u.isDlc && u.type !== "PLATINUM" && u.earnedAt.getTime() > plat.earnedAt.getTime() + 60_000);
    if (after.length) flags.push({ kind: "platinum-order", text: `${after.length} base-game trophies earned after the platinum.`, ids: after.map((u) => u.id) });
  }

  // A whole list of real size done impossibly quickly.
  if (list.length >= 15) {
    const span = list[list.length - 1].earnedAt.getTime() - list[0].earnedAt.getTime();
    if (span < 10 * 60_000) flags.push({ kind: "fast", text: `All ${list.length} trophies earned within ${Math.max(1, Math.round(span / 60_000))} minutes.`, ids: [] });
  }
  return flags;
}

const fmt = (d: Date, time = true) =>
  d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", ...(time ? { hour: "2-digit", minute: "2-digit", second: "2-digit" } : {}), timeZone: "UTC" }) + (time ? " UTC" : "");
