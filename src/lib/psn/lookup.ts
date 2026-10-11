import { unstable_cache } from "next/cache";
import { getProfileFromUserName, getUserTitles, makeUniversalSearch } from "psn-api";
import { countryFromNpId, markTrophiesPrivate, recordPlayerQuietly } from "./players";
import { psnAuth, PsnError, toPsnError, withTimeout } from "./real";
import type { PsnTitle } from "./types";

/**
 * Read-only lookups of *any* public PSN profile, for players who haven't
 * joined yet. Results are cached so a popular profile costs one call to Sony
 * every few minutes, not one per page view. Cached values go through JSON,
 * so dates are ISO strings here.
 */

export const PSN_ONLINE_ID = /^[A-Za-z][A-Za-z0-9_-]{2,15}$/;

export type PsnPlayer = {
  onlineId: string;
  accountId: string;
  avatarUrl: string | null;
  isPlus: boolean;
};

export type PsnPublicProfile = PsnPlayer & {
  country: string | null;
  aboutMe: string;
  verified: boolean;
  trophyLevel: number;
  levelProgress: number;
  earned: { platinum: number; gold: number; silver: number; bronze: number };
};

export type PsnTitleSummary = {
  npCommunicationId: string;
  npServiceName: "trophy" | "trophy2";
  title: string;
  iconUrl: string | null;
  platforms: string[];
  progress: number;
  earned: { platinum: number; gold: number; silver: number; bronze: number };
  defined: { platinum: number; gold: number; silver: number; bronze: number };
  lastUpdated: string;
};

type Result<T> = { ok: true; data: T } | { ok: false; kind: PsnError["kind"]; message: string };

async function settle<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    const e = toPsnError(err);
    if (e.kind === "auth" || e.kind === "unknown") console.error("[psn]", e.kind, e.message);
    return { ok: false, kind: e.kind, message: e.message };
  }
}

const PROFILE_TTL = 15 * 60;
const SEARCH_TTL = 10 * 60;

// The cached loaders throw on transient failures (auth, rate limits, outages)
// so those aren't cached; only real answers are.
const loadProfile = unstable_cache(
  async (onlineId: string): Promise<PsnPublicProfile | null> => {
    try {
      const { profile } = await withTimeout(getProfileFromUserName(await psnAuth(), onlineId));
      const avatar = profile.avatarUrls?.find((a) => a.size === "l") ?? profile.avatarUrls?.at(-1);
      const e = profile.trophySummary?.earnedTrophies;
      const result: PsnPublicProfile = {
        onlineId: profile.onlineId,
        accountId: profile.accountId,
        avatarUrl: avatar?.avatarUrl ?? null,
        country: countryFromNpId(profile.npId),
        isPlus: profile.plus === 1,
        verified: !!profile.isOfficiallyVerified,
        aboutMe: profile.aboutMe ?? "",
        // No summary means the player's trophies are private.
        trophyLevel: profile.trophySummary?.level ?? 0,
        levelProgress: profile.trophySummary?.progress ?? 0,
        earned: { platinum: e?.platinum ?? 0, gold: e?.gold ?? 0, silver: e?.silver ?? 0, bronze: e?.bronze ?? 0 },
      };
      // Every profile we fetch feeds the leaderboards (once per cache miss), without making the visitor wait for it.
      void recordPlayerQuietly(result);
      return result;
    } catch (err) {
      if (toPsnError(err).kind === "not_found") return null;
      throw toPsnError(err);
    }
  },
  ["psn-profile-v2"],
  { revalidate: PROFILE_TTL, tags: ["psn"] },
);

/** `ok: true, data: null` means PSN says the ID doesn't exist. */
export const getPsnProfile = (onlineId: string) => settle(() => loadProfile(onlineId));

const loadTitles = unstable_cache(
  async (accountId: string, limit: number, offset: number): Promise<{ titles: PsnTitleSummary[]; total: number } | "private"> => {
    let res;
    try {
      res = await withTimeout(getUserTitles(await psnAuth(), accountId, { limit, offset }));
    } catch (err) {
      const e = toPsnError(err);
      if (e.kind === "private") {
        void markTrophiesPrivate(accountId, true);
        return "private";
      }
      throw e;
    }
    void markTrophiesPrivate(accountId, false);
    const titles = res.trophyTitles.map((t) => ({
      npCommunicationId: t.npCommunicationId,
      npServiceName: t.npServiceName,
      title: t.trophyTitleName,
      iconUrl: t.trophyTitleIconUrl ?? null,
      platforms: String(t.trophyTitlePlatform).split(","),
      progress: t.progress ?? 0,
      earned: { ...t.earnedTrophies },
      defined: { ...t.definedTrophies },
      lastUpdated: t.lastUpdatedDateTime,
    }));
    return { titles, total: res.totalItemCount ?? titles.length };
  },
  ["psn-titles-v2"],
  { revalidate: PROFILE_TTL, tags: ["psn"] },
);

/** One page of titles, most recently played first (as PSN orders them), plus the player's total. */
export const getPsnTitles = (
  accountId: string,
  { limit = 200, offset = 0 } = {},
): Promise<Result<{ titles: PsnTitleSummary[]; total: number }>> =>
  settle(async () => {
    const r = await loadTitles(accountId, limit, offset);
    if (r === "private") throw new PsnError("private", "This player's trophies are private on PSN.");
    return r;
  });

/**
 * Finds PSN players by Online ID. Runs Sony's player search and an exact
 * lookup side by side, because the search endpoint sometimes misses exact
 * matches (and sometimes fails outright).
 */
const loadSearch = unstable_cache(
  async (term: string): Promise<PsnPlayer[]> => {
    const [exact, search] = await Promise.all([
      PSN_ONLINE_ID.test(term) ? getPsnProfile(term) : Promise.resolve({ ok: true as const, data: null }),
      settle(async () => {
        const res = await withTimeout(makeUniversalSearch(await psnAuth(), term, "SocialAllAccounts"), 8_000);
        return (res.domainResponses?.[0]?.results ?? []).map((r): PsnPlayer => ({
          onlineId: r.socialMetadata.onlineId,
          accountId: r.socialMetadata.accountId,
          avatarUrl: r.socialMetadata.avatarUrl || null,
          isPlus: !!r.socialMetadata.isPsPlus,
        }));
      }),
    ]);
    const players: PsnPlayer[] = [];
    if (exact.ok && exact.data) {
      const { onlineId, accountId, avatarUrl, isPlus } = exact.data;
      players.push({ onlineId, accountId, avatarUrl, isPlus });
    }
    if (search.ok) for (const p of search.data) if (!players.some((x) => x.accountId === p.accountId)) players.push(p);
    // Nothing found and a call failed: don't cache an empty answer.
    if (players.length === 0 && (!search.ok || !exact.ok)) {
      const failed = !exact.ok ? exact : !search.ok ? search : null;
      if (failed && !failed.ok) throw new PsnError(failed.kind, failed.message);
    }
    return players.slice(0, 12);
  },
  ["psn-search-v1"],
  { revalidate: SEARCH_TTL, tags: ["psn"] },
);

export const searchPsnPlayers = (term: string) => settle(() => loadSearch(term.trim()));

export function summaryAsTitle(t: PsnTitleSummary): PsnTitle {
  return {
    npCommunicationId: t.npCommunicationId,
    npServiceName: t.npServiceName,
    title: t.title,
    iconUrl: t.iconUrl,
    platforms: t.platforms,
    lastUpdated: new Date(t.lastUpdated),
  };
}
