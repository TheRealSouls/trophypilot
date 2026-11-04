# System tests

Real browsers (Microsoft Edge, which comes with Windows) driving TrophyPilot as several members at
once: messages, forums, community updates, follows, blocks and private profiles, including things
changing part-way through (messages switched off, a block, someone leaving or deleting their account).
Any page error, console error, server error (5xx) or error screen fails the test.

They create and delete members, so they **only run against a local server and a local database**
(they refuse anything else). They cost nothing to run: no hosted services are involved.

## Running them

1. Start the local test database (see `.testdb`) and a dev server that uses it, e.g. the
   `huntresser-pg-test` launch configuration (port 3300).
2. Make sure the database has the current schema: `DATABASE_URL=<local url> npx prisma db push`.
3. Run:

```bash
SYSTEM_TEST_DATABASE_URL="postgresql://postgres:test@localhost:54329/fb1" npm run test:system
```

`SYSTEM_TEST_URL` changes the site address (default `http://localhost:3300`) and
`SYSTEM_TEST_BROWSER=chromium` uses Playwright's own Chromium instead of Edge
(`npx playwright install chromium` first).

The test members are `st_alice`, `st_bob` (PSN ID BobTheHunter), `st_carol`, `st_dave` and
`st_erin`, recreated at the start of every run, plus a forum section `st-test-lounge`.
