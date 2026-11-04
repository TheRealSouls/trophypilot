import { test as base, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

/**
 * Shared pieces for the system tests: the test members, a database client for setting up
 * situations (and checking what was saved), and a fixture that signs members in, each in their
 * own browser, and fails the test on any page error, console error, server error or error page.
 */

export const PASSWORD = "system-test-password-1";

/** The test members. Their usernames start with st_ so they're easy to recognise. */
export const MEMBERS = {
  alice: { username: "st_alice" },
  bob: { username: "st_bob", psn: "BobTheHunter" },
  carol: { username: "st_carol" },
  dave: { username: "st_dave" },
  erin: { username: "st_erin" },
} as const;
export type Who = keyof typeof MEMBERS;
/**
 * Exactly these usernames. Never match test members by prefix: in a database search "_" means
 * "any one character", so "st_" also matches real members such as "stormcaller".
 */
export const TEST_USERNAMES: string[] = Object.values(MEMBERS).map((m) => m.username);
/** The forum section the tests post in (made by global-setup.ts). */
export const TEST_SECTION = "st-test-lounge";

/** Only ever a database on this computer: the tests create and delete members. */
export function testDatabaseUrl() {
  const url = process.env.SYSTEM_TEST_DATABASE_URL;
  if (!url) throw new Error("Set SYSTEM_TEST_DATABASE_URL to the local test database (see tests/system/README.md).");
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) {
    throw new Error(`System tests only run against a local database, not ${host}.`);
  }
  return url;
}

export function assertLocalSite(baseURL: string | undefined) {
  const host = new URL(baseURL ?? "http://localhost").hostname;
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) throw new Error(`System tests only run against a local server, not ${host}.`);
}

let client: PrismaClient | undefined;
export const db = () => (client ??= new PrismaClient({ datasourceUrl: testDatabaseUrl() }));

export async function memberId(who: Who) {
  return (await db().user.findUniqueOrThrow({ where: { username: MEMBERS[who].username }, select: { id: true } })).id;
}

/**
 * Puts the test members back to a clean state between tests: no conversations, blocks, follows,
 * friendships, forum threads or updates, and default settings.
 */
export async function resetMembers() {
  const users = await db().user.findMany({ where: { username: { in: TEST_USERNAMES } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  const p = db();
  await p.conversation.deleteMany({ where: { members: { some: { userId: { in: ids } } } } });
  await p.block.deleteMany({ where: { OR: [{ blockerId: { in: ids } }, { blockedId: { in: ids } }] } });
  await p.follow.deleteMany({ where: { OR: [{ followerId: { in: ids } }, { followingId: { in: ids } }] } });
  await p.friendship.deleteMany({ where: { OR: [{ requesterId: { in: ids } }, { addresseeId: { in: ids } }] } });
  await p.forumThread.deleteMany({ where: { authorId: { in: ids } } });
  await p.post.deleteMany({ where: { authorId: { in: ids } } });
  await p.user.updateMany({ where: { id: { in: ids } }, data: { allowMessages: "EVERYONE", profileVisibility: "PUBLIC", suspendedUntil: null } });
}

export type Member = { who: Who; username: string; page: Page; context: BrowserContext; problems: string[] };

/** Lines that aren't faults: missing pictures (404s) and the dev server's own chatter. */
const HARMLESS = [/status of 404/, /\[Fast Refresh\]/, /\[HMR\]/, /Download the React DevTools/, /webpack-hmr|turbopack-hmr/];

function watch(page: Page, who: Who, problems: string[]) {
  // Confirm buttons (Block, Leave, Delete) ask with window.confirm: say yes.
  page.on("dialog", (d) => void d.accept());
  page.on("pageerror", (e) => problems.push(`${who}: page error: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !HARMLESS.some((r) => r.test(m.text()))) problems.push(`${who}: console error: ${m.text().slice(0, 400)}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 500) problems.push(`${who}: ${r.status()} from ${r.request().method()} ${r.url()}`);
  });
}

let ipCounter = 0;

async function signIn(browser: Browser, baseURL: string | undefined, who: Who): Promise<Member> {
  // Each browser gets its own made-up address, so signing in many times doesn't hit the login limit.
  ipCounter++;
  const context = await browser.newContext({ baseURL, extraHTTPHeaders: { "x-forwarded-for": `10.77.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}` } });
  const page = await context.newPage();
  const problems: string[] = [];
  watch(page, who, problems);
  await page.goto("/login");
  await page.locator("#identifier").fill(MEMBERS[who].username);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  return { who, username: MEMBERS[who].username, page, context, problems };
}

/** Fails if the page shows the site's error screen. */
export async function expectNoErrorPage(page: Page) {
  await expect(page.getByText("Something broke on our side")).toHaveCount(0);
  await expect(page.getByText("Application error")).toHaveCount(0);
}

/** Opens a page and checks it loaded without an error screen. Returns the HTTP status. */
export async function visit(page: Page, path: string) {
  const res = await page.goto(path);
  await page.waitForLoadState("load");
  await expectNoErrorPage(page);
  return res?.status() ?? 0;
}

/**
 * Opens a page that should be "not found" and checks it shows the not-found screen (not an error).
 * The status can be 200: Next.js starts streaming a page before it knows the answer.
 */
export async function expectNotFound(page: Page, path: string) {
  await visit(page, path);
  await expect(page.getByText("We couldn't find that page.")).toBeVisible();
}

/**
 * A conversation made directly in the database, for tests about what happens next (the Messages
 * form itself is tested separately; it only allows a few new conversations per member every 10 minutes).
 */
export async function chat(from: Who, to: Who[], body: string, title?: string) {
  const authorId = await memberId(from);
  const others = await Promise.all(to.map(memberId));
  const now = new Date();
  const c = await db().conversation.create({
    data: {
      isGroup: to.length > 1,
      title: title ?? null,
      lastMessageAt: now,
      members: { create: [{ userId: authorId, lastReadAt: now }, ...others.map((userId) => ({ userId, lastReadAt: new Date(now.getTime() - 1000) }))] },
      messages: { create: { authorId, body, createdAt: now } },
    },
    select: { id: true },
  });
  return `/messages/${c.id}`;
}

export const test = base.extend<{ signIn: (who: Who) => Promise<Member> }>({
  signIn: async ({ browser, baseURL }, use) => {
    assertLocalSite(baseURL);
    const opened: Member[] = [];
    await use(async (who) => {
      const m = await signIn(browser, baseURL, who);
      opened.push(m);
      return m;
    });
    for (const m of opened) await expectNoErrorPage(m.page).catch(() => {});
    const problems = opened.flatMap((m) => m.problems);
    for (const m of opened) await m.context.close();
    expect(problems, "page errors, console errors or server errors while testing").toEqual([]);
  },
});

export { expect };
