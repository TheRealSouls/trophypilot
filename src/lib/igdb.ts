import { prisma } from "./db";
import { cleanTitle, titleKey } from "./utils";

/**
 * Release dates, descriptions, genres, companies, screenshots and trailers
 * from IGDB (igdb.com, owned by Twitch). PSN only knows trophy data, so this
 * fills in the rest of a game page.
 *
 * Needs a free Twitch developer app: IGDB_CLIENT_ID and IGDB_CLIENT_SECRET.
 * IGDB allows 4 requests a second; calls here are spaced to stay under that.
 */

const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const API_URL = "https://api.igdb.com/v4";
const IMAGE_URL = "https://images.igdb.com/igdb/image/upload";
const TIMEOUT_MS = 10_000;

// IGDB platform ids for consoles that have PSN trophy lists.
const PLATFORM_IDS: Record<string, number> = { PS3: 9, PSVITA: 46, PS4: 48, PSVR: 165, PS5: 167, PSVR2: 390 };
const PLAYSTATION = Object.values(PLATFORM_IDS);

const GENRE_NAMES: Record<string, string> = {
  "Role-playing (RPG)": "RPG",
  "Hack and slash/Beat 'em up": "Hack and slash",
  "Real Time Strategy (RTS)": "Strategy",
  "Turn-based strategy (TBS)": "Strategy",
  "Point-and-click": "Adventure",
  "Card & Board Game": "Card and board",
  "Quiz/Trivia": "Quiz",
};

export class IgdbError extends Error {
  constructor(
    message: string,
    readonly kind: "auth" | "rate_limited" | "unavailable",
  ) {
    super(message);
  }
}

export function igdbEnabled() {
  return !!(process.env.IGDB_CLIENT_ID && process.env.IGDB_CLIENT_SECRET);
}

// ─── HTTP ────────────────────────────────────────────────────────────────────

let token: { value: string; expiresAt: number } | null = null;

async function accessToken() {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  const params = new URLSearchParams({
    client_id: process.env.IGDB_CLIENT_ID ?? "",
    client_secret: process.env.IGDB_CLIENT_SECRET ?? "",
    grant_type: "client_credentials",
  });
  const res = await fetch(`${TOKEN_URL}?${params}`, { method: "POST", signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => null);
  if (!res) throw new IgdbError("Couldn't reach Twitch to sign in to IGDB.", "unavailable");
  if (!res.ok) throw new IgdbError("Twitch rejected the IGDB keys. Check IGDB_CLIENT_ID and IGDB_CLIENT_SECRET.", "auth");
  const body = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return token.value;
}

// One request every 260 ms keeps us under IGDB's 4 per second.
let nextSlot = 0;
async function pace() {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + 260;
  if (wait) await new Promise((r) => setTimeout(r, wait));
}

async function query<T>(endpoint: string, body: string, retried = false): Promise<T[]> {
  await pace();
  const res = await fetch(`${API_URL}/${endpoint}`, {
    method: "POST",
    headers: {
      "Client-ID": process.env.IGDB_CLIENT_ID ?? "",
      Authorization: `Bearer ${await accessToken()}`,
      Accept: "application/json",
    },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => null);
  if (!res) throw new IgdbError("IGDB didn't respond.", "unavailable");
  if (res.status === 401 && !retried) {
    token = null;
    return query(endpoint, body, true);
  }
  if (res.status === 401 || res.status === 403) throw new IgdbError("IGDB refused the request. Check the IGDB keys.", "auth");
  if (res.status === 429) throw new IgdbError("IGDB is rate limiting us. Try again in a minute.", "rate_limited");
  if (!res.ok) throw new IgdbError(`IGDB returned ${res.status}.`, "unavailable");
  return (await res.json()) as T[];
}

// ─── Matching ────────────────────────────────────────────────────────────────

type IgdbGame = {
  id: number;
  name: string;
  summary?: string;
  first_release_date?: number;
  total_rating_count?: number;
  version_parent?: number;
  parent_game?: number;
  platforms?: number[];
  alternative_names?: { name: string }[];
  genres?: { name: string }[];
  involved_companies?: { developer: boolean; publisher: boolean; company?: { name: string } }[];
  screenshots?: { image_id: string }[];
  videos?: { video_id: string; name?: string }[];
  release_dates?: { date?: number; platform?: number; status?: { name?: string } }[];
};

const FIELDS = [
  "name",
  "summary",
  "first_release_date",
  "total_rating_count",
  "version_parent",
  "parent_game",
  "platforms",
  "alternative_names.name",
  "genres.name",
  "involved_companies.developer",
  "involved_companies.publisher",
  "involved_companies.company.name",
  "screenshots.image_id",
  "videos.video_id",
  "videos.name",
  "release_dates.date",
  "release_dates.platform",
  "release_dates.status.name",
].join(",");

/** What to type into IGDB's search: the PSN title without trophy-list clutter. */
export function searchName(title: string) {
  return cleanTitle(title)
    .replace(/[®™©]/g, "")
    .replace(/[‘’]/g, "'")
    .replace(/\s+trophies$/i, "")
    .replace(/\s*\((ps4|ps5|ps3|ps vita|psvita|vita|ps4\s*&\s*ps5|english|[^)]*\bver\.?)\)\s*$/i, "")
    .replace(/\s*[-–:]?\s*ps[45](\s*(&|and)\s*ps[45])?\s*$/i, "")
    .trim();
}

/** The key without edition words, so "X Game of the Year Edition" can match "X". */
function editionless(key: string) {
  return key
    .replace(/ (game of the year|goty)( edition)?$/, "")
    .replace(/ (complete|definitive|deluxe|digital deluxe|ultimate|standard|gold|enhanced|anniversary|legendary|special|premium) edition$/, "")
    .replace(/ directors cut$/, "")
    .trim();
}

/**
 * Picks the IGDB entry for a PSN title. Only names that normalise to the same
 * key count, because IGDB's search is fuzzy and a wrong trailer is worse than
 * none. Among matches, the base game on the right console wins.
 */
export function pickMatch(title: string, platforms: string[], results: IgdbGame[]) {
  const key = titleKey(searchName(title));
  const loose = editionless(key);
  const wanted = new Set(platforms.map((p) => PLATFORM_IDS[p]).filter(Boolean));
  let best: { game: IgdbGame; score: number } | null = null;
  for (const g of results) {
    const names = [g.name, ...(g.alternative_names ?? []).map((a) => a.name)].map((n) => titleKey(n));
    const quality = names[0] === key ? 3 : names.includes(key) ? 2 : loose && names.some((n) => editionless(n) === loose) ? 1 : 0;
    if (!quality) continue;
    const score =
      quality * 1000 +
      ((g.platforms ?? []).some((p) => wanted.has(p)) ? 200 : 0) +
      (g.version_parent ? 0 : 100) +
      (g.parent_game ? 0 : 50) +
      Math.min(g.total_rating_count ?? 0, 49);
    if (!best || score > best.score) best = { game: g, score };
  }
  return best?.game ?? null;
}

/** The name without an edition suffix, for a second exact lookup. */
function stripEdition(name: string) {
  return name
    .replace(/\s*[-–:]?\s*(game of the year|goty)( edition)?$/i, "")
    .replace(/\s*[-–:]?\s*(complete|definitive|deluxe|digital deluxe|ultimate|standard|gold|enhanced|anniversary|legendary|special|premium) edition$/i, "")
    .replace(/\s*[-–:]?\s*director[’']?s cut$/i, "")
    .trim();
}

async function searchGame(title: string, platforms: string[]) {
  const name = searchName(title).replace(/["\\]/g, " ");
  if (!name) return null;
  const onPlayStation = `platforms = (${PLAYSTATION.join(",")})`;
  // Exact name or alternative name first. IGDB's fuzzy search ranks DLC and
  // seasons above the base game ("Tom Clancy's Rainbow Six Siege" only
  // exists as an alternative name of "Rainbow Six Siege").
  for (const n of [...new Set([name, stripEdition(name)])].filter(Boolean)) {
    const exact = await query<IgdbGame>(
      "games",
      `fields ${FIELDS}; where (name ~ "${n}" | alternative_names.name ~ "${n}") & ${onPlayStation}; limit 20;`,
    );
    const hit = pickMatch(title, platforms, exact);
    if (hit) return hit;
  }
  const results = await query<IgdbGame>("games", `search "${name}"; fields ${FIELDS}; where ${onPlayStation}; limit 20;`);
  return pickMatch(title, platforms, results);
}

async function gameById(id: number) {
  const [g] = await query<IgdbGame>("games", `fields ${FIELDS}; where id = ${id};`);
  return g ?? null;
}

// ─── Turning a match into game fields ────────────────────────────────────────

function releaseDateFor(g: IgdbGame, platforms: string[]) {
  const wanted = new Set(platforms.map((p) => PLATFORM_IDS[p]).filter(Boolean));
  // Skip patches, betas and early access: IGDB lists GTA V's 2025 PS5 update as a PS5 "release".
  const dates = (g.release_dates ?? []).filter((d) => d.date && d.platform && (!d.status?.name || /full release/i.test(d.status.name)));
  const earliest = (list: typeof dates) => (list.length ? Math.min(...list.map((d) => d.date!)) : null);
  const secs =
    earliest(dates.filter((d) => wanted.has(d.platform!))) ??
    earliest(dates.filter((d) => PLAYSTATION.includes(d.platform!))) ??
    g.first_release_date ??
    null;
  return secs ? new Date(secs * 1000) : null;
}

function trailerFor(g: IgdbGame) {
  const videos = (g.videos ?? []).filter((v) => /^[\w-]{11}$/.test(v.video_id));
  const named = (re: RegExp) => videos.find((v) => v.name && re.test(v.name));
  return (named(/launch trailer/i) ?? named(/^trailer$/i) ?? named(/trailer/i) ?? videos[0])?.video_id ?? null;
}

function genreFor(g: IgdbGame) {
  const names = (g.genres ?? []).map((x) => x.name);
  const name = names.find((n) => n !== "Indie") ?? names[0];
  return name ? (GENRE_NAMES[name] ?? name) : null;
}

function companyFor(g: IgdbGame, role: "developer" | "publisher") {
  return (g.involved_companies ?? []).find((c) => c[role] && c.company?.name)?.company?.name ?? null;
}

function summaryFor(g: IgdbGame) {
  const s = g.summary?.replace(/\s+/g, " ").trim();
  if (!s) return null;
  if (s.length <= 900) return s;
  // Cut at the last full sentence that fits.
  const cut = s.slice(0, 900);
  const end = cut.lastIndexOf(". ");
  return end > 300 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`;
}

// ─── Public entry points ─────────────────────────────────────────────────────

const FAMILY_SELECT = {
  id: true,
  title: true,
  titleKey: true,
  platforms: true,
  releaseDate: true,
  description: true,
  genre: true,
  developer: true,
  publisher: true,
  screenshots: true,
  trailerYoutubeId: true,
  igdbId: true,
  igdbCheckedAt: true,
} as const;

/**
 * Looks a game up on IGDB and fills in whatever its trophy lists are missing.
 * Every list with the same titleKey shares the match, so a game is looked up
 * once. Fields that already have a value are never overwritten.
 * Returns true when IGDB had the game.
 */
export async function enrichGame(gameId: string): Promise<boolean> {
  if (!igdbEnabled()) return false;
  const game = await prisma.game.findUnique({ where: { id: gameId }, select: FAMILY_SELECT });
  if (!game) return false;
  const family = game.titleKey
    ? await prisma.game.findMany({ where: { titleKey: game.titleKey }, select: FAMILY_SELECT })
    : [game];
  const unchecked = family.filter((g) => !g.igdbCheckedAt).map((g) => g.id);
  if (!unchecked.length) return family.some((g) => g.igdbId);

  // Claim the lists first so two page views don't both call IGDB.
  const claimed = await prisma.game.updateMany({ where: { id: { in: unchecked }, igdbCheckedAt: null }, data: { igdbCheckedAt: new Date() } });
  if (!claimed.count) return false;

  try {
    const knownId = family.find((g) => g.igdbId)?.igdbId;
    const lookedUpBefore = family.length > unchecked.length;
    // A sibling already looked up and found nothing: IGDB won't know this one either.
    if (!knownId && lookedUpBefore) return false;

    const platforms = [...new Set(family.flatMap((g) => g.platforms.split(",")))];
    const match = knownId ? await gameById(knownId) : await searchGame(game.title, platforms);
    if (!match) return false;

    const shots = (match.screenshots ?? []).slice(0, 6).map((s) => `${IMAGE_URL}/t_screenshot_big/${s.image_id}.jpg`);
    const shared = {
      description: summaryFor(match),
      genre: genreFor(match),
      developer: companyFor(match, "developer"),
      publisher: companyFor(match, "publisher"),
      trailerYoutubeId: trailerFor(match),
    };
    for (const g of family) {
      await prisma.game.update({
        where: { id: g.id },
        data: {
          igdbId: match.id,
          releaseDate: g.releaseDate ?? releaseDateFor(match, g.platforms.split(",")),
          description: g.description ?? shared.description,
          genre: g.genre ?? shared.genre,
          developer: g.developer ?? shared.developer,
          publisher: g.publisher ?? shared.publisher,
          trailerYoutubeId: g.trailerYoutubeId ?? shared.trailerYoutubeId,
          screenshots: g.screenshots === "[]" && shots.length ? JSON.stringify(shots) : g.screenshots,
        },
      });
    }
    return true;
  } catch (err) {
    // Let a later run try again.
    await prisma.game.updateMany({ where: { id: { in: unchecked } }, data: { igdbCheckedAt: null } });
    throw err;
  }
}

/**
 * Looks up games that haven't been checked yet, most played first.
 * Stops early if IGDB rejects the keys or starts rate limiting.
 */
export async function enrichPending(limit: number) {
  const pending = await prisma.game.findMany({
    where: { igdbCheckedAt: null },
    orderBy: [{ playerTitles: { _count: "desc" } }, { userGames: { _count: "desc" } }, { title: "asc" }],
    distinct: ["titleKey"],
    take: limit,
    select: { id: true, title: true },
  });
  let matched = 0;
  let missed = 0;
  let error: string | null = null;
  let stopped = false;
  for (const g of pending) {
    try {
      if (await enrichGame(g.id)) matched++;
      else missed++;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      stopped = !(err instanceof IgdbError) || err.kind !== "unavailable";
      if (stopped) break;
    }
  }
  const remaining = await prisma.game.count({ where: { igdbCheckedAt: null } });
  return { checked: matched + missed, matched, missed, remaining, error, stopped };
}

/**
 * The best-known PlayStation games by how many people rated them on IGDB,
 * with their other names, for preloading popular trophy lists
 * (scripts/preload-popular.ts). PS4 and PS5 by default.
 */
export async function popularPlayStationGames(limit = 500, platforms = [PLATFORM_IDS.PS4, PLATFORM_IDS.PS5]) {
  const out: { name: string; alternatives: string[]; ratings: number }[] = [];
  for (let offset = 0; offset < limit; offset += 500) {
    const rows = await query<IgdbGame>(
      "games",
      `fields name,total_rating_count,alternative_names.name; where platforms = (${platforms.join(",")}) & total_rating_count > 0 & version_parent = null; sort total_rating_count desc; limit ${Math.min(500, limit - offset)}; offset ${offset};`,
    );
    out.push(...rows.map((g) => ({ name: g.name, alternatives: (g.alternative_names ?? []).map((a) => a.name), ratings: g.total_rating_count ?? 0 })));
    if (rows.length < 500) break;
  }
  return out;
}
