import { chat, db, expect, expectNoErrorPage, expectNotFound, memberId, PASSWORD, resetMembers, test, visit, type Member } from "./support";

/**
 * Messages, end to end, with two or three members in their own browsers at once. Besides the
 * everyday flow, each test changes something part-way through (messages switched off, a block,
 * someone leaving or deleting their account) and checks the others get a clear answer, never an
 * error screen. The fixture also fails the test on any page error, console error or server error.
 */

test.beforeEach(resetMembers);

const conversationUrl = /\/messages\/[a-z0-9]+$/;

async function startChat(m: Member, to: string, body: string, title?: string) {
  await visit(m.page, "/messages");
  await m.page.locator("#msg-to").fill(to);
  if (title) await m.page.locator("#msg-title").fill(title);
  await m.page.locator("#msg-body").fill(body);
  await m.page.getByRole("button", { name: "Send", exact: true }).click();
}

async function startedChat(m: Member, to: string, body: string, title?: string) {
  await startChat(m, to, body, title);
  await m.page.waitForURL(conversationUrl);
  await expect(history(m)).toContainText(body);
  return new URL(m.page.url()).pathname;
}

async function reply(m: Member, body: string) {
  const box = m.page.locator("#reply-body");
  await box.fill(body);
  // Enter sends, like a chat app.
  await box.press("Enter");
}

const history = (m: Member) => m.page.getByRole("list", { name: "Messages" });

async function setAllowMessages(m: Member, value: "EVERYONE" | "FRIENDS" | "NOBODY") {
  await visit(m.page, "/settings");
  await m.page.locator("#allowMessages").selectOption(value);
  await m.page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(m.page.getByText("Profile saved.")).toBeVisible();
  expect((await db().user.findUniqueOrThrow({ where: { id: await memberId(m.who) } })).allowMessages).toBe(value);
}

test("a private conversation: start, reply, live updates and unread markers", async ({ signIn }) => {
  const alice = await signIn("alice");
  const bob = await signIn("bob");

  const url = await startedChat(alice, "st_bob", "Hi Bob, fancy boosting the online trophies?");

  // Bob sees it as unread in his list, then opens it.
  await visit(bob.page, "/messages");
  const link = bob.page.getByRole("navigation", { name: "Conversations" }).getByRole("link").first();
  await expect(link).toContainText("st_alice");
  await expect(link).toContainText("(unread)");
  await link.click();
  await bob.page.waitForURL(url);
  await expect(history(bob)).toContainText("fancy boosting");

  // Opening it marks it read.
  await visit(bob.page, "/messages");
  await expect(bob.page.getByRole("navigation", { name: "Conversations" })).not.toContainText("(unread)");

  // Bob replies; Alice, still on the conversation, gets it without reloading.
  await visit(bob.page, url);
  await reply(bob, "Yes! Saturday evening?");
  await expect(history(bob)).toContainText("Saturday evening?");
  await expect(history(alice)).toContainText("Saturday evening?", { timeout: 45_000 });

  // The reply box cleared after sending, and the other member's name links to their profile.
  await expect(bob.page.locator("#reply-body")).toHaveValue("");
  await bob.page.getByRole("link", { name: "st_alice", exact: true }).first().click();
  await bob.page.waitForURL("**/u/st_alice");
  await expectNoErrorPage(bob.page);
});

test("the To box: unknown names, yourself, and the same person written several ways", async ({ signIn }) => {
  const alice = await signIn("carol");

  await startChat(alice, "nobody_called_this", "Hello?");
  await expect(alice.page.getByText('No member called "nobody_called_this".')).toBeVisible();

  await startChat(alice, "st_carol", "Talking to myself");
  await expect(alice.page.getByText("You can't message yourself.")).toBeVisible();

  // Username, PSN ID and different capitals for the same member: one private conversation, not an error.
  await startedChat(alice, "st_bob, BobTheHunter, ST_BOB", "Same person three ways");
  const conversations = await db().conversation.findMany({
    where: { members: { some: { userId: await memberId("carol") } } },
    include: { members: true },
  });
  expect(conversations).toHaveLength(1);
  expect(conversations[0].isGroup).toBe(false);
  expect(conversations[0].members).toHaveLength(2);

  // Writing to Bob again reuses that conversation.
  await startedChat(alice, "bobthehunter", "Second message");
  expect(await db().conversation.count({ where: { members: { some: { userId: await memberId("carol") } } } })).toBe(1);

  // Suggestions only list members who accept messages, and never yourself.
  const suggest = async (q: string) => ((await (await alice.page.request.get(`/api/members?q=${q}`)).json()) as { members: { username: string }[] }).members.map((m) => m.username);
  expect(await suggest("st_")).toEqual(expect.arrayContaining(["st_bob", "st_alice"]));
  expect(await suggest("st_")).not.toContain("st_carol");
  // A typed "_" or "%" means itself, not "any character": de_o doesn't suggest demo.
  expect(await suggest("de_o")).toEqual([]);
  expect(await suggest("%25%25")).toEqual([]);
});

test("Bob switches messages off part-way through a conversation", async ({ signIn }) => {
  const alice = await signIn("alice");
  const bob = await signIn("bob");
  const url = await chat("alice", ["bob"], "Before Bob closes his messages");
  await visit(alice.page, url);

  await setAllowMessages(bob, "NOBODY");

  // Alice, still on the open conversation, tries to reply: a clear message, no error screen.
  await reply(alice, "Are you still there?");
  await expect(alice.page.getByText("st_bob isn't accepting messages.")).toBeVisible();
  await expect(history(alice)).not.toContainText("Are you still there?");

  // The conversation still opens, with the earlier messages.
  expect(await visit(alice.page, url)).toBe(200);
  await expect(history(alice)).toContainText("Before Bob closes his messages");

  // A new message to him is refused too, and his profile has no Message button.
  await startChat(alice, "st_bob", "Trying a new conversation");
  await expect(alice.page.getByText("st_bob isn't accepting messages.")).toBeVisible();
  await visit(alice.page, "/u/st_bob");
  await expect(alice.page.getByRole("link", { name: "Message", exact: true })).toHaveCount(0);
  // Nor is he suggested in the To box any more.
  const res = await alice.page.request.get("/api/members?q=st_b");
  expect(((await res.json()) as { members: { username: string }[] }).members.map((m) => m.username)).not.toContain("st_bob");

  // Bob can still write to Alice, who accepts messages, and she sees it.
  await visit(bob.page, url);
  await reply(bob, "Sorry, closed them for a bit.");
  await expect(history(bob)).toContainText("closed them for a bit");
  await visit(alice.page, url);
  await expect(history(alice)).toContainText("closed them for a bit");

  // Back on: Alice can reply again.
  await setAllowMessages(bob, "EVERYONE");
  await visit(alice.page, url);
  await reply(alice, "Welcome back");
  await expect(history(alice)).toContainText("Welcome back");
});

test("friends-only messages, then a follow lets them through", async ({ signIn }) => {
  const alice = await signIn("alice");
  const bob = await signIn("bob");
  const url = await chat("alice", ["bob"], "First message");
  await setAllowMessages(bob, "FRIENDS");

  await visit(alice.page, url);
  await reply(alice, "Only friends now?");
  await expect(alice.page.getByText("st_bob only accepts messages from friends and people they follow.")).toBeVisible();

  // Bob follows Alice from her profile; now her messages get through.
  await visit(bob.page, "/u/st_alice");
  await bob.page.getByRole("button", { name: "Follow", exact: true }).click();
  await expect(bob.page.getByRole("button", { name: "Following", exact: true })).toBeVisible();
  await visit(alice.page, url);
  await reply(alice, "Thanks for the follow");
  await expect(history(alice)).toContainText("Thanks for the follow");
});

test("blocking from the conversation, part-way through, and unblocking", async ({ signIn }) => {
  const alice = await signIn("alice");
  const bob = await signIn("bob");
  const url = await chat("alice", ["bob"], "Hello before the block");
  await visit(alice.page, url);

  await visit(bob.page, url);
  await bob.page.getByRole("button", { name: "Block", exact: true }).click();
  await expect(bob.page.getByText("You've blocked st_alice. Unblock them to send messages.")).toBeVisible();
  await expect(bob.page.locator("#reply-body")).toHaveCount(0);

  // Alice isn't told about the block; she just can't send, and the page still works.
  await reply(alice, "Hello?");
  await expect(alice.page.getByText("st_bob isn't accepting messages.")).toBeVisible();
  expect(await visit(alice.page, url)).toBe(200);
  await startChat(alice, "st_bob", "New conversation attempt");
  await expect(alice.page.getByText("st_bob isn't accepting messages.")).toBeVisible();

  // Bob unblocks and they can talk again.
  await visit(bob.page, url);
  await bob.page.getByRole("button", { name: "Unblock", exact: true }).click();
  await expect(bob.page.locator("#reply-body")).toBeVisible();
  await visit(alice.page, url);
  await reply(alice, "Talking again");
  await expect(history(alice)).toContainText("Talking again");
});

test("leaving a conversation, and the old link afterwards", async ({ signIn }) => {
  const alice = await signIn("alice");
  const bob = await signIn("bob");
  const url = await chat("alice", ["bob"], "Message before leaving");

  await visit(alice.page, url);
  await alice.page.getByRole("button", { name: "Leave", exact: true }).click();
  await alice.page.waitForURL((u) => u.pathname === "/messages");
  await expect(alice.page.getByRole("navigation", { name: "Conversations" })).toHaveCount(0);

  // Bob, with the conversation open, replies: told she left, no error screen.
  await visit(bob.page, url);
  await expect(bob.page.getByText("nobody else (they left)")).toBeVisible();
  await reply(bob, "Are you there?");
  await expect(bob.page.getByText("The other person has left this conversation.")).toBeVisible();

  // Alice's old link is a plain "not found", not an error.
  await expectNotFound(alice.page, url);

  // Writing to Bob again starts a fresh conversation.
  const fresh = await startedChat(alice, "st_bob", "Starting over");
  expect(fresh).not.toBe(url);

  // Once Bob leaves too, the old conversation is gone for good.
  await visit(bob.page, url);
  await bob.page.getByRole("button", { name: "Leave", exact: true }).click();
  await bob.page.waitForURL((u) => u.pathname === "/messages");
  expect(await db().conversation.count({ where: { id: url.split("/").pop() } })).toBe(0);
  await expectNotFound(bob.page, url);
});

test("a member deletes their account mid-conversation", async ({ signIn }) => {
  const alice = await signIn("alice");
  const erin = await signIn("erin");
  await visit(erin.page, "/messages");
  const url = await startedChat(erin, "st_alice", "Erin here, about to leave the site");
  await visit(alice.page, url);
  await expect(history(alice)).toContainText("about to leave the site");

  await visit(erin.page, "/settings");
  await erin.page.locator("#del-password").fill(PASSWORD);
  await erin.page.locator("#del-confirm").fill("st_erin");
  await erin.page.getByRole("button", { name: "Delete my account" }).click();
  await erin.page.waitForURL((u) => u.pathname === "/");

  // Alice's conversation still opens; the message stays, from a deleted user, and replying says why it can't.
  expect(await visit(alice.page, url)).toBe(200);
  await expect(history(alice)).toContainText("about to leave the site");
  await expect(history(alice)).toContainText("deleted user");
  await reply(alice, "Bye Erin");
  await expect(alice.page.getByText("The other person has left this conversation.")).toBeVisible();
  // Her profile is gone (not found), and the conversation list still works.
  await expectNotFound(alice.page, "/u/st_erin");
  expect(await visit(alice.page, "/messages")).toBe(200);
});

test("group chats: start, a block inside the group, and someone leaving", async ({ signIn }) => {
  const alice = await signIn("alice");
  const bob = await signIn("bob");
  const carol = await signIn("carol");
  const url = await startedChat(carol, "st_alice, st_bob", "Welcome to the group", "Platinum squad");
  await expect(carol.page.getByRole("heading", { name: "Platinum squad" })).toBeVisible();
  await visit(alice.page, url);
  await expect(history(alice)).toContainText("Welcome to the group");

  // Bob has blocked Carol: her messages are hidden for him, shown for Alice.
  await db().block.create({ data: { blockerId: await memberId("bob"), blockedId: await memberId("carol") } });
  await visit(carol.page, url);
  await reply(carol, "Carol says hi to the group");
  await expect(history(carol)).toContainText("Carol says hi to the group");
  await visit(bob.page, url);
  await expect(history(bob)).toContainText("A message from someone you blocked is hidden.");
  await expect(history(bob)).not.toContainText("Carol says hi to the group");
  await visit(alice.page, url);
  await expect(history(alice)).toContainText("Carol says hi to the group");

  // Carol leaves; the group carries on without her.
  await visit(carol.page, url);
  await carol.page.getByRole("button", { name: "Leave", exact: true }).click();
  await carol.page.waitForURL((u) => u.pathname === "/messages");
  await visit(bob.page, url);
  await reply(bob, "Still here");
  await expect(history(bob)).toContainText("Still here");
  await expectNotFound(carol.page, url);
});

test("message limits, other people's conversations and signed-out visitors", async ({ signIn, browser, baseURL }) => {
  const alice = await signIn("alice");
  const carol = await signIn("carol");
  const url = await chat("alice", ["bob"], "Private between Alice and Bob");
  await visit(alice.page, url);

  // Only spaces: refused with a reason.
  await reply(alice, "   ");
  await alice.page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(alice.page.getByText("Write a message first.")).toBeVisible();

  // Too long (sent past the box's own limit): refused with a reason.
  await alice.page.locator("#reply-body").evaluate((el) => el.removeAttribute("maxlength"));
  await alice.page.locator("#reply-body").fill("x".repeat(2100));
  await alice.page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(alice.page.getByText("Keep messages under 2,000 characters.")).toBeVisible();

  // Someone who isn't in the conversation gets "not found", and so does a made-up address.
  await expectNotFound(carol.page, url);
  await expectNotFound(carol.page, "/messages/not-a-real-conversation");

  // A suspended member can read but not send.
  await db().user.update({ where: { id: await memberId("alice") }, data: { suspendedUntil: new Date(Date.now() + 86_400_000) } });
  await visit(alice.page, url);
  await reply(alice, "Can I still send?");
  await expect(alice.page.getByText(/Your account is suspended until/)).toBeVisible();

  // Signed out: sent to log in, with the way back kept.
  const guest = await browser.newContext({ baseURL });
  const page = await guest.newPage();
  await page.goto(url);
  await expect(page).toHaveURL(/\/login/);
  const api = await page.request.get("/api/messages/latest");
  expect(api.status()).toBe(401);
  await guest.close();
});
