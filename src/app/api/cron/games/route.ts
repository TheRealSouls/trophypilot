import { NextResponse } from "next/server";
import { enrichPending, igdbEnabled } from "@/lib/igdb";
import { bust } from "@/lib/cache";
import { refreshGamePopularity, warmGamesList } from "@/lib/games-list";

/**
 * Fills in release dates, descriptions, genres, screenshots and trailers from
 * IGDB for games that haven't been looked up yet, most played first. Game
 * pages also do this on their first visit; this catches the rest.
 *
 * Call with `Authorization: Bearer $CRON_SECRET`, e.g. every 30 minutes.
 * Each game costs one IGDB request (4 a second allowed). It also refreshes
 * the "Most played" counts and pre-loads the first games list pages.
 */
export const maxDuration = 300;

const PER_RUN = Math.max(1, Number(process.env.IGDB_GAMES_PER_RUN) || 100);

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // "Most played" counts, then the common games list pages, so they're ready before anyone asks.
  const popularity = await refreshGamePopularity().catch((err) => ({ error: String(err) }));
  const igdb = igdbEnabled() ? await enrichPending(PER_RUN) : { skipped: "IGDB_CLIENT_ID and IGDB_CLIENT_SECRET are not set" };
  bust("games");
  await warmGamesList().catch((err) => console.error("[games] warm failed", err));
  return NextResponse.json({ igdb, popularityUpdated: popularity });
}
