"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import clsx from "clsx";

/** A conversation in the list, marked when it's the one open. */
export function ConversationLink({ href, children }: { href: string; children: ReactNode }) {
  const active = usePathname() === href;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={clsx("flex items-center gap-3 px-3 py-2.5 hover:bg-surface-2", active && "bg-surface-3")}
    >
      {children}
    </Link>
  );
}

/** On phones the list shows on /messages only; a conversation takes the whole screen. */
export function ListOnPhones({ children }: { children: ReactNode }) {
  const onList = usePathname() === "/messages";
  return <div className={clsx(!onList && "hidden lg:block")}>{children}</div>;
}
