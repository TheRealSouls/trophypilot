import Link from "next/link";
import clsx from "clsx";
import { TrophyIcon } from "./TrophyIcon";
import { RevealButton, Spoiler, SpoilerSwap } from "./client";
import { ProgressBar, RarityBadge } from "./ui";
import { TROPHY_ORDER, TROPHY_POINTS, type TrophyType } from "@/lib/trophies";
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

export function TrophyList({
  gameSlug,
  groups,
  trophies,
  earned,
  ownerLabel,
  sort = "default",
}: {
  /** The list's game, for trophy addresses (/games/<game>/<trophy>). */
  gameSlug: string;
  groups: G[];
  trophies: T[];
  /** trophyId → earned date; omit when there's no progress to show. */
  earned?: Map<string, Date>;
  ownerLabel?: string;
  sort?: "default" | "rarity" | "type";
}) {
  const sorted = [...trophies].sort((a, b) => {
    // Unknown rarity sorts last.
    if (sort === "rarity") return (a.earnedRate ?? 101) - (b.earnedRate ?? 101);
    if (sort === "type") return TROPHY_ORDER[a.type] - TROPHY_ORDER[b.type] || a.psnTrophyId - b.psnTrophyId;
    return a.psnTrophyId - b.psnTrophyId;
  });

  // Base game first ("default" sorts after "001" as a string), then DLC in release order.
  const orderedGroups = [...groups].sort((a, b) => Number(a.isDlc) - Number(b.isDlc));

  return (
    <div className="space-y-6">
      {orderedGroups.map((g) => {
        const list = sorted.filter((t) => t.groupId === g.id);
        if (!list.length) return null;
        const count = (type: string) => list.filter((t) => t.type === type).length;
        const earnedHere = earned ? list.filter((t) => earned.has(t.id)) : [];
        const total = list.reduce((s, t) => s + TROPHY_POINTS[t.type as TrophyType], 0);
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
                    {earnedHere.length}/{list.length}
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
