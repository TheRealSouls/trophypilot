import { rateLimit } from "./rate-limit";

/**
 * Flood and spam checks shared by everything members post (threads, replies,
 * updates, comments, tips, session comments, messages). On top of each
 * action's own per-minute limit:
 *
 * - a daily cap per kind of post, so nobody can fill the database in a day;
 * - the same text twice within half an hour is refused (copy-paste spam);
 * - accounts younger than three days can include at most two links a post.
 *
 * All in memory: nothing extra is written to the database to keep track.
 */
export type PostKind = "thread" | "reply" | "update" | "comment" | "tip" | "session-comment" | "message";

const DAILY: Record<PostKind, number> = {
  thread: 15,
  reply: 150,
  update: 25,
  comment: 150,
  tip: 40,
  "session-comment": 60,
  message: 500,
};

const DAY = 24 * 60 * 60_000;
const REPEAT_MS = 30 * 60_000;
const NEW_ACCOUNT_MS = 3 * DAY;
const NEW_ACCOUNT_LINKS = 2;

const g = globalThis as unknown as { __tpRecentPosts?: Map<string, number> };
const recent = (g.__tpRecentPosts ??= new Map());

const normalise = (text: string) => text.toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "").trim();

/** Null when the post may go ahead, otherwise what to tell the member. */
export async function spamCheck(user: { id: string; createdAt: Date }, kind: PostKind, text: string): Promise<string | null> {
  if (!(await rateLimit(`daily-${kind}`, DAILY[kind], DAY, user.id))) {
    return "That's the most of these one member can post in a day. You can post again tomorrow.";
  }
  const body = normalise(text);
  // Short replies ("thanks!", "gg") are fine to repeat.
  if (body.length >= 20) {
    const key = `${user.id}:${kind}:${body.slice(0, 300)}`;
    const now = Date.now();
    const last = recent.get(key);
    if (last && now - last < REPEAT_MS) return "You've just posted exactly that. Say something new, or wait a while before posting it again.";
    if (recent.size > 20_000) recent.clear();
    recent.set(key, now);
  }
  if (Date.now() - user.createdAt.getTime() < NEW_ACCOUNT_MS) {
    const links = text.match(/https?:\/\/|www\./gi)?.length ?? 0;
    if (links > NEW_ACCOUNT_LINKS) return `New accounts can include up to ${NEW_ACCOUNT_LINKS} links a post for their first three days.`;
  }
  return null;
}
