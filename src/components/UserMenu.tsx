"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { logout } from "@/actions/auth";
import { ChevronDownIcon } from "./icons";

/**
 * Profile button in the navbar (avatar, name, chevron) with a dropdown of
 * account options. A disclosure (button + list of links), which screen
 * readers and keyboards handle without extra arrow-key rules. Closes on
 * outside click, tabbing away, Escape (focus goes back to the button) and
 * navigation.
 */
export function UserMenu({
  avatar,
  name,
  username,
  pending,
  unread,
  admin,
  onLogout,
}: {
  avatar: React.ReactNode;
  name: string;
  username: string;
  /** Pending friend requests. */
  pending: number;
  /** Conversations with unread messages. */
  unread: number;
  admin: boolean;
  /** Called after signing out, so the navbar updates without a full reload. */
  onLogout?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const path = usePathname();

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      ref.current?.querySelector("button")?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const count = (n: number) => (n > 0 ? <span className="ml-auto rounded-md bg-accent px-1.5 text-xs font-bold text-white">{n}</span> : null);
  const alerts = pending + unread;
  const items: [string, string, React.ReactNode?][] = [
    [`/u/${username}`, "My profile"],
    ["/messages", "Messages", count(unread)],
    ["/friends", "Friends", count(pending)],
    ["/clubs", "Clubs"],
    ["/compare", "Compare hunters"],
    ["/guides/new", "Write a guide"],
    ["/settings", "Settings and PSN"],
    ...(admin ? ([["/forums/manage", "Manage forums"]] as [string, string][]) : []),
  ];

  return (
    <div
      ref={ref}
      className="relative"
      // Tabbing out of the menu closes it, so it never hangs open behind the focus.
      onBlur={(e) => {
        if (open && !ref.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="account-menu"
        aria-label={`Account menu for ${name}${unread > 0 ? `, ${unread} unread conversation${unread === 1 ? "" : "s"}` : ""}${pending > 0 ? `, ${pending} friend request${pending === 1 ? "" : "s"}` : ""}`}
        className="flex items-center gap-2.5 rounded-lg border border-line bg-surface py-1 pl-1 pr-2.5 hover:border-faint"
      >
        <span className="relative">
          {avatar}
          {alerts > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
              {alerts}
            </span>
          )}
        </span>
        <span className="hidden max-w-40 truncate text-sm font-semibold sm:inline">{name}</span>
        <ChevronDownIcon size={16} className={clsx("text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <nav id="account-menu" aria-label="Account" className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-[var(--shadow-raised)]">
          {items.map(([href, label, extra]) => (
            <Link key={href} href={href} className="flex items-center px-4 py-2.5 text-sm hover:bg-surface-2">
              {label}
              {extra}
            </Link>
          ))}
          <form
            action={async () => {
              await logout();
              onLogout?.();
            }}
            className="mt-1 border-t border-line pt-1"
          >
            <button className="w-full px-4 py-2.5 text-left text-sm text-muted hover:bg-surface-2 hover:text-text">
              Log out
            </button>
          </form>
        </nav>
      )}
    </div>
  );
}
