"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Avatar } from "./ui";
import { SyncMyTrophies } from "./SyncMyTrophies";
import { UserMenu } from "./UserMenu";

export type Me = {
  username: string;
  name: string;
  avatar: string | null;
  avatarUrl: string | null;
  avatarHue: number;
  psnVerified: boolean;
  admin: boolean;
  pending: number;
  unread: number;
  theme: "light" | "dark";
};

const STORE = "tp:me";
const THEME = "tp:theme";
const MARKER = "tp_signed_in";
/** Refetch at most this often while browsing (sign in and out always refetch). */
const FRESH_MS = 30_000;

/** undefined while we don't know yet, null when signed out. */
const Ctx = createContext<{ me: Me | null | undefined; reload: () => Promise<void> }>({ me: undefined, reload: async () => {} });

export const useMe = () => useContext(Ctx);

const marker = () => document.cookie.match(new RegExp(`(?:^|; )${MARKER}=([^;]*)`))?.[1] ?? "";

/**
 * Light or dark, applied straight to the page and remembered on this device.
 * The inline script in the layout applies it again before the first paint of
 * the next page, so there's no flash.
 */
export function applyTheme(theme: string) {
  const t = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "dark" ? "#0f1216" : "#ffffff");
  try {
    if (t === "dark") localStorage.setItem(THEME, t);
    else localStorage.removeItem(THEME);
  } catch {
    // Storage blocked: the theme still applies to this page.
  }
}

/** Set while a theme change is being saved, so an older answer from /api/me can't switch it back. */
let savingTheme = false;
export async function saveTheme(theme: string, save: () => Promise<unknown>) {
  savingTheme = true;
  applyTheme(theme);
  try {
    await save();
  } finally {
    savingTheme = false;
  }
}

/** Runs before the page paints (see layout.tsx). Kept tiny and dependency free. */
export const THEME_BOOT = `try{if(localStorage.getItem("${THEME}")==="dark")document.documentElement.dataset.theme="dark"}catch(e){}`;

/**
 * The signed-in member, fetched from /api/me after the page loads. The last
 * answer is kept on this device, so returning visitors see their own navbar
 * straight away; it's refreshed when they sign in or out and every so often
 * as they move between pages.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const path = usePathname();
  const last = useRef({ at: 0, marker: "" });

  useLayoutEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      // Only trust the copy if the sign-in hasn't changed since it was saved.
      if (raw) {
        const saved = JSON.parse(raw) as { marker: string; me: Me | null };
        if (saved.marker === marker()) setMe(saved.me);
      }
    } catch {
      // Nothing usable saved.
    }
  }, []);

  const reload = useCallback(async () => {
    const m = marker();
    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      if (!res.ok) return;
      const { user } = (await res.json()) as { user: Me | null };
      last.current = { at: Date.now(), marker: m };
      setMe(user);
      if (!savingTheme) applyTheme(user?.theme ?? "light");
      try {
        localStorage.setItem(STORE, JSON.stringify({ marker: m, me: user }));
      } catch {
        // Fine: we'll just fetch again next time.
      }
    } catch {
      // Offline or the server is busy: keep what we have.
    }
  }, []);

  useEffect(() => {
    if (last.current.marker !== marker() || Date.now() - last.current.at > FRESH_MS) void reload();
  }, [path, reload]);

  return <Ctx.Provider value={{ me, reload }}>{children}</Ctx.Provider>;
}

/** The account end of the navbar: sync button and profile menu, or log in and sign up. */
export function NavAccount() {
  const { me, reload } = useMe();
  if (me === undefined) return <span className="block h-[38px] w-[120px] rounded-lg bg-surface-2" aria-hidden />;
  if (!me)
    return (
      <>
        <Link href="/login" className="btn-ghost">
          Log in
        </Link>
        <Link href="/register" className="btn-primary hidden sm:inline-flex">
          Sign up
        </Link>
      </>
    );
  return (
    <>
      {me.psnVerified && <SyncMyTrophies />}
      <UserMenu
        avatar={<Avatar name={me.name} hue={me.avatarHue} url={me.avatarUrl} avatar={me.avatar} size={30} className="rounded-md" />}
        name={me.name}
        username={me.username}
        pending={me.pending}
        unread={me.unread}
        admin={me.admin}
        onLogout={reload}
      />
    </>
  );
}

/** Shows children only to signed-in members (or only to visitors with `signedOut`). */
export function SignedIn({ children, signedOut, fallback = null }: { children: ReactNode; signedOut?: boolean; fallback?: ReactNode }) {
  const { me } = useMe();
  if (me === undefined) return <>{fallback}</>;
  return <>{!!me !== !!signedOut ? children : fallback}</>;
}
