/**
 * Staff roles, from most to least access:
 *
 * - OWNER: everything, including appointing admins and permanently deleting accounts.
 * - ADMIN: runs the site (forum sections and rules, trophy lists, game data) and appoints moderators.
 * - MODERATOR: looks after the community: reports, guide reviews, online flags, warnings and short suspensions.
 *
 * Every check happens on the server; these are the only definitions.
 */
export type Role = "USER" | "MODERATOR" | "ADMIN" | "OWNER";
type WithRole = { role: string } | null | undefined;

const RANK: Record<string, number> = { USER: 0, MODERATOR: 1, ADMIN: 2, OWNER: 3 };
const rank = (u: WithRole) => RANK[u?.role ?? "USER"] ?? 0;

export const isStaff = (u: WithRole) => rank(u) >= 1;
export const isAdmin = (u: WithRole) => rank(u) >= 2;
export const isOwner = (u: WithRole) => rank(u) >= 3;

/** Longest suspension a moderator can give; admins and the owner can go further. */
export const MODERATOR_MAX_SUSPEND_DAYS = 7;

/** Who may give someone a role: the owner appoints admins, admins appoint moderators. */
export function canSetRole(actor: WithRole, target: WithRole, to: Role) {
  if (!isAdmin(actor) || rank(target) >= rank(actor)) return false;
  if (to === "OWNER") return false;
  if (to === "ADMIN") return isOwner(actor);
  return true;
}

/** Staff can act on members below them only (a moderator can't suspend an admin). */
export const outranks = (actor: WithRole, target: WithRole) => rank(actor) > rank(target);

/** The badge next to a staff member's name. */
export const STAFF_BADGES: Record<string, { label: string; className: string }> = {
  OWNER: { label: "Owner", className: "border-gold/60 bg-gold/10 text-gold" },
  ADMIN: { label: "Administrator", className: "border-accent-text/60 bg-accent/10 text-accent-text" },
  MODERATOR: { label: "Moderator", className: "border-plat/60 bg-plat/10 text-plat" },
};
