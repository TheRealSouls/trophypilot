"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMe } from "./session";
import { Notice } from "./ui";
import { ArrowRightIcon, TrophyLineIcon } from "./icons";

/** The home page's main button, which depends on who's looking (the page itself is cached for everyone). */
export function HomeCta() {
  const { me } = useMe();
  const cta =
    me === undefined || me === null
      ? { href: "/register", label: "Create a free account" }
      : !me.psnVerified
        ? { href: "/settings#psn", label: "Link your PSN account" }
        : { href: `/u/${me.username}`, label: "View my trophies" };
  return (
    <Link href={cta.href} className="btn-primary px-5 py-3 text-[15px]">
      <TrophyLineIcon size={18} />
      {cta.label}
      <ArrowRightIcon size={16} />
    </Link>
  );
}

/** "Your account has been deleted", after deleting it (/?deleted=1). */
export function DeletedNotice() {
  const deleted = useSearchParams().get("deleted");
  if (!deleted) return null;
  return <Notice tone="good">Your account and all of its data have been deleted.</Notice>;
}
