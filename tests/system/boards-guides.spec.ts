import { db, expect, memberId, resetMembers, test, visit } from "./support";

/**
 * The Following leaderboard (you and the members you follow) and the My drafts tab on Guides:
 * both show only what the signed-in member should see.
 */

test.beforeEach(resetMembers);

test("the Following board shows the members you follow, and not private ones", async ({ signIn }) => {
  const game = await db().game.findFirstOrThrow({ select: { id: true } });
  const bob = await memberId("bob");
  const carol = await memberId("carol");
  // Bob and Carol have trophies, so they can rank; Alice only follows Bob.
  for (const userId of [bob, carol]) {
    await db().userGame.create({ data: { userId, gameId: game.id, progress: 20, earnedCount: 4, earnedBronze: 4 } });
  }
  const alice = await signIn("alice");
  const board = "/leaderboards?scope=following&period=all";

  await visit(alice.page, board);
  await expect(alice.page.getByText("Nobody you follow has earned trophies")).toBeVisible();

  await db().follow.create({ data: { followerId: await memberId("alice"), followingId: bob } });
  await visit(alice.page, board);
  await expect(alice.page.locator('a[href="/u/st_bob"]').first()).toBeVisible();
  await expect(alice.page.locator('a[href="/u/st_carol"]')).toHaveCount(0);

  // A private profile stays off the board even for followers.
  await db().user.update({ where: { id: bob }, data: { profileVisibility: "PRIVATE" } });
  await visit(alice.page, board);
  await expect(alice.page.locator('a[href="/u/st_bob"]')).toHaveCount(0);
});

test("My drafts lists only your unfinished guides, and opens them for editing", async ({ signIn }) => {
  const game = await db().game.findFirstOrThrow({ select: { id: true } });
  const author = await memberId("alice");
  const guide = (slug: string, title: string, status: string) =>
    db().guide.create({ data: { slug, title, status, gameId: game.id, authorId: author, summary: "Test guide.", difficulty: 3, hoursEstimate: 5 } });
  await guide("st-draft-guide", "Half-written roadmap", "DRAFT");
  await guide("st-sent-back-guide", "Roadmap sent back", "REJECTED");
  await guide("st-live-guide", "Finished roadmap", "PUBLISHED");

  const alice = await signIn("alice");
  await visit(alice.page, "/guides?sort=drafts");
  await expect(alice.page.getByRole("link", { name: /Half-written roadmap/ })).toHaveAttribute("href", "/guides/st-draft-guide/edit");
  await expect(alice.page.getByRole("link", { name: /Roadmap sent back/ })).toHaveAttribute("href", "/guides/st-sent-back-guide/edit");
  await expect(alice.page.getByText("Finished roadmap")).toHaveCount(0);

  // Someone else's drafts tab doesn't show Alice's drafts.
  const bob = await signIn("bob");
  await visit(bob.page, "/guides?sort=drafts");
  await expect(bob.page.getByText("No drafts")).toBeVisible();
  await expect(bob.page.getByText("Half-written roadmap")).toHaveCount(0);
});
