import { defineConfig } from "@playwright/test";

/**
 * System tests (tests/system): real browsers driving the site as several members at once.
 * They run against a LOCAL server and database only; see tests/system/README.md.
 *
 *   npm run test:system
 */
export default defineConfig({
  testDir: "tests/system",
  // The tests share members and a database, so one at a time.
  workers: 1,
  fullyParallel: false,
  // A dev server compiles pages on first visit, which can take a while.
  timeout: 120_000,
  expect: { timeout: 20_000 },
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./tests/system/global-setup.ts",
  use: {
    baseURL: process.env.SYSTEM_TEST_URL ?? "http://localhost:3300",
    // The Edge that comes with Windows (no browser download). Set SYSTEM_TEST_BROWSER=chromium to use Playwright's own.
    ...(process.env.SYSTEM_TEST_BROWSER === "chromium" ? {} : { channel: "msedge" }),
    navigationTimeout: 90_000,
    actionTimeout: 30_000,
    trace: "retain-on-failure",
  },
});
