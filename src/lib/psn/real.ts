import {
  exchangeAccessCodeForAuthTokens,
  exchangeNpssoForAccessCode,
  exchangeRefreshTokenForAuthTokens,
  getProfileFromUserName,
  getTitleTrophies,
  getTitleTrophyGroups,
  getUserTitles,
  getUserTrophiesEarnedForTitle,
  type AuthTokensResponse,
} from "psn-api";
import { prisma } from "../db";
import type { TrophyType } from "../trophies";
import { countryFromNpId } from "./npid";
import type { PsnTitle, TrophyProvider } from "./types";

/**
 * Talks to the real PlayStation Network through a service account's NPSSO
 * token. Sony has no public OAuth for third parties, so users *link* their
 * PSN ID (verified via a code in their About Me) and we read their public
 * trophy data with this account.
 */

export type PsnErrorKind = "auth" | "not_found" | "private" | "rate_limited" | "unknown";

export class PsnError extends Error {
  constructor(
    readonly kind: PsnErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "PsnError";
  }
}

/** psn-api throws plain Errors whose message is either text or a JSON error body. */
export function toPsnError(err: unknown): PsnError {
  if (err instanceof PsnError) return err;
  const raw = err instanceof Error ? err.message : String(err);
  const text = raw.toLowerCase();
  if (/npsso|access code|invalid_grant|unauthori[sz]ed|invalid token|expired/.test(text))
    return new PsnError("auth", "The PSN service token is invalid or expired. Generate a new PSN_NPSSO.");
  if (/not found|2105356|resource not found/.test(text)) return new PsnError("not_found", "PSN profile not found.");
  if (/access control|not permitted|forbidden|private|2240526/.test(text))
    return new PsnError("private", "This player's trophies are private on PSN.");
  if (/too many requests|rate.?limit|\b429\b/.test(text)) return new PsnError("rate_limited", "PSN is rate limiting requests. Try again shortly.");
  return new PsnError("unknown", raw.trim().slice(0, 300) || "Unexpected PSN error.");
}

/** psn-api has no request timeout, so a stalled Sony endpoint would hang the page. */
export function withTimeout<T>(p: Promise<T>, ms = 15_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new PsnError("unknown", "PlayStation Network took too long to respond.")), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

type TokenState = { accessToken: string; refreshToken: string; expiresAt: number; refreshExpiresAt: number };
let state: TokenState | null = null;
let inflight: Promise<{ accessToken: string }> | null = null;

const npsso = () => process.env.PSN_NPSSO?.trim() ?? "";
const npssoPrefix = () => npsso().slice(0, 8);

/** The session other processes (scripts, cron, a restarted server) already opened, if it still fits this NPSSO. */
async function loadSaved(): Promise<TokenState | null> {
  const row = await prisma.psnAuthState.findUnique({ where: { id: "service" } }).catch(() => null);
  if (!row || row.npssoPrefix !== npssoPrefix()) return null;
  return {
    accessToken: row.accessToken,
    refreshToken: row.refreshToken,
    expiresAt: row.expiresAt.getTime(),
    refreshExpiresAt: row.refreshExpiresAt.getTime(),
  };
}

async function save(tokens: AuthTokensResponse, now: number) {
  state = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: now + tokens.expiresIn * 1000,
    refreshExpiresAt: now + tokens.refreshTokenExpiresIn * 1000,
  };
  const data = {
    npssoPrefix: npssoPrefix(),
    accessToken: state.accessToken,
    refreshToken: state.refreshToken,
    expiresAt: new Date(state.expiresAt),
    refreshExpiresAt: new Date(state.refreshExpiresAt),
  };
  await prisma.psnAuthState.upsert({ where: { id: "service" }, create: { id: "service", ...data }, update: data }).catch(() => {});
}

/**
 * Order of preference: a live access token, then the refresh token, and only
 * then a fresh NPSSO sign-in. Signing in with the NPSSO on every process start
 * gets the NPSSO revoked by Sony, so the session is shared through the database.
 */
async function refreshTokens(): Promise<{ accessToken: string }> {
  const now = Date.now();
  state ??= await loadSaved();
  if (state && now < state.expiresAt - 60_000) return { accessToken: state.accessToken };

  if (state && now < state.refreshExpiresAt - 60_000) {
    try {
      await save(await withTimeout(exchangeRefreshTokenForAuthTokens(state.refreshToken)), now);
      return { accessToken: state!.accessToken };
    } catch {
      // Refresh token rejected; fall through to a full sign-in.
    }
  }

  try {
    if (!npsso()) throw new PsnError("auth", "PSN_NPSSO is not configured.");
    await save(await withTimeout(exchangeNpssoForAccessCode(npsso()).then(exchangeAccessCodeForAuthTokens)), now);
    return { accessToken: state!.accessToken };
  } catch (err) {
    state = null;
    const e = toPsnError(err);
    throw e.kind === "unknown" ? new PsnError("auth", `PSN sign-in failed: ${e.message}`) : e;
  }
}

/** Returns a valid access token, sharing one refresh between concurrent callers. */
export async function psnAuth(): Promise<{ accessToken: string }> {
  if (state && Date.now() < state.expiresAt - 60_000) return { accessToken: state.accessToken };
  inflight ??= refreshTokens().finally(() => {
    inflight = null;
  });
  return inflight;
}

const PAGE = 800;

/** Bronze + silver + gold + platinum. */
export const sumCounts = (c?: { bronze?: number; silver?: number; gold?: number; platinum?: number }) =>
  c ? (c.bronze ?? 0) + (c.silver ?? 0) + (c.gold ?? 0) + (c.platinum ?? 0) : undefined;

export class RealPsnProvider implements TrophyProvider {
  readonly name = "psn" as const;

  async getProfile(onlineId: string) {
    try {
      const { profile } = await withTimeout(getProfileFromUserName(await psnAuth(), onlineId));
      const avatar = profile.avatarUrls?.find((a) => a.size === "l") ?? profile.avatarUrls?.at(-1);
      return {
        onlineId: profile.onlineId,
        accountId: profile.accountId,
        avatarUrl: avatar?.avatarUrl ?? null,
        aboutMe: profile.aboutMe ?? "",
        trophyLevel: profile.trophySummary?.level ?? 0,
        levelProgress: profile.trophySummary?.progress ?? 0,
        country: countryFromNpId(profile.npId),
        isPlus: profile.plus === 1,
        earned: profile.trophySummary?.earnedTrophies,
      };
    } catch (err) {
      const e = toPsnError(err);
      if (e.kind === "not_found") return null;
      throw e;
    }
  }

  /**
   * PSN returns trophy lists newest-first (by last update). With `since`, paging
   * stops at the first page that reaches lists last updated at or before it,
   * so a routine sync of a 20,000-game library is one request instead of 27.
   * Without it, every page is fetched, several at a time.
   */
  async getTitles(accountId: string, { since }: { since?: Date } = {}): Promise<PsnTitle[]> {
    const page = async (offset: number): Promise<{ total: number; titles: PsnTitle[] }> => {
      const res = await withTimeout(getUserTitles(await psnAuth(), accountId, { limit: PAGE, offset })).catch((e) => {
        throw toPsnError(e);
      });
      return {
        total: res.totalItemCount,
        titles: res.trophyTitles.map((t) => ({
          npCommunicationId: t.npCommunicationId,
          npServiceName: t.npServiceName,
          title: t.trophyTitleName,
          iconUrl: t.trophyTitleIconUrl ?? null,
          platforms: String(t.trophyTitlePlatform).split(","),
          lastUpdated: new Date(t.lastUpdatedDateTime),
          definedTrophies: sumCounts(t.definedTrophies),
        })),
      };
    };

    const first = await page(0);
    const out: PsnTitle[] = [...first.titles];
    const offsets: number[] = [];
    for (let o = PAGE; o < first.total; o += PAGE) offsets.push(o);

    if (since) {
      for (const o of offsets) {
        if (!out.length || out[out.length - 1].lastUpdated <= since) break;
        out.push(...(await page(o)).titles);
      }
      return out;
    }

    // Four pages at a time, kept in order.
    const pages: PsnTitle[][] = [];
    for (let i = 0; i < offsets.length; i += 4) {
      pages.push(...(await Promise.all(offsets.slice(i, i + 4).map(async (o) => (await page(o)).titles))));
    }
    return out.concat(...pages);
  }

  async getTitleDefinition(title: PsnTitle) {
    const a = await psnAuth();
    const opts = title.npServiceName === "trophy" ? { npServiceName: "trophy" as const } : {};
    const [groups, trophies] = await withTimeout(
      Promise.all([
        getTitleTrophyGroups(a, title.npCommunicationId, opts),
        getTitleTrophies(a, title.npCommunicationId, "all", opts),
      ]),
    ).catch((e) => {
      throw toPsnError(e);
    });
    return {
      groups: groups.trophyGroups.map((g) => ({ psnGroupId: g.trophyGroupId, name: g.trophyGroupName, iconUrl: g.trophyGroupIconUrl ?? null })),
      trophies: trophies.trophies.map((t) => ({
        psnTrophyId: t.trophyId,
        psnGroupId: t.trophyGroupId ?? "default",
        name: t.trophyName ?? "Hidden trophy",
        description: t.trophyDetail ?? "",
        type: t.trophyType.toUpperCase() as TrophyType,
        hidden: !!t.trophyHidden,
        iconUrl: t.trophyIconUrl ?? null,
      })),
    };
  }

  async getTitleEarned(accountId: string, title: PsnTitle) {
    const opts = title.npServiceName === "trophy" ? { npServiceName: "trophy" as const } : {};
    const res = await withTimeout(
      getUserTrophiesEarnedForTitle(await psnAuth(), accountId, title.npCommunicationId, "all", opts),
    ).catch((e) => {
      throw toPsnError(e);
    });
    return res.trophies.map((t) => ({
      psnTrophyId: t.trophyId,
      earnedAt: t.earned && t.earnedDateTime ? new Date(t.earnedDateTime) : null,
      earnedRate: t.trophyEarnedRate ? Number(t.trophyEarnedRate) : null,
    }));
  }
}
