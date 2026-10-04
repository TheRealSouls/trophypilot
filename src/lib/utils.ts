export function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function formatDate(d: Date | string | null | undefined, opts?: Intl.DateTimeFormatOptions) {
  if (!d) return "n/a";
  return new Date(d).toLocaleDateString("en-GB", opts ?? { day: "numeric", month: "short", year: "numeric" });
}

export function timeAgo(d: Date | string) {
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  const abs = Math.abs(s);
  const units: [number, string][] = [
    [60 * 60 * 24 * 365, "y"],
    [60 * 60 * 24 * 30, "mo"],
    [60 * 60 * 24 * 7, "w"],
    [60 * 60 * 24, "d"],
    [60 * 60, "h"],
    [60, "m"],
  ];
  for (const [secs, label] of units) {
    if (abs >= secs) {
      const n = Math.floor(abs / secs);
      return s >= 0 ? `${n}${label} ago` : `in ${n}${label}`;
    }
  }
  return s >= 0 ? "just now" : "soon";
}

export function formatNumber(n: number) {
  return new Intl.NumberFormat("en-GB").format(n);
}

export function parseJsonArray(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Accepts a YouTube URL or bare id and returns the 11-char video id. */
export function youtubeId(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
  return m ? m[1] : null;
}

/** Deterministic 32-bit hash, used for seeded randomness and generated art. */
export function hashString(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function startOfWeekUTC(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day);
  return d;
}

export function startOfMonthUTC(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Generated art and avatars use a stored hue. Snap it to a small set of warm,
 * earthy hues so nothing lands on purple or neon.
 */
const ART_HUES = [4, 18, 32, 45, 85, 150, 190, 210];
export function artHue(hue: number) {
  return ART_HUES[((Math.round(hue) % 360) + 360) % ART_HUES.length];
}

/** PSN titles sometimes carry stray whitespace and newlines. */
export function cleanTitle(title: string) {
  return title.replace(/\s+/g, " ").trim();
}

/**
 * Groups trophy lists that belong to the same game. PSN gives every platform
 * (and often every region) its own list, so "Tom Clancy’s Rainbow Six® Siege"
 * on PS4 and PS5 are two lists with one key.
 */
export function titleKey(title: string) {
  return (
    cleanTitle(title)
      .toLowerCase()
      .normalize("NFKD")
      // Strip Latin accents only; Japanese voicing marks must survive.
      .replace(/[̀-ͯ]/g, "")
      .normalize("NFC")
      .replace(/[®™©’'`]/g, "")
      .replace(/\((ps4|ps5|ps3|ps vita|psvita|vita)\)$/g, "")
      // Letters and digits from every script, so non-Latin titles don't collapse to "".
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
  );
}

/** PSN hands out some image URLs (avatars) as http://; its CDN serves the same files over https. */
export function secureUrl<T extends string | null | undefined>(url: T): T {
  return (url ? url.replace(/^http:\/\//i, "https://") : url) as T;
}

/** How a PSN platform code reads on the page ("PSVITA" is "PS Vita"). */
export function platformName(code: string) {
  return code === "PSVITA" ? "PS Vita" : code;
}
