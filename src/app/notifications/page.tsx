import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import clsx from "clsx";
import { requireUser } from "@/lib/auth";
import { groupOf, markNotificationsSeen, NOTICE_GROUPS, notificationsFor, type NoticeGroup, type NoticeItem } from "@/lib/notifications";
import { timeAgo } from "@/lib/utils";
import { GameArt } from "@/components/art";
import { TrophyIcon } from "@/components/TrophyIcon";
import { Avatar, EmptyState, PageHeader } from "@/components/ui";
import { Seen } from "./Seen";

export const metadata: Metadata = { title: "Notifications", robots: { index: false } };

/**
 * Replies and comments on your posts, reactions, tips and ratings on your
 * guides, new followers, the trophies you earned and notices from staff,
 * newest first. Opening the page marks them read; the ones that were new keep
 * a red dot until you leave.
 */
export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const me = await requireUser("/notifications");
  const { show } = await searchParams;
  const group: NoticeGroup = show && show in NOTICE_GROUPS ? (show as NoticeGroup) : "all";
  const all = await notificationsFor(me.id);
  const since = me.notificationsSeenAt ?? me.createdAt;
  const items = group === "all" ? all : all.filter((i) => groupOf(i.kind) === group);
  const fresh = items.filter((i) => i.kind !== "trophies" && i.at > since);
  const older = items.filter((i) => !fresh.includes(i));
  // Everything shown counts as read from now on; the dots stay on this page view.
  after(() => markNotificationsSeen(me.id).catch((err) => console.error("[notifications] seen", err)));

  return (
    <div className="mx-auto max-w-3xl">
      {fresh.length > 0 && <Seen />}
      <PageHeader title="Notifications">Replies, comments and reactions to what you post, new followers, your trophies and notes from staff.</PageHeader>
      <nav aria-label="Show" className="mb-6 flex flex-wrap gap-1.5">
        {(Object.entries(NOTICE_GROUPS) as [NoticeGroup, string][]).map(([k, label]) => (
          <Link
            key={k}
            href={k === "all" ? "/notifications" : `/notifications?show=${k}`}
            aria-current={group === k ? "page" : undefined}
            className={clsx("chip min-h-8 px-3", group === k && "chip-active")}
          >
            {label}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <EmptyState title="Nothing here yet">
          {group === "staff"
            ? "Staff haven't had to remove anything of yours."
            : group === "trophies"
              ? "Sync your trophies and the ones you earn show up here."
              : "When people reply to your threads, comment on or react to your updates or follow you, it shows up here."}
        </EmptyState>
      ) : (
        <div className="space-y-8">
          {fresh.length > 0 && <List title="New" items={fresh} fresh />}
          {older.length > 0 && <List title={fresh.length ? "Earlier" : "Latest"} items={older} />}
        </div>
      )}
    </div>
  );
}

function List({ title, items, fresh = false }: { title: string; items: NoticeItem[]; fresh?: boolean }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">{title}</h2>
      <ul className="card divide-y divide-line overflow-hidden">
        {items.map((i) => (
          <li key={i.key} className={clsx("relative", fresh && "bg-accent/[0.04]")}>
            <Row item={i} fresh={fresh} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Row({ item: i, fresh }: { item: NoticeItem; fresh: boolean }) {
  const body = (
    <div className="flex items-start gap-3 px-4 py-3">
      {i.kind === "trophies" && i.game ? (
        <GameArt title={i.game.title} hue={i.game.coverHue} iconUrl={i.game.iconUrl} size="sm" className="w-10 shrink-0" />
      ) : i.kind === "staff" ? (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bad/10 text-bad" aria-hidden>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <path d="M10 2.5 3.5 5v4.5c0 4 2.8 6.9 6.5 8 3.7-1.1 6.5-4 6.5-8V5L10 2.5Z" strokeLinejoin="round" />
            <path d="M10 7v4M10 13.5v.01" />
          </svg>
        </span>
      ) : i.who ? (
        <Avatar name={i.who.name} hue={i.who.avatarHue} url={i.who.avatarUrl} avatar={i.who.avatar} size={36} />
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          {i.who && <span className="font-semibold">{i.who.name} </span>}
          <span className={clsx(i.kind === "staff" && "font-semibold")}>{i.text}</span>
        </p>
        {i.detail && <p className="mt-0.5 whitespace-pre-line text-sm text-muted">{i.detail}</p>}
        {i.trophies && (
          <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted" aria-label="Trophies earned">
            {summarise(i.trophies).map(([type, n]) => (
              <li key={type} className="inline-flex items-center gap-1">
                <TrophyIcon type={type} size={14} /> {n} {type.toLowerCase()}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-xs text-faint">{timeAgo(i.at)}</p>
      </div>
      {fresh && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="New" />}
    </div>
  );
  return i.href ? (
    <Link href={i.href} className="block hover:bg-surface-2">
      {body}
    </Link>
  ) : (
    body
  );
}

const ORDER = ["PLATINUM", "GOLD", "SILVER", "BRONZE"];
function summarise(trophies: { type: string }[]) {
  const n = new Map<string, number>();
  for (const t of trophies) n.set(t.type, (n.get(t.type) ?? 0) + 1);
  return ORDER.filter((t) => n.has(t)).map((t) => [t, n.get(t)!] as const);
}
