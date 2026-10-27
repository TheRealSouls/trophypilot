import { prisma } from "./db";

/**
 * Which region a trophy list is from, when we can tell. PSN doesn't say, so
 * it's worked out from who owns each list (tracked players and members, by
 * the country on their account) and from the list's name: Japanese, Korean
 * or Chinese writing points to an Asian list. Unknown stays unlabelled.
 */
export type Region = "EU" | "NA" | "JP" | "KR" | "Asia";

export const REGION_NAMES: Record<Region, string> = { EU: "Europe", NA: "North America", JP: "Japan", KR: "Korea", Asia: "Asia" };

const EU = new Set(
  "GB IE FR DE ES PT IT NL BE LU AT CH DK NO SE FI IS PL CZ SK HU RO BG GR HR SI RS BA ME MK AL TR CY MT EE LV LT UA RU IL SA AE QA KW BH OM ZA AU NZ IN"
    .split(" "),
);
const NA = new Set("US CA MX BR AR CL CO PE".split(" "));
const ASIA = new Set("HK TW SG MY TH ID PH CN VN MO".split(" "));
const regionOfCountry = (c: string): Region | null =>
  c === "JP" ? "JP" : c === "KR" ? "KR" : ASIA.has(c) ? "Asia" : NA.has(c) ? "NA" : EU.has(c) ? "EU" : null;

/** From the list's own name: kana means Japan, hangul Korea, other CJK Asia. */
function regionOfText(text: string): Region | null {
  if (/[぀-ヿ]/.test(text)) return "JP";
  if (/[가-힯]/.test(text)) return "KR";
  if (/[一-鿿]/.test(text)) return "Asia";
  return null;
}

/** Region per list id, for the lists we can place. Needs a clear majority of at least three known owners. */
export async function listRegions(lists: { id: string; title: string }[]): Promise<Map<string, Region>> {
  const out = new Map<string, Region>();
  if (lists.length < 2) return out;
  const ids = lists.map((l) => l.id);
  const rows = await prisma.$queryRaw<{ gameId: string; country: string; n: bigint }[]>`
    SELECT t."gameId", p.country, count(*) AS n FROM "PsnPlayerTitle" t
    JOIN "PsnPlayer" p ON p."accountId" = t."accountId"
    WHERE t."gameId" = ANY(${ids}) AND p.country IS NOT NULL
    GROUP BY t."gameId", p.country
    UNION ALL
    SELECT ug."gameId", u.country, count(*) AS n FROM "UserGame" ug
    JOIN "User" u ON u.id = ug."userId"
    WHERE ug."gameId" = ANY(${ids}) AND u.country IS NOT NULL
    GROUP BY ug."gameId", u.country`;
  for (const l of lists) {
    const fromText = regionOfText(l.title);
    if (fromText) {
      out.set(l.id, fromText);
      continue;
    }
    const tally = new Map<Region, number>();
    let known = 0;
    for (const r of rows) {
      if (r.gameId !== l.id) continue;
      const region = regionOfCountry(r.country);
      if (!region) continue;
      tally.set(region, (tally.get(region) ?? 0) + Number(r.n));
      known += Number(r.n);
    }
    const [best, n] = [...tally].sort((a, b) => b[1] - a[1])[0] ?? [];
    if (best && known >= 3 && n / known >= 0.6) out.set(l.id, best);
  }
  return out;
}
