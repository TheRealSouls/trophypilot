import clsx from "clsx";
import { STAFF_BADGES } from "@/lib/roles";

/** Owner (gold), Administrator (red) or Moderator (blue) next to a name; nothing for members. */
export function StaffBadge({ role, className }: { role: string | null | undefined; className?: string }) {
  const b = role ? STAFF_BADGES[role] : undefined;
  if (!b) return null;
  return <span className={clsx("chip font-semibold", b.className, className)}>{b.label}</span>;
}

/** For members who've published at least one guide. */
export function GuideCreatorBadge({ className }: { className?: string }) {
  return <span className={clsx("chip border-good/50 text-good", className)}>Guide creator</span>;
}
