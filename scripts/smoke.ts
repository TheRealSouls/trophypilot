/**
 * System smoke test: requests every page and API route, as a visitor and as
 * the demo user, and fails on server errors, error pages or wrong statuses.
 *
 *   npm run smoke                          (against http://localhost:3000)
 *   npm run smoke -- https://your-site.onrender.com
 *
 * Needs the demo login (npm run demo:user) and uses real ids from the database.
 */
import { SignJWT } from "jose";
import { prisma } from "../src/lib/db";
import { DEMO_EMAIL } from "../src/lib/demo";

try {
  process.loadEnvFile(".env");
} catch {
  // No .env file; rely on the real environment.
}

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const ERROR_MARKERS = ["Something broke on our side", "Application error", "__next_error__", "Internal Server Error"];

type Check = { path: string; status?: number; auth?: boolean; contains?: string; headers?: Record<string, string> };

async function session(userId: string) {
  const secret = new TextEncoder().encode(process.env.SESSION_SECRET);
  return new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuedAt().setExpirationTime("1h").sign(secret);
}

async function main() {
  const demo = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (!demo) throw new Error("No demo user. Run npm run demo:user first.");
  const cookie = `trophypilot_session=${await session(demo.id)}`;

  const [game, dlc, trophy, guide, member, player, session_] = await Promise.all([
    prisma.game.findFirst({ where: { trophies: { some: {} } }, select: { slug: true } }),
    prisma.trophyGroup.findFirst({ where: { isDlc: true }, select: { psnGroupId: true, game: { select: { slug: true } } } }),
    prisma.trophy.findFirst({ where: { slug: { not: null } }, select: { id: true, slug: true, game: { select: { slug: true } } } }),
    prisma.guide.findFirst({ select: { slug: true } }),
    prisma.userGame.findFirst({ where: { user: { profileVisibility: "PUBLIC" } }, select: { user: { select: { username: true } }, game: { select: { slug: true } } } }),
    prisma.psnPlayer.findFirst({ where: { hidden: false, trophiesPrivate: false }, orderBy: { points: "desc" }, select: { onlineId: true } }),
    prisma.session.findFirst({ select: { id: true } }),
  ]);
  const [section, thread] = await Promise.all([
    prisma.forumSection.findFirst({ select: { slug: true } }),
    prisma.forumThread.findFirst({ select: { id: true } }),
  ]);

  const checks: Check[] = [
    { path: "/" },
    { path: "/games" },
    { path: "/games?sort=title&page=2" },
    { path: "/games?q=call&platform=PS4" },
    { path: "/guides" },
    { path: "/guides?sort=new" },
    { path: "/leaderboards" },
    { path: "/leaderboards?scope=country&country=IE&period=all&metric=platinums" },
    { path: "/leaderboards?scope=global&period=weekly&metric=points" },
    { path: "/leaderboards?scope=global&period=monthly&metric=rare" },
    { path: "/leaderboards?scope=global&period=all&metric=completion" },
    { path: "/leaderboards?scope=global&period=all&metric=rare" },
    { path: "/api/ping", contains: "ok" },
    { path: "/api/me", contains: "\"user\":null" },
    { path: "/leaderboards?scope=friends", auth: true },
    { path: "/search?q=rainbow" },
    { path: "/search?q=call&type=games" },
    { path: "/search?q=GamingWithFlacy&type=players" },
    { path: "/sessions" },
    { path: "/forums", contains: "Forums" },
    { path: "/forums/rules", contains: "Be decent" },
    { path: "/forums/staff", contains: "Forum staff" },
    { path: "/community", contains: "Community activity" },
    { path: "/clubs", contains: "Start a club" },
    { path: "/messages", status: 307 },
    { path: "/compare" },
    { path: "/terms" },
    { path: "/privacy" },
    { path: "/contact" },
    { path: "/accessibility", contains: "WCAG" },
    { path: "/contact?topic=accessibility", contains: "Accessibility problem" },
    { path: "/contact?topic=removal", contains: "PSN Online ID" },
    { path: "/login" },
    { path: "/register" },
    { path: "/does-not-exist" },
    { path: "/psn?id=GamingWithFlacy", status: 307 },
    { path: "/api/games/search?q=south", contains: "games" },
    { path: "/api/cron/sync", status: 401 },
    { path: "/api/cron/players", status: 401 },
    { path: "/api/account/export", status: 401 },
    // Signed in as the demo user
    { path: "/settings", auth: true, contains: "shared demo account" },
    { path: "/settings", auth: true, contains: "Profile look" },
    { path: "/api/me", auth: true, contains: `"username":"${demo.username}"` },
    { path: "/friends", auth: true },
    { path: "/guides/new", auth: true, contains: "Write a trophy guide" },
    { path: "/sessions", auth: true, contains: "Host a session" },
    { path: "/forums/new", auth: true },
    { path: "/messages", auth: true, contains: "New message" },
    { path: "/community?tab=following", auth: true },
    { path: "/leaderboards", auth: true, contains: "rank" },
    { path: `/forums/user/${demo.username}` },
    { path: `/u/${demo.username}?tab=log`, auth: true },
    { path: `/u/${demo.username}?tab=saved`, auth: true },
    { path: `/u/${demo.username}?show=platinum&platform=PS5&sort=title`, auth: true },
    { path: "/forums/manage", auth: true },
    { path: `/u/${demo.username}`, auth: true },
    { path: "/api/account/export", auth: true, contains: DEMO_EMAIL },
    // Visitors are sent to log in. Streamed pages redirect in the page itself, so accept either form.
    { path: "/settings", status: 307 },
  ];
  if (game) checks.push({ path: `/games/${game.slug}` }, { path: `/games/${game.slug}?sort=rarity` });
  if (dlc) checks.push({ path: `/games/${dlc.game.slug}/dlc/${dlc.psnGroupId}` });
  if (trophy) checks.push({ path: `/games/${trophy.game.slug}/${trophy.slug}` }, { path: `/trophies/${trophy.id}`, status: 308 });
  if (guide) checks.push({ path: `/guides/${guide.slug}` });
  if (member) {
    checks.push(
      { path: `/u/${member.user.username}` },
      { path: `/u/${member.user.username}?tab=platinums` },
      { path: `/u/${member.user.username}?tab=milestones` },
      { path: `/u/${member.user.username}?tab=friends` },
      { path: `/u/${member.user.username}/${member.game.slug}` },
      { path: `/compare?a=${demo.username}&b=${member.user.username}`, auth: true },
    );
  }
  if (player) checks.push({ path: `/psn/${encodeURIComponent(player.onlineId)}` }, { path: `/psn/${encodeURIComponent(player.onlineId)}?page=2` });
  if (session_) checks.push({ path: `/sessions/${session_.id}`, contains: "Comments" });
  if (section) checks.push({ path: `/forums/${section.slug}` });
  if (thread) checks.push({ path: `/forums/thread/${thread.id}` });

  let failed = 0;
  for (const c of checks) {
    const t0 = Date.now();
    let status = 0;
    let body = "";
    try {
      const res = await fetch(BASE + c.path, { redirect: "manual", headers: c.auth ? { cookie } : {} });
      status = res.status;
      body = await res.text();
    } catch (err) {
      body = String(err);
    }
    const ms = Date.now() - t0;
    const expected = c.status ?? (c.path === "/does-not-exist" ? 404 : 200);
    const problems: string[] = [];
    // Pages that stream can't change their status after the first byte, so a missing page may return 200 with the not-found UI.
    const streamedNotFound = expected === 404 && status === 200 && body.includes("couldn&#x27;t find");
    const streamedRedirect = expected === 307 && status === 200 && body.includes("NEXT_REDIRECT");
    if (status !== expected && !streamedNotFound && !streamedRedirect) problems.push(`status ${status}, expected ${expected}`);
    const marker = ERROR_MARKERS.find((m) => body.includes(m));
    if (marker && expected < 400) problems.push(`error page ("${marker}")`);
    if (c.contains && !body.includes(c.contains)) problems.push(`missing "${c.contains}"`);
    if (problems.length) failed++;
    console.log(`${problems.length ? "FAIL" : "ok  "} ${String(ms).padStart(5)}ms ${c.auth ? "[demo] " : ""}${c.path}${problems.length ? `  <- ${problems.join("; ")}` : ""}`);
  }
  console.log(`\n${checks.length - failed}/${checks.length} passed`);
  if (failed) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
