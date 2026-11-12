/**
 * How often each plan syncs. "auto" is the background sync the cron job runs
 * for every linked account; "manual" is how soon Sync now can be pressed again.
 * Premium isn't sold yet: set a user's plan to PREMIUM in the database to try it.
 *
 * Every sync costs PSN requests from the site's one PSN token (about 2 when
 * nothing changed), so short auto intervals only scale to a limited number of
 * accounts per token.
 */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
export const DAY_MS = DAY;

export const PLANS = {
  FREE: { label: "Free", manualEveryMs: HOUR, autoEveryMs: 7 * DAY },
  PREMIUM: { label: "Premium", manualEveryMs: MINUTE, autoEveryMs: HOUR },
  // Staff accounts (any staff role, whatever their plan): Sync now whenever they like, and a daily automatic sync.
  STAFF: { label: "Staff", manualEveryMs: 0, autoEveryMs: DAY },
} as const;

/** Roles that get the Staff plan. */
export const UNLIMITED_ROLES = ["MODERATOR", "ADMIN", "OWNER"];

export type PlanId = keyof typeof PLANS;

export function planOf(user: { plan: string; role?: string | null }) {
  if (user.role && UNLIMITED_ROLES.includes(user.role)) return PLANS.STAFF;
  return PLANS[(user.plan in PLANS ? user.plan : "FREE") as PlanId];
}

/** "42 minutes", "1 hour", "6 days": for "you can sync again in …". */
export function durationText(ms: number) {
  const mins = Math.max(1, Math.ceil(ms / MINUTE));
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"}`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

/** "every hour", "every 7 days". */
export const everyText = (ms: number) => `every ${durationText(ms).replace(/^1 /, "")}`;
