import bcrypt from "bcryptjs";
import type { FullConfig } from "@playwright/test";
import { assertLocalSite, db, MEMBERS, PASSWORD, TEST_SECTION, TEST_USERNAMES } from "./support";

/** Recreates the test members before every run, so each run starts the same way. */
export default async function globalSetup(config: FullConfig) {
  assertLocalSite(config.projects[0]?.use.baseURL);
  const p = db();
  const old = await p.user.findMany({ where: { username: { in: TEST_USERNAMES } }, select: { id: true } });
  await p.conversation.deleteMany({ where: { members: { some: { userId: { in: old.map((u) => u.id) } } } } });
  await p.user.deleteMany({ where: { username: { in: TEST_USERNAMES } } });
  // Conversations left with nobody in them (from members deleted in earlier runs).
  await p.conversation.deleteMany({ where: { members: { none: {} } } });

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  for (const [, m] of Object.entries(MEMBERS)) {
    await p.user.create({
      data: {
        username: m.username,
        email: `${m.username}@system-test.localhost`,
        passwordHash,
        // Confirmed, so verifyFirst lets them post and message.
        emailVerifiedAt: new Date(),
        avatarHue: 200,
        ...("psn" in m ? { psn: { create: { onlineId: m.psn, verified: true } } } : {}),
      },
    });
  }
  // A forum section of their own to post in.
  await p.forumSection.upsert({
    where: { slug: TEST_SECTION },
    create: { slug: TEST_SECTION, name: "System test lounge", description: "Used by the system tests.", order: 999 },
    update: {},
  });
  await p.$disconnect();
}
