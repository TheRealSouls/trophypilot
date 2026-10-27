"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import clsx from "clsx";
import { TrophyIcon } from "./TrophyIcon";
import { RevealButton, Spoiler, SpoilerSwap } from "./client";
import { ProgressBar, RarityBadge } from "./ui";
import { TROPHY_ORDER, TROPHY_POINTS, type TrophySort, type TrophyType } from "@/lib/trophies";
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

const SORTS: [TrophySort, string][] = [
  ["default", "Default order"],
  ["rarity", "Rarest first"],
  ["common", "Most common first"],
  ["type", "Grade"],
  ["earned", "Recently earned"],
];

/**
 * A game's trophies, grouped into the base game and each DLC pack, with a
 * filter bar: search, sort, earned/unearned, hidden trophies and DLC. It all
 * happens in the page, so there's no wait for the server between clicks.
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
  const [part, setPart] = useState<"all" | "base" | "dlc">("all");
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
  const filtered = visible.length !== trophies.length;
  const chip = (active: boolean) => clsx("chip min-h-7 cursor-pointer", active && "chip-active");

  return (
    <div className="space-y-4">
      {trophies.length > 0 && (
        <div className="card space-y-3 p-3 sm:p-4" role="search" aria-label="Filter trophies">
          <div className="flex flex-wrap gap-2">
            <label className="relative min-w-48 flex-1">
              <span className="sr-only">Search trophies</span>
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search trophies…"
                className="input py-2"
              />
            </label>
            <label>
              <span className="sr-only">Sort trophies</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as TrophySort)} className="input w-auto py-2">
                {SORTS.filter(([k]) => k !== "earned" || earned).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            {earned && (
              <>
                {(
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
                <button type="button" aria-pressed={unearnedFirst} onClick={() => setUnearnedFirst(!unearnedFirst)} className={chip(unearnedFirst)}>
                  Unearned first
                </button>
                <span className="mx-1 h-4 w-px bg-line" aria-hidden />
              </>
            )}
            {anyHidden && (
              <button type="button" aria-pressed={hideHidden} onClick={() => setHideHidden(!hideHidden)} className={chip(hideHidden)}>
                Hide hidden trophies
              </button>
            )}
            {hasDlc &&
              (
                [
                  ["all", "Base game and DLC"],
                  ["base", "Base game only"],
                  ["dlc", "DLC only"],
                ] as ["all" | "base" | "dlc", string][]
              ).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={part === k} onClick={() => setPart(k)} className={chip(part === k)}>
                  {l}
                </button>
              ))}
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

      {orderedGroups.map((g) => {
        const all = trophies.filter((t) => t.groupId === g.id);
        const list = visible.filter((t) => t.groupId === g.id);
        if (!list.length) return null;
        const count = (type: string) => all.filter((t) => t.type === type).length;
        const earnedHere = earned ? all.filter((t) => earned.has(t.id)) : [];
        const total = all.reduce((s, t) => s + TROPHY_POINTS[t.type as TrophyType], 0);
        const got = earnedHere.reduce((s, t) => s + TROPHY_POINTS[t.type as TrophyType], 0);
        return (
          <section key={g.id} className="card" aria-label={g.name}>
            <header className="flex flex-wrap items-center gap-3 border-b border-line bg-surface-2 px-4 py-2.5">
              <h3 className="text-sm font-bold">{g.isDlc ? g.name : "Base game"}</h3>
              {g.isDlc && <span className="chip border-very/50 text-very">DLC</span>}
              {g.isDlc && g.releaseDate && <span className="text-xs text-muted">Released {formatDate(g.releaseDate)}</span>}
              <div className="ml-auto flex items-center gap-3 text-xs text-muted">
                {(["PLATINUM", "GOLD", "SILVER", "BRONZE"] as const).map((t) =>
                  count(t) ? (
                    <span key={t} className="inline-flex items-center gap-1">
                      <TrophyIcon type={t} size={14} /> {count(t)}
                    </span>
                  ) : null,
                )}
              </div>
              {earned && (
                <div className="flex w-full items-center gap-3">
                  <ProgressBar value={total ? (got / total) * 100 : 0} className="flex-1" label={`${g.isDlc ? g.name : "Base game"} completion`} />
                  <span className="text-xs tabular-nums text-muted">
                    {earnedHere.length}/{all.length}
                  </span>
                </div>
              )}
            </header>
            <ul className="divide-y divide-line">
              {list.map((t) => {
                const at = earned?.get(t.id);
                const dim = !!earned && !at;
                const placeholder = (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center border border-line bg-surface-2">
                    <TrophyIcon type={t.type} size={24} dim={dim} />
                  </div>
                );
                return (
                  // Hidden trophies you haven't earned keep their icon and text covered until you reveal them.
                  <Spoiler key={t.id} hidden={t.hidden && !at}>
                    <li className={clsx("flex items-start gap-4 px-4 py-3", at && "bg-surface-2/60")}>
                      <SpoilerSwap concealed={placeholder}>
                        {t.iconUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={psnImage(t.iconUrl, 44)}
                            alt=""
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            className={clsx("h-11 w-11 shrink-0 border border-line bg-surface-2 object-contain", dim && "opacity-40 grayscale")}
                          />
                        ) : (
                          placeholder
                        )}
                      </SpoilerSwap>
                      <div className="min-w-0 flex-1">
                        <SpoilerSwap concealed={<RevealButton />} focusOnReveal>
                          <Link href={t.slug ? trophyHref(gameSlug, t.slug) : `/trophies/${t.id}`} className="group block">
                            <div className="font-semibold group-hover:underline group-hover:underline-offset-4">{t.name}</div>
                            <div className="text-sm text-muted">{t.description}</div>
                          </Link>
                        </SpoilerSwap>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {t.missable && <span className="chip border-bad/50 text-bad">Missable</span>}
                          {t.online && <span className="chip border-rare/50 text-rare">Online</span>}
                          {t.hidden && (
                            <SpoilerSwap concealed={null}>
                              <span className="chip">Hidden</span>
                            </SpoilerSwap>
                          )}
                          {!!t._count?.tips && (
                            <Link href={`${t.slug ? trophyHref(gameSlug, t.slug) : `/trophies/${t.id}`}#tips`} className="chip hover:text-text">
                              {t._count.tips} tip{t._count.tips === 1 ? "" : "s"}
                            </Link>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5 text-right">
                        {/* Grade, big and on the right next to the rarity, so the list scans by trophy type. */}
                        <div className="flex items-center gap-2.5">
                          <RarityBadge rate={t.earnedRate} />
                          <span className="flex flex-col items-center">
                            <TrophyIcon type={t.type} size={32} dim={dim} />
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">{t.type.toLowerCase()}</span>
                          </span>
                        </div>
                        {at ? (
                          <span className="text-xs text-good">
                            Earned <LocalTime date={at} seconds />
                          </span>
                        ) : earned ? (
                          <span className="text-xs text-faint">{ownerLabel ? `${ownerLabel} hasn't earned this` : "Not earned"}</span>
                        ) : null}
                      </div>
                    </li>
                  </Spoiler>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
