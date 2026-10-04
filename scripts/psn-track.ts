/**
 * Adds PSN players to the leaderboards (or refreshes them): their totals, 50
 * most recent games and the dates of their newest platinums. About 3 to 7
 * PSN requests per player.
 *
 *   npm run psn:track -- GamingWithFlacy SomeOtherHunter
 *   npm run psn:track -- --file hunters.txt        (one Online ID per line)
 *   npm run psn:track -- --hide SomeOnlineId       (removal request: keep them off the site)
 *   npm run psn:track -- --unhide SomeOnlineId
 */
import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/db";
import { refreshPlayer } from "../src/lib/psn/players";
import { toPsnError } from "../src/lib/psn/real";
import { countryName } from "../src/lib/countries";

try {
  process.loadEnvFile(".env");
} catch {
  // No .env file; rely on the real environment.
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = process.argv.slice(2);
  const hide = args.includes("--hide");
  const unhide = args.includes("--unhide");
  const fileIdx = args.indexOf("--file");
  const ids = [
    ...args.filter((a, i) => !a.startsWith("--") && !(fileIdx >= 0 && i === fileIdx + 1)),
    ...(fileIdx >= 0 ? readFileSync(args[fileIdx + 1], "utf8").split(/\r?\n/) : []),
  ]
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) throw new Error("Pass at least one PSN Online ID (or --file path).");
  if (!process.env.PSN_NPSSO?.trim()) throw new Error("PSN_NPSSO is empty. Run npm run psn:check first.");

  for (const id of ids) {
    try {
      const r = await refreshPlayer(id);
      if (!r) {
        console.warn(`skip ${id}: not found on PSN`);
        continue;
      }
      if (hide || unhide) await prisma.psnPlayer.update({ where: { accountId: r.player.accountId }, data: { hidden: hide } });
      const p = r.player;
      console.log(
        `${p.onlineId}: ${p.trophiesPrivate ? "trophies private, not ranked" : `level ${p.trophyLevel}, ${p.platinum} platinums, ${r.titles} games, ${r.platinumsDated} platinum dates, ultra rares counted in ${r.ultraRaresCounted} lists`}, ${countryName(p.country) || "unknown country"}${hide ? " (hidden)" : unhide ? " (visible)" : ""}`,
      );
    } catch (err) {
      const e = toPsnError(err);
      console.warn(`skip ${id}: ${e.message}`);
      if (e.kind === "auth" || e.kind === "rate_limited") break;
    }
    if (ids.length > 1) await sleep(500);
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
