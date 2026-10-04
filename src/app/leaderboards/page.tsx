import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { cached } from "@/lib/cache";
import {
  COMPLETION_MIN_GAMES,
  getLeaderboard,
  METRICS,
  PERIODS,
  SCOPES,
  usesPsnTotals,
  viewerRanks,
  type Metric,
  type Period,
  type Scope,
} from "@/lib/leaderboard";
import { COUNTRIES, countryName, flag } from "@/lib/countries";
import { isDemoMode } from "@/lib/psn/sync";
import { formatNumber } from "@/lib/utils";
import { TrophyIcon } from "@/components/TrophyIcon";
import { Avatar, EmptyState, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Leaderboards", description: "Global, country and friends trophy leaderboards." };
export const dynamic = "force-dynamic";

type Search = { scope?: string; period?: string; metric?: string; country?: string };

const pickKey = <T extends Record<string, string>>(obj: T, v: string | undefined, fallback: keyof T) =>
  (v && v in obj ? v : fallback) as keyof T;

export default async function LeaderboardsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  const scope = pickKey(SCOPES, sp.scope, "global") as Scope;
  const period = pickKey(PERIODS, sp.period, "all") as Period;
  let metric = pickKey(METRICS, sp.metric, "points") as Metric;
  if (metric === "completion" && period !== "all") metric = "points";

  // Every country we have players in, plus the standard list.
  const tracked = await cached(
    "boards:countries",
    () => prisma.psnPlayer.groupBy({ by: ["country"], where: { hidden: false, trophiesPrivate: false, country: { not: null } }, _count: true }),
    { ttlMs: 10 * 60_000, tags: ["boards"] },
  );
  const playersIn = new Map(tracked.map((t) => [t.country!, t._count]));
  const countryCodes = [...new Set([...Object.keys(COUNTRIES), ...playersIn.keys()])].sort((a, b) =>
    countryName(a).localeCompare(countryName(b)),
  );
  const requested = sp.country?.toUpperCase();
  const country = requested && /^[A-Z]{2}$/.test(requested) ? requested : (user?.country ?? "GB");

  const [rows, trackedCount, myRanks] = await Promise.all([
    getLeaderboard({ metric, period, scope, country, viewerId: user?.id }),
    cached(
      `boards:tracked:${scope === "country" ? country : ""}`,
      () => prisma.psnPlayer.count({ where: { hidden: false, trophiesPrivate: false, ...(scope === "country" ? { country } : {}) } }),
      { ttlMs: 10 * 60_000, tags: ["boards"] },
    ),
    user ? viewerRanks(user) : null,
  ]);
  const psnTotals = usesPsnTotals({ metric, period, scope });

  const href = (o: Partial<Record<keyof Search, string>>) => {
    const p = new URLSearchParams({ scope, period, metric, ...(scope === "country" ? { country } : {}), ...o });
    return `/leaderboards?${p}`;
  };

  const valueOf = (r: (typeof rows)[number]) =>
    metric === "points"
      ? formatNumber(r.points)
      : metric === "platinums"
        ? formatNumber(r.platinums)
        : metric === "rare"
          ? r.rare != null
            ? `${formatNumber(r.rare)}${r.rarePartial ? "+" : ""}`
            : "–"
          : r.completion != null
            ? `${r.completion}%`
            : "–";

  return (
    <div>
      <PageHeader kicker="Compete" title="Leaderboards">
        {period === "all"
          ? "All-time standings"
          : period === "weekly"
            ? "Trophies earned since Monday (UTC)"
            : "Trophies earned this calendar month (UTC)"}
        {scope === "country" && ` in ${countryName(country)}`}
        {scope === "friends" && " among you and your friends"}.
      </PageHeader>

      {user && (
        <section className="card mb-6 p-4" aria-label="Your rank">
          {myRanks ? (
            <dl className="grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="label">Your global rank</dt>
                <dd className="text-2xl font-bold tabular-nums">
                  #{formatNumber(myRanks.global.rank)}
                  <span className="ml-2 text-sm font-normal text-muted">of {formatNumber(myRanks.global.of)}</span>
                </dd>
              </div>
              <div>
                <dt className="label">
                  Your rank in {myRanks.country ? `${flag(myRanks.country.code)} ${countryName(myRanks.country.code)}` : "your country"}
                </dt>
                <dd className="text-2xl font-bold tabular-nums">
                  {myRanks.country ? (
                    <>
                      #{formatNumber(myRanks.country.rank)}
                      <span className="ml-2 text-sm font-normal text-muted">of {formatNumber(myRanks.country.of)}</span>
                    </>
                  ) : (
                    <span className="text-sm font-normal text-muted">
                      Set your country in <Link href="/settings" className="link">Settings</Link>
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="label">Your trophy points</dt>
                <dd className="text-2xl font-bold tabular-nums">{formatNumber(myRanks.points)}</dd>
              </div>
              <p className="text-xs text-muted sm:col-span-3">Ranked on all-time trophy points among the players TrophyPilot tracks.</p>
            </dl>
          ) : (
            <p className="text-sm text-muted">
              You&apos;re not ranked yet.{" "}
              <Link href="/settings#psn" className="link">
                Link and sync your PSN account
              </Link>{" "}
              to see your global and country rank here.
            </p>
          )}
        </section>
      )}

      <div className="card mb-6 space-y-4 p-4">
        <Group label="Scope">
          {Object.entries(SCOPES).map(([k, l]) => (
            <Pill key={k} href={href({ scope: k })} active={scope === k}>
              {l}
            </Pill>
          ))}
          {scope === "country" && (
            <form action="/leaderboards" className="flex gap-2 sm:ml-2">
              <input type="hidden" name="scope" value="country" />
              <input type="hidden" name="period" value={period} />
              <input type="hidden" name="metric" value={metric} />
              <select name="country" defaultValue={country} className="input py-1.5" aria-label="Country">
                {countryCodes.map((c) => (
                  <option key={c} value={c}>
                    {flag(c)} {countryName(c)}
                    {playersIn.get(c) ? ` (${formatNumber(playersIn.get(c)!)})` : ""}
                  </option>
                ))}
              </select>
              <button className="btn-ghost py-1.5">Go</button>
            </form>
          )}
        </Group>
        <Group label="Period">
          {Object.entries(PERIODS).map(([k, l]) => (
            <Pill key={k} href={href({ period: k })} active={period === k}>
              {l}
            </Pill>
          ))}
        </Group>
        <Group label="Ranked by">
          {Object.entries(METRICS).map(([k, l]) =>
            k === "completion" && period !== "all" ? null : (
              <Pill key={k} href={href({ metric: k })} active={metric === k}>
                {l}
              </Pill>
            ),
          )}
        </Group>
      </div>

      {scope === "friends" && !user ? (
        <EmptyState
          title="Log in to see your friends board"
          action={
            <Link href="/login?next=/leaderboards?scope=friends" className="btn-primary">
              Log in
            </Link>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState title="Nobody here yet">
          {psnTotals
            ? period === "all"
              ? `No players ${scope === "country" ? `from ${countryName(country)} ` : ""}have been seen yet. Players are added when someone looks up their PSN profile or they link their account.`
              : `Nobody ${scope === "country" ? `from ${countryName(country)} ` : ""}has gained points since the ${period === "weekly" ? "week" : "month"} started, as far as our refreshes have seen.`
            : "No trophies have been earned in this window."}
        </EmptyState>
      ) : (
        <>
          {rows.length >= 3 && (
            <ol className="mb-6 grid gap-3 sm:grid-cols-3">
              {rows.slice(0, 3).map((r) => (
                <li
                  key={r.key}
                  className={clsx(
                    "card relative flex flex-col items-center p-5 text-center",
                    r.rank === 1 && "border-gold/60 sm:order-2",
                    r.rank === 2 && "sm:order-1 sm:mt-6",
                    r.rank === 3 && "sm:order-3 sm:mt-6",
                  )}
                >
                  <span className={clsx("absolute left-3 top-2 text-lg font-bold", r.rank === 1 ? "text-gold" : "text-muted")}>
                    {r.rank}
                  </span>
                  <Avatar name={r.name} hue={r.avatarHue} url={r.avatarUrl} avatar={r.avatar} size={r.rank === 1 ? 72 : 60} />
                  <Link href={r.href} className="mt-3 break-all font-bold hover:underline hover:underline-offset-4">
                    {r.name} <span className="text-sm">{flag(r.country)}</span>
                  </Link>
                  <div className="text-xs text-muted">Level {r.level}</div>
                  <div className="mt-1 text-xl font-bold tabular-nums">{valueOf(r)}</div>
                  <div className="text-xs text-muted">{METRICS[metric]}</div>
                </li>
              ))}
            </ol>
          )}
          <div className="card overflow-x-auto" role="region" aria-label="Leaderboard table" tabIndex={0}>
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-line bg-surface-2 text-left text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="w-14 px-4 py-3">Rank</th>
                  <th className="px-4 py-3">Hunter</th>
                  <Th>Level</Th>
                  <Th active={metric === "points"}>Points</Th>
                  <Th active={metric === "platinums"}>Plats</Th>
                  <Th active={metric === "rare"}>Ultra rares</Th>
                  <Th>Trophies</Th>
                  {period === "all" && <Th active={metric === "completion"}>Avg %</Th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.key} className={clsx(r.userId && r.userId === user?.id && "bg-surface-3")}>
                    <td className="px-4 py-2.5 tabular-nums text-muted">{r.rank}</td>
                    <td className="px-4 py-2.5">
                      <Link
                        href={r.href}
                        className="flex items-center gap-2.5 font-semibold hover:underline hover:underline-offset-4"
                      >
                        <Avatar name={r.name} hue={r.avatarHue} url={r.avatarUrl} avatar={r.avatar} size={28} />
                        {r.name}
                        <span title={countryName(r.country)}>{flag(r.country)}</span>
                        {r.userId && r.userId === user?.id && <span className="chip">You</span>}
                        {r.kind === "member" && r.userId !== user?.id && psnTotals && (
                          <span className="chip" title="Has a TrophyPilot account">
                            Member
                          </span>
                        )}
                      </Link>
                    </td>
                    <Td>{r.level}</Td>
                    <Td active={metric === "points"}>{formatNumber(r.points)}</Td>
                    <Td active={metric === "platinums"}>
                      <span className="inline-flex items-center gap-1">
                        <TrophyIcon type="PLATINUM" size={13} />
                        {formatNumber(r.platinums)}
                      </span>
                    </Td>
                    <Td active={metric === "rare"}>
                      <RareCount rare={r.rare} partial={r.rarePartial} allTime={period === "all"} />
                    </Td>
                    <Td>{formatNumber(r.trophies)}</Td>
                    {period === "all" && (
                      <Td active={metric === "completion"}>
                        {r.completion != null ? (
                          `${r.completion}%`
                        ) : (
                          <span className="text-faint" title="Not counted yet">
                            –<span className="sr-only">not counted yet</span>
                          </span>
                        )}
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {metric === "completion" && (
            <p className="mt-3 text-xs text-faint">Completion rankings require at least {COMPLETION_MIN_GAMES} games.</p>
          )}
          {rows.some((r) => r.rarePartial) && (
            <p className="mt-3 text-xs text-faint">
              A + after the ultra rares means we&apos;re still counting that player&apos;s lists. Each refresh counts more, until
              every list is done.
            </p>
          )}
        </>
      )}
      <div className="mt-4 space-y-1 text-xs text-faint">
        {psnTotals ? (
          <p>
            {period === "all"
              ? "All-time boards use each player's real lifetime totals from PlayStation Network, including players who haven't joined. Average completion comes from their full PSN games list, and ultra rares are counted list by list as we refresh them."
              : `This board ranks what each player gained since the ${period === "weekly" ? "week" : "month"} started, measured between our regular refreshes of their PSN totals, so it includes players who haven't joined.`}{" "}
            The site ranks {formatNumber(trackedCount)} players it has seen so far: anyone whose profile was looked up, linked or
            tracked. Countries come from the player&apos;s PSN account region.
            {isDemoMode() && " In demo mode no PSN players are tracked, so only members appear."}
          </p>
        ) : (
          <p>
            This board needs a full trophy history, so only members who have linked PSN appear on it. Members&apos; countries are
            the ones they chose in settings.
          </p>
        )}
        <p>
          Points: platinum 300, gold 90, silver 30, bronze 15. Ultra rare means 5% of players or fewer have it. Friends-only and
          private profiles stay off global and country boards, and players with private PSN trophies aren&apos;t ranked.
        </p>
      </div>
    </div>
  );
}

/** Ultra rare count; "+" while a tracked player's lists are still being counted. */
function RareCount({ rare, partial, allTime }: { rare: number | null; partial: boolean; allTime: boolean }) {
  if (rare == null)
    return (
      <span className="text-faint" title={allTime ? "Not counted yet" : "Counted all time only for players who haven't joined"}>
        –<span className="sr-only">{allTime ? "not counted yet" : "not counted for this period"}</span>
      </span>
    );
  return partial ? (
    <span title="Still counting this player's lists">
      {formatNumber(rare)}+<span className="sr-only"> so far, still counting</span>
    </span>
  ) : (
    <>{formatNumber(rare)}</>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-24 text-xs uppercase tracking-wider text-muted">{label}</span>
      {children}
    </div>
  );
}

function Pill({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={clsx(
        "border px-3 py-1 text-sm",
        active ? "border-accent bg-accent text-white" : "border-line text-muted hover:border-muted hover:text-text",
      )}
    >
      {children}
    </Link>
  );
}

function Th({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return <th className={clsx("px-4 py-3 text-right", active && "text-accent-text")}>{children}</th>;
}
function Td({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return <td className={clsx("px-4 py-2.5 text-right tabular-nums", active && "font-bold text-text")}>{children}</td>;
}
