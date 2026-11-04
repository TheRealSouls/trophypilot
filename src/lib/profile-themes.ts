/**
 * Profile extras that members choose in Settings: an accent colour for
 * their own profile page, and links to where they stream.
 * The colours live in globals.css (.profile-accent-*), each checked for the
 * same contrast as the site's red, in both light and dark mode.
 */
export const PROFILE_ACCENTS = {
  "": "Red (site default)",
  blue: "Blue",
  green: "Green",
  teal: "Teal",
  gold: "Gold",
  slate: "Slate",
} as const;

export const accentClass = (key: string) => (key && key in PROFILE_ACCENTS ? `profile-accent-${key}` : "");

/**
 * Pre-built profile cards, like Discord's profile themes: each recolours the
 * profile header (globals.css, .pcard-*) and brings its own animated banner
 * art (src/components/ProfileCardArt.tsx), used when no game banner is picked.
 */
export const PROFILE_CARDS: Record<string, string> = {
  "": "Plain",
  ember: "Ember",
  circuit: "Circuit",
  ocean: "Ocean",
  forest: "Forest",
  frost: "Frost",
  platinum: "Platinum",
  arcade: "Arcade",
};

export const cardClass = (key: string) => (key && Object.hasOwn(PROFILE_CARDS, key) ? `pcard pcard-${key}` : "");

/**
 * Returns a clean https link if the input is one for an allowed site, or
 * null. `hosts` limits it (YouTube, Twitch); without it any https site is
 * accepted, for Kick, Facebook Gaming and the rest.
 */
export function streamLink(input: string | null | undefined, hosts?: string[]): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  url.protocol = "https:";
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (hosts && !hosts.some((h) => host === h || host.endsWith(`.${h}`))) return null;
  if (url.username || url.password) return null;
  return url.toString().slice(0, 200);
}

/** The first real screenshot of a game (IGDB), for a profile banner. */
export function bannerImage(game: { screenshots: string; iconUrl: string | null } | null | undefined) {
  if (!game) return null;
  try {
    const shots = JSON.parse(game.screenshots) as unknown;
    const first = Array.isArray(shots) ? shots.find((s) => typeof s === "string" && s.startsWith("https://")) : null;
    if (typeof first === "string") return first;
  } catch {
    // fall through
  }
  return game.iconUrl ? game.iconUrl.replace(/^http:/, "https:") : null;
}
