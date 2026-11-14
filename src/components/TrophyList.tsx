"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import clsx from "clsx";
import { TrophyIcon } from "./TrophyIcon";
import { RevealButton, Spoiler, SpoilerSwap } from "./client";
import { ProgressBar } from "./ui";
import { CheckIcon } from "./icons";
import { rarityOf, TROPHY_ORDER, TROPHY_POINTS, type TrophySort, type TrophyType } from "@/lib/trophies";
import { formatDate, psnImage } from "@/lib/utils";
import { trophyHref } from "@/lib/trophy-slug";
import { LocalTime } from "./LocalTime";

type T = {
  id: string;
  psnTrophyId: number;
  slug: string | null;
  name: string;
  description: string;
  type: string;
  hidden: boolean;
  missable: boolean;
  online: boolean;
  earnedRate: number | null;
  iconUrl?: string | null;
  groupId: string;
  _count?: { tips: number };
};

type G = { id: string; name: string; isDlc: boolean; releaseDate: Date | null };

export type TrophyShow = "all" | "earned" | "unearned";
type Part = "all" | "base" | "dlc";

const SORTS: [TrophySort, string][] = [
  ["default", "Game order"],
  ["rarity", "Rarest first"],
  ["common", "Most common first"],
  ["type", "Grade"],
  ["earned", "Recently earned"],
];

const RARITY_TEXT = { ULTRA_RARE: "text-ultra", VERY_RARE: "text-very", RARE: "text-rare", COMMON: "text-common" } as const;

/**
 * A game's trophies, grouped into the base game and each DLC pack, with a
 * filter bar: earned/unearned, base game or DLC, sort, jump to a pack, search
 * and hidden trophies. It all happens in the page, so there's no wait for the
 * server between clicks.
 */
export function TrophyList({
  gameSlug,
  groups,
  trophies,
  earned,
  ownerLabel,
  sort: initialSort = "default",
  show: initialShow = "all",
}: {
  /** The list's game, for trophy addresses (/games/<game>/<trophy>). */
  gameSlug: string;
  groups: G[];
  trophies: T[];
  /** trophyId → earned date; omit when there's no progress to show. */
  earned?: Map<string, Date>;
  ownerLabel?: string;
  sort?: TrophySort;
  show?: TrophyShow;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<TrophySort>(initialSort);
  const [show, setShow] = useState<TrophyShow>(earned ? initialShow : "all");
  const [unearnedFirst, setUnearnedFirst] = useState(false);
  const [hideHidden, setHideHidden] = useState(false);
  const [part, setPart] = useState<Part>("all");
  const hasDlc = groups.some((g) => g.isDlc) && trophies.some((t) => groups.find((g) => g.id === t.groupId)?.isDlc);
  const anyHidden = trophies.some((t) => t.hidden);
  const earnedCount = earned ? trophies.filter((t) => earned.has(t.id)).length : 0;

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const dlcGroups = new Set(groups.filter((g) => g.isDlc).map((g) => g.id));
    const list = trophies.filter((t) => {
      const got = earned?.has(t.id) ?? false;
      if (show === "earned" && !got) return false;
      if (show === "unearned" && got) return false;
      if (hideHidden && t.hidden && !got) return false;
      if (part === "base" && dlcGroups.has(t.groupId)) return false;
      if (part === "dlc" && !dlcGroups.has(t.groupId)) return false;
      // A hidden trophy you haven't earned isn't found by its name, so searching can't spoil it.
      if (needle && (t.hidden && !got ? true : !`${t.name} ${t.description}`.toLowerCase().includes(needle))) return false;
      return true;
    });
    return list.sort((a, b) => {
      if (unearnedFirst && earned) {
        const d = Number(earned.has(a.id)) - Number(earned.has(b.id));
        if (d) return d;
      }
      // Unknown rarity sorts last either way.
      if (sort === "rarity") return (a.earnedRate ?? 101) - (b.earnedRate ?? 101);
      if (sort === "common") return (b.earnedRate ?? -1) - (a.earnedRate ?? -1);
      if (sort === "type") return TROPHY_ORDER[a.type] - TROPHY_ORDER[b.type] || a.psnTrophyId - b.psnTrophyId;
      if (sort === "earned" && earned) return (earned.get(b.id)?.getTime() ?? 0) - (earned.get(a.id)?.getTime() ?? 0);
      return a.psnTrophyId - b.psnTrophyId;
    });
  }, [trophies, groups, earned, q, sort, show, unearnedFirst, hideHidden, part]);

  // Base game first ("default" sorts after "001" as a string), then DLC in release order.
  const orderedGroups = [...groups].sort((a, b) => Number(a.isDlc) - Number(b.isDlc));
  const shownGroups = orderedGroups.filter((g) => visible.some((t) => t.groupId === g.id));
  const filtered = visible.length !== trophies.length;
  const chip = (active: boolean) => clsx("chip min-h-8 cursor-pointer px-3", active && "chip-active");
  const nameOf = (g: G) => (g.isDlc ? g.name : "Base game");

  const jumpTo = (id: string) => {
    const heading = document.getElementById(`pack-${id}`);
    if (!heading) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    heading.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
    heading.focus({ preventScroll: true });
  };

  return (
    <div className="space-y-4">
      {trophies.length > 0 && (
        <div className="card space-y-2.5 p-3" role="search" aria-label="Filter trophies">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {earned &&
              (
                [
                  ["all", `All (${trophies.length})`],
                  ["earned", `Earned (${earnedCount})`],
                  ["unearned", `Unearned (${trophies.length - earnedCount})`],
                ] as [TrophyShow, string][]
              ).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={show === k} onClick={() => setShow(k)} className={chip(show === k)}>
                  {l}
                </button>
              ))}
            {hasDlc && (
              <label>
                <span className="sr-only">Base game or DLC</span>
                <select value={part} onChange={(e) => setPart(e.target.value as Part)} className="input w-auto py-1.5 text-sm">
                  <option value="all">Base game + DLC</option>
                  <option value="base">Base game only</option>
                  <option value="dlc">DLC only</option>
                </select>
              </label>
            )}
            <label>
              <span className="sr-only">Sort trophies</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as TrophySort)} className="input w-auto py-1.5 text-sm">
                {SORTS.filter(([k]) => k !== "earned" || earned).map(([k, l]) => (
                  <option key={k} value={k}>
                    Sort: {l}
                  </option>
                ))}
              </select>
            </label>
            {shownGroups.length > 1 && (
              <label>
                <span className="sr-only">Jump to a pack</span>
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) jumpTo(e.target.value);
                  }}
                  className="input w-auto py-1.5 text-sm"
                >
                  <option value="">Jump to pack</option>
                  {shownGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {nameOf(g)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="relative min-w-48 flex-1">
              <span className="sr-only">Search trophies</span>
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search trophies…" className="input py-1.5" />
            </label>
            {anyHidden && (
              <button type="button" aria-pressed={hideHidden} onClick={() => setHideHidden(!hideHidden)} className={chip(hideHidden)}>
                Hide hidden trophies
              </button>
            )}
            {earned && (
              <button type="button" aria-pressed={unearnedFirst} onClick={() => setUnearnedFirst(!unearnedFirst)} className={chip(unearnedFirst)}>
                Unearned first
              </button>
            )}
          </div>
          {filtered && (
            <p className="text-xs text-muted" aria-live="polite">
              Showing {visible.length} of {trophies.length} trophies.
            </p>
          )}
        </div>
      )}

      {filtered && visible.length === 0 && (
        <p className="card p-5 text-sm text-muted">
          {show === "unearned" && earnedCount === trophies.length
            ? `${ownerLabel ?? "You"} earned every trophy here.`
            : "No trophies match. Try a different search or filter."}
        </p>
      )}

      {shownGroups.map((g) => {
        const all = trophies.filter((t) => t.groupId === g.id);
        const list = visible.filter((t) => t.groupId === g.id);
        const count = (type: string) => all.filter((t) => t.type === type).length;
        const earnedHere = earned ? all.filter((t) => earned.has(t.id)) : [];
        const total = all.reduce((s, t) => s + TROPHY_POINTS[t.type as TrophyType], 0);
        const got = earnedHere.reduce((s, t) => s + TROPHY_POINTS[t.type as TrophyType], 0);
        // Weighted by grade, the way PSN works out a list's percentage.
        const pct = total ? Math.floor((got / total) * 100) : 0;
        const name = nameOf(g);
        return (
          <section key={g.id} className="card overflow-hidden" aria-labelledby={`pack-${g.id}`}>
            {/* Grey, so the heading stands apart from the pale red earned rows below it. */}
            <header className="border-b border-line bg-surface-2 px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h3 id={`pack-${g.id}`} tabIndex={-1} className="scroll-mt-24 font-bold outline-none">
                  {name}
                </h3>
                {g.isDlc && <span className="chip min-h-5 border-very/50 bg-very/10 px-1.5 text-[11px] font-semibold text-very">DLC</span>}
                {g.isDlc && g.releaseDate && <span className="text-xs text-muted">Released {formatDate(g.releaseDate)}</span>}
                <div className="ml-auto flex items-center gap-3 text-xs text-muted">
                  {(["PLATINUM", "GOLD", "SILVER", "BRONZE"] as const).map((t) =>
                    count(t) ? (
                      <span key={t} className="inline-flex items-center gap-1">
                        <TrophyIcon type={t} size={14} /> {count(t)}
                        <span className="sr-only">{t.toLowerCase()}</span>
                      </span>
                    ) : null,
                  )}
                </div>
              </div>
              {earned && (
                <div className="mt-2 flex items-center gap-3">
                  <ProgressBar value={pct} className="flex-1 rounded-full [&>div]:rounded-full" label={`${name} completion`} />
                  <span className="text-sm font-bold tabular-nums">{pct}%</span>
                  <span className="text-xs tabular-nums text-muted">
                    {earnedHere.length}/{all.length} earned
                  </span>
                </div>
              )}
            </header>
            <ul className="divide-y divide-line">
              {list.map((t) => (
                <Row key={t.id} t={t} gameSlug={gameSlug} at={earned?.get(t.id)} tracked={!!earned} ownerLabel={ownerLabel} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/**
 * One trophy: icon, name and description, then lined-up columns for status, rarity and grade.
 * Earned rows are pale red, unearned ones white, and earned medals get a soft red glow.
 */
function Row({ t, gameSlug, at, tracked, ownerLabel }: { t: T; gameSlug: string; at?: Date; tracked: boolean; ownerLabel?: string }) {
  const dim = tracked && !at;
  const href = t.slug ? trophyHref(gameSlug, t.slug) : `/trophies/${t.id}`;
  const rarity = t.earnedRate != null ? rarityOf(t.earnedRate) : null;
  const placeholder = (
    <div className="row-span-2 flex h-10 w-10 shrink-0 items-center justify-center self-start border border-line bg-surface-2 sm:row-span-1 sm:self-center">
      <TrophyIcon type={t.type} size={22} dim={dim} />
    </div>
  );
  const tags = t.missable || t.online || t.hidden || !!t._count?.tips;
  return (
    // Hidden trophies you haven't earned keep their icon and text covered until you reveal them.
    <Spoiler hidden={t.hidden && !at}>
      <li
        className={clsx(
          "grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-4 py-2.5 sm:gap-x-4",
          tracked ? "sm:grid-cols-[2.5rem_minmax(0,1fr)_8.5rem_5.5rem_2.75rem]" : "sm:grid-cols-[2.5rem_minmax(0,1fr)_5.5rem_2.75rem]",
          at ? "bg-accent/[0.06]" : "bg-surface",
        )}
      >
        <SpoilerSwap concealed={placeholder}>
          {t.iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={psnImage(t.iconUrl, 40)}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className={clsx(
                "row-span-2 h-10 w-10 shrink-0 self-start border border-line bg-surface-2 object-contain sm:row-span-1 sm:self-center",
                dim && "opacity-40 grayscale",
              )}
            />
          ) : (
            placeholder
          )}
        </SpoilerSwap>

        <div className="min-w-0">
          <SpoilerSwap concealed={<RevealButton />} focusOnReveal>
            <Link href={href} className="group block">
              <div className="font-semibold leading-snug group-hover:underline group-hover:underline-offset-4">{t.name}</div>
              <div className="text-sm leading-snug text-muted">{t.description}</div>
            </Link>
          </SpoilerSwap>
          {tags && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {t.missable && <span className="chip min-h-5 border-bad/50 text-bad">Missable</span>}
              {t.online && <span className="chip min-h-5 border-rare/50 text-rare">Online</span>}
              {t.hidden && (
                <SpoilerSwap concealed={null}>
                  <span className="chip min-h-5">Hidden</span>
                </SpoilerSwap>
              )}
              {!!t._count?.tips && (
                <Link href={`${href}#tips`} className="chip min-h-5 hover:text-text">
                  {t._count.tips} tip{t._count.tips === 1 ? "" : "s"}
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Status and rarity: their own columns on wider screens, a line under the name on phones. */}
        <div className="col-start-2 flex items-center gap-4 sm:contents">
          {tracked && (
            <div className="flex flex-col items-start gap-0.5 sm:items-center">
              {at ? (
                <>
                  <span className="inline-flex items-center gap-1 rounded-md border border-accent/40 bg-surface px-2 py-0.5 text-xs font-semibold text-accent-text">
                    <CheckIcon size={13} /> Earned
                  </span>
                  {/* The earned time stays in the row. */}
                  <span className="text-center text-[11px] tabular-nums text-muted">
                    <LocalTime date={at} />
                  </span>
                </>
              ) : (
                <span className="rounded-md border border-line bg-surface-2 px-2 py-0.5 text-xs text-muted" title={ownerLabel ? `${ownerLabel} hasn't earned this` : undefined}>
                  Not earned
                </span>
              )}
            </div>
          )}
          <div className="leading-tight sm:text-center" title={t.earnedRate == null ? "PSN hasn't reported an earn rate yet" : `${t.earnedRate.toFixed(1)}% of players have this`}>
            {rarity ? (
              <>
                <div className="text-sm font-bold tabular-nums">{t.earnedRate!.toFixed(1)}%</div>
                <div className={clsx("text-[10px] font-semibold uppercase tracking-wide", RARITY_TEXT[rarity.key])}>{rarity.label}</div>
              </>
            ) : (
              <div className="text-[11px] text-faint">Rarity n/a</div>
            )}
          </div>
        </div>

        <span className={clsx("relative col-start-3 row-span-2 row-start-1 flex items-center justify-center sm:col-start-auto sm:row-span-1 sm:row-start-auto", at && "medal-glow")}>
          <TrophyIcon type={t.type} size={30} dim={dim} />
          <span className="sr-only">{t.type.toLowerCase()}</span>
        </span>
      </li>
    </Spoiler>
  );
}
