import { db, expect, expectNotFound, memberId, resetMembers, test, TEST_SECTION, visit, type Member } from "./support";

/**
 * Members dealing with each other outside Messages: forum threads and replies, reactions, community
 * updates and comments, follows, blocks, private profiles, reports, and a member disappearing
 * part-way through. Every page has to load without an error screen, console error or server error
 * (checked by the fixture), and refusals have to say why.
 */

test.beforeEach(resetMembers);

async function startThread(m: Member, title: string, body: string) {
  await visit(m.page, `/forums/new?section=${TEST_SECTION}`);
  await m.page.locator("#t-title").fill(title);
  await m.page.locator("#t-body").fill(body);
  await m.page.getByRole("button", { name: "Post thread" }).click();
  await m.page.waitForURL(/\/forums\/thread\/[a-z0-9]+/);
  return new URL(m.page.url()).pathname;
}

async function replyInThread(m: Member, url: string, body: string) {
  await visit(m.page, url);
  await m.page.locator("#reply").fill(body);
  await m.page.getByRole("button", { name: "Post reply" }).click();
  await expect(m.page.getByText(body)).toBeVisible();
}

test("forums: a thread, replies and reactions between members, then one of them disappears", async ({ signIn }) => {
  const alice = await signIn("alice");
  const bob = await signIn("bob");
  const dave = await signIn("dave");
  const url = await startThread(alice, "Best route for the speedrun trophy", "Has anyone found a faster route than the one in the guide?");

  await replyInThread(bob, url, "The skip in chapter 3 saves about two minutes.");
  // Bob reacts to Alice's opening post; it sticks after a reload.
  await bob.page.getByRole("button", { name: "React" }).first().click();
  await bob.page.getByRole("button", { name: "thumbs up" }).click();
  await expect(bob.page.locator("button[aria-pressed=true]", { hasText: "👍" })).toBeVisible();
  await expect.poll(async () => db().reaction.count({ where: { userId: await memberId("bob"), targetType: "FORUM_POST" } })).toBe(1);
  await visit(bob.page, url);
  await expect(bob.page.locator("button[aria-pressed=true]", { hasText: "👍" })).toBeVisible();

  // Alice sees the reply and can open Bob's profile and forum profile from it.
  await visit(alice.page, url);
  await expect(alice.page.getByText("The skip in chapter 3")).toBeVisible();
  expect(await visit(alice.page, "/forums/user/st_bob")).toBe(200);
  expect(await visit(alice.page, "/u/st_bob")).toBe(200);

  // Dave replies, then his account is deleted: the thread still loads, his reply shows as from a deleted user.
  await replyInThread(dave, url, "Dave was here before deleting his account.");
  await db().user.delete({ where: { id: await memberId("dave") } });
  expect(await visit(alice.page, url)).toBe(200);
  await expect(alice.page.getByText("Dave was here before deleting his account.")).toBeVisible();
  await expect(alice.page.getByText("deleted user").first()).toBeVisible();
  await expectNotFound(alice.page, "/forums/user/st_dave");
  expect(await visit(alice.page, `/forums/${TEST_SECTION}`)).toBe(200);

  // Reporting a reply works from the thread.
  await visit(alice.page, url);
  await alice.page.getByRole("button", { name: /Report/ }).first().click();
  await alice.page.getByRole("button", { name: "Send report" }).click();
  await expect.poll(async () => db().report.count({ where: { reporterId: await memberId("alice") } })).toBe(1);
  await db().report.deleteMany({ where: { reporterId: await memberId("alice") } });
});

test("community updates: comments, then a block part-way through", async ({ signIn }) => {
  const alice = await signIn("alice");
  const bob = await signIn("bob");

  await visit(alice.page, "/community");
  await alice.page.locator("#post-body").fill("Just got the platinum in Glacier Run!");
  await alice.page.getByRole("button", { name: "Post", exact: true }).click();
  await expect(alice.page.getByText("Just got the platinum in Glacier Run!")).toBeVisible();
  const post = await db().post.findFirstOrThrow({ where: { authorId: await memberId("alice") } });

  // Bob comments.
  await visit(bob.page, "/community");
  await bob.page.locator(`#comment-${post.id}`).fill("Congratulations!");
  await bob.page.getByRole("button", { name: "Comment" }).first().click();
  await expect(bob.page.getByText("Congratulations!")).toBeVisible();

  // Alice blocks Bob from his profile. His next comment is refused with a reason, and the page still works.
  await visit(alice.page, "/u/st_bob");
  await alice.page.getByRole("button", { name: "Block", exact: true }).click();
  await expect(alice.page.getByRole("button", { name: "Unblock", exact: true })).toBeVisible();
  await bob.page.locator(`#comment-${post.id}`).fill("Another comment after the block");
  await bob.page.getByRole("button", { name: "Comment" }).first().click();
  await expect(bob.page.getByText("You can't comment on this update.")).toBeVisible();
  expect(await visit(bob.page, "/community")).toBe(200);

  // A block also stops follows: Bob's Follow does nothing, without an error.
  await visit(bob.page, "/u/st_alice");
  await bob.page.getByRole("button", { name: "Follow", exact: true }).click();
  await expect(bob.page.getByRole("button", { name: "Follow", exact: true })).toBeVisible();
  expect(await db().follow.count({ where: { followerId: await memberId("bob") } })).toBe(0);
  // And Bob can't message her.
  await visit(bob.page, "/messages?to=st_alice");
  await bob.page.locator("#msg-body").fill("Hello?");
  await bob.page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(bob.page.getByText("st_alice isn't accepting messages.")).toBeVisible();

  // Alice unblocks; Bob can comment again.
  await visit(alice.page, "/u/st_bob");
  await alice.page.getByRole("button", { name: "Unblock", exact: true }).click();
  await expect(alice.page.getByRole("button", { name: "Block", exact: true })).toBeVisible();
  await visit(bob.page, "/community");
  await bob.page.locator(`#comment-${post.id}`).fill("Friends again");
  await bob.page.getByRole("button", { name: "Comment" }).first().click();
  await expect(bob.page.getByText("Friends again")).toBeVisible();
});

test("private and friends-only profiles, viewed from everywhere a name links", async ({ signIn }) => {
  const alice = await signIn("alice");
  const carol = await signIn("carol");
  const url = await startThread(alice, "Thread by a member who goes private", "Opening post before going private.");

  // Alice makes her profile friends-only, through Settings.
  await visit(alice.page, "/settings");
  await alice.page.locator('input[name="profileVisibility"][value="FRIENDS"]').check();
  await alice.page.getByRole("button", { name: "Save privacy" }).click();
  await expect.poll(async () => (await db().user.findUniqueOrThrow({ where: { id: await memberId("alice") } })).profileVisibility).toBe("FRIENDS");

  // Carol follows the name in the thread to Alice's forum profile, then her main profile: a friendly notice, not an error.
  await visit(carol.page, url);
  await carol.page.getByRole("link", { name: "st_alice" }).first().click();
  await carol.page.waitForURL("**/forums/user/st_alice**");
  await visit(carol.page, "/u/st_alice");
  await expect(carol.page.getByText("This profile is friends-only")).toBeVisible();

  // The other places that show a member work too.
  expect(await visit(carol.page, "/compare?a=st_carol&b=st_alice")).toBe(200);
  expect(await visit(carol.page, "/forums/user/st_alice")).toBe(200);
  expect(await visit(carol.page, "/leaderboards?scope=global&find=st_alice")).toBe(200);
  expect(await visit(carol.page, "/search?q=st_alice")).toBe(200);

  // Fully private, and Alice herself still sees everything.
  await db().user.update({ where: { id: await memberId("alice") }, data: { profileVisibility: "PRIVATE" } });
  await visit(carol.page, "/u/st_alice");
  await expect(carol.page.getByText("This profile is private")).toBeVisible();
  expect(await visit(alice.page, "/u/st_alice")).toBe(200);
  await expect(alice.page.getByText("This profile is private")).toHaveCount(0);

  // Messaging still follows her message setting, not her profile setting.
  await visit(carol.page, "/messages?to=st_alice");
  await carol.page.locator("#msg-body").fill("Can I still message you?");
  await carol.page.getByRole("button", { name: "Send", exact: true }).click();
  await carol.page.waitForURL(/\/messages\/[a-z0-9]+$/);
});

test("names that don't exist, anywhere a name is looked up", async ({ signIn }) => {
  const alice = await signIn("alice");
  for (const path of ["/u/st_nobody_here", "/forums/user/st_nobody_here"]) await expectNotFound(alice.page, path);
  for (const path of [
    "/compare?a=st_alice&b=st_nobody_here",
    "/compare?a=st_alice&b=",
    "/leaderboards?scope=global&find=st_nobody_here",
    "/search?q=st_nobody_here",
    "/messages?to=st_nobody_here",
  ]) {
    expect(await visit(alice.page, path), path).toBe(200);
  }
  // Odd input in the URL never breaks a page.
  for (const path of ["/compare?a=%25&b=%E2%9C%93", "/search?q=%25%25", "/u/%E2%9C%93", "/leaderboards?find=%25"]) {
    expect(await visit(alice.page, path), path).toBeLessThan(500);
  }
});
