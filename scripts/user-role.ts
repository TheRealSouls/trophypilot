/**
 * Makes a member the owner (everything, including appointing admins), an admin (runs the site and moderates), a moderator
 * (reports, guide approval, deleting and locking), or back to a normal user.
 *
 *   npm run user:role -- <username> OWNER
 *   npm run user:role -- <username> ADMIN
 *   npm run user:role -- <username> MODERATOR
 *   npm run user:role -- <username> USER
 */
import { prisma } from "../src/lib/db";

try {
  process.loadEnvFile(".env");
} catch {
  // No .env file; rely on the real environment.
}

async function main() {
  const [username, role = "ADMIN"] = process.argv.slice(2);
  if (!username || !["OWNER", "ADMIN", "MODERATOR", "USER"].includes(role)) throw new Error("Usage: npm run user:role -- <username> OWNER|ADMIN|MODERATOR|USER");
  const user = await prisma.user.update({ where: { username: username.toLowerCase() }, data: { role } }).catch(() => null);
  if (!user) throw new Error(`No member called "${username}".`);
  console.log(`${user.username} is now ${role === "OWNER" ? "the owner" : role === "ADMIN" ? "an admin" : role === "MODERATOR" ? "a moderator" : "a normal user"}.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
