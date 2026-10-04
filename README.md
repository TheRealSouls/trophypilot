# TrophyPilot

A PlayStation trophy hunting site: accounts with PSN linking, trophy tracking, live PSN profile lookups, a game database built
from PSN, community guides, leaderboards and search.

## Quick start (demo mode)

```bash
npm install
# put a PostgreSQL connection string in .env as DATABASE_URL (see "Database" below)
npm run setup      # creates the tables and seeds demo data
npm run dev        # http://localhost:3000
```

Demo login: `demo@trophypilot.com` / `trophyhunter`. Every seeded user has the same password. `npm run db:reset` wipes the
database and reseeds it. On a live (real PSN) database, `npm run demo:user` creates just the demo login. The demo account
can't link PSN or be deleted, because its password is public.

Check everything works with `npm run smoke` (or `npm run smoke -- https://your-site`): it loads every page and API route
as a visitor and as the demo user and reports anything that errors.

Without a PSN token the site runs in **demo mode**: a simulated PSN provider and a fictional game catalogue. Nothing talks to
Sony, which is why real players (for example GamingWithFlacy) and real games (for example Hollow Knight) don't show up.

## Connecting to real PSN

Sony has no public API or "Sign in with PlayStation" for other sites. Like other trophy sites, TrophyPilot reads PSN with a
**service account**: a normal PSN account whose session token (the NPSSO) the server uses to call Sony's mobile API.

1. **Make a PSN account for the site.** Use a separate account, not your main one. The token grants full access to whichever
   account it belongs to, and heavy automated use is safer on an account you don't care about. The account doesn't need any games.
2. **Sign in to that account** at <https://www.playstation.com> (top right, "Sign in"). A private/incognito window keeps it away
   from your personal session.
3. **Get the token.** In the same window, open <https://ca.account.sony.com/api/v1/ssocookie>. You'll see JSON like
   `{"npsso":"<64 characters>"}`. Copy the 64-character value. If you see an error instead, you aren't signed in; repeat step 2.
4. **Close the window without signing out.** Signing out can invalidate the token.
5. **Add it to `.env`:**
   ```
   PSN_NPSSO="paste-the-64-characters-here"
   ```
6. **Check it works:**
   ```bash
   npm run psn:check -- GamingWithFlacy
   ```
   You should see `OK: signed in` and the player's level and trophy counts.
7. **Start with a clean database.** The demo catalogue is fictional, so don't mix it with real data. This deletes
   everything, including any accounts you registered locally:
   ```bash
   npx prisma db push --force-reset
   ```
   Use `npm run setup:live` instead on a new, empty database.
8. **Fill the game catalogue (optional but recommended).** Games are added whenever someone syncs or a PSN profile is looked
   up. To seed it up front, import the lists of a few players with big libraries:
   ```bash
   npm run psn:import -- GamingWithFlacy AnotherHunter
   npm run psn:import -- --trophies GamingWithFlacy   # also fetch every trophy list (slow, one request per game)
   ```
9. **Restart the dev server** (`npm run dev`) so it picks up the new env.

Now search finds real PSN players with their avatars, `/psn/<OnlineID>` shows any public profile, and members can link and
sync their real trophies.

**Things to know**

- **Does the token run out?** Yes. An NPSSO lasts about two months. The server signs in with it once, then keeps its own
  session going with refresh tokens, so day to day it isn't used. When the refresh token expires the server signs in
  with the NPSSO again; once the NPSSO itself has expired, that fails, PSN features show "PSN isn't responding", and the
  server logs `[psn] auth ...`. Then repeat steps 2 to 5 and run `npm run psn:check`. Put a reminder in your calendar
  every seven weeks. Signing out of playstation.com in the browser you took the token from also ends it early.
- The server stores its PSN session (access and refresh tokens) in the database and shares it with scripts and cron jobs,
  so the NPSSO is only used to sign in when that session has fully expired. Signing in with the NPSSO over and over (for
  example from many short-lived processes) gets it revoked by Sony.
- A player's trophies are only visible if their PSN privacy setting for trophies is "Anyone". Otherwise the profile shows
  as private.
- Sony rate limits the API. Lookups are cached (profiles 15 min, searches 10 min) and rate limited per IP. The background
  sync runs accounts one at a time.
- Earn rates (rarity) only come from per-player trophy calls. Games imported from a lookup borrow them from a player who
  owns the game. Where PSN hasn't reported one, the site shows "Rarity n/a".
- This uses Sony's private API through [`psn-api`](https://github.com/achievements-app/psn-api). Sony can change it at any
  time, and using it may break PlayStation Network's terms for the service account. Keep that in mind before launching publicly.

## How players link their real PSN account

Sony doesn't offer "Sign in with PlayStation" to other sites. Its OAuth is only available to companies with a signed
partner agreement (that's how Discord and similar integrations work). So TrophyPilot does what PSNProfiles, Exophase and
TrueTrophies do: it proves ownership instead of signing in.

1. The player creates a TrophyPilot account (email and password).
2. In Settings they enter their PSN Online ID and get a code such as `HUNT-3F9A1C`.
3. They paste the code into their PSN About Me (PS5: Profile, Edit Profile, About Me; or the PlayStation App).
4. They press Verify. The server reads their public profile through the service account and checks the code is there. Only
   the owner can edit that About Me, so this proves the account is theirs. They can delete the code afterwards.
5. Their trophies import in the background: every list, trophy group (base game and DLC), trophy, earned date and global
   earn rate. Their PSN avatar becomes their profile picture.

Once linked, players appear on the leaderboards, and anyone can compare two members at `/compare` (or with the Compare
button on a profile). A player's trophies must be visible to "Anyone" in their PSN privacy settings for syncing to work.

Never ask players for their own NPSSO token or PSN password. A token gives full control of their PSN account.

**Syncing big libraries:** a run processes at most `PSN_SYNC_TITLES_PER_RUN` changed trophy lists (default 200),
`PSN_SYNC_CONCURRENCY` at a time (default 10), and remembers where it stopped. The runs of one import share the game
list they fetched first, and Settings shows "N of M games imported" while it runs. Right after linking, and after a *Sync now*
that leaves a backlog, the server keeps running batches in the background until the library is imported. After that, a
sync only reads PSN's game list up to the last synced game (PSN sorts it newest first) and fetches the lists that
changed. Measured against real PSN: a 10-game library imports in about 3 s, a routine sync with nothing new takes under
half a second, and big libraries import at about 0.13 s per game (a 4,500-game library in about 10 minutes).

**Sync schedule and plans:** `src/lib/plans.ts` sets how often each plan syncs. Free accounts sync automatically every 7
days and can press *Sync now* once an hour. Premium (`User.plan = "PREMIUM"`, not sold yet) syncs automatically every hour
and can press *Sync now* every minute. `GET /api/cron/sync` with `Authorization: Bearer $CRON_SECRET` syncs up to
`PSN_SYNC_PER_RUN` accounts (default 10) that are due, plus any part-way through an import. It answers straight away and
syncs after the response, so call it every 10 minutes from any scheduler. Every sync uses the site's one PSN token, so
very short automatic intervals for many accounts would need more tokens.

## Leaderboards

Sony has no public API that lists the best players, so the site ranks every player it has seen. Each time a PSN profile
is fetched (a lookup on `/psn/<OnlineID>`, `psn:import`, `psn:track` or a member's sync), its public summary is stored
in `PsnPlayer`: level, trophy counts, avatar and the country of the PSN account (decoded from the profile's `npId`).

- **All-time points and platinum boards** (global and country) rank those real PSN totals, members and non-members alike.
  Non-members link to their PSN profile page; members link to their TrophyPilot profile.
- **Weekly, monthly, completion, ultra rare and friends boards** need a full trophy history, so only members who have
  linked PSN appear on them.
- Players whose PSN trophies are private are never ranked. Members who are private, friends-only or opted out of
  leaderboards stay off the public boards.

- **Weekly and monthly boards** rank what each player gained since the period started, measured between stored snapshots
  of their totals (`PsnPlayerSnapshot`), so they include non-members too. A player first seen mid-week counts from then.

The boards (and the home page feeds) are only as full as the set of players the site knows, so fill it up:

```bash
npm run psn:track -- ikemenzi GamingWithFlacy   # add or refresh specific players (totals, 50 recent games, platinum dates)
npm run psn:track -- --file hunters.txt         # one Online ID per line
npm run psn:discover -- --max 200               # add players from the public friends lists of the top tracked players
```

Then keep them fresh with the players cron: `GET /api/cron/players` with `Authorization: Bearer $CRON_SECRET`, for
example every 10 minutes. Each refresh reads the player's full games list (games played and average completion for the
leaderboards) and counts ultra rares in up to 40 more of their lists: lists they haven't started and finished lists we
already hold are counted for free, the rest cost one PSN request each, so a big library fills in over a few days (the board
shows "123+" until it's done). `npm run psn:player-stats -- 50 300` catches the top 50 players up in one go. Each call
refreshes the `PSN_REFRESH_PER_RUN` stalest players (default 10) and, if
`PSN_DISCOVERY=on`, discovers up to `PSN_DISCOVER_PER_RUN` new ones (default 20). Discovery is off by default: it collects
public profiles of people who never visited the site, so decide whether you want that and keep the privacy policy in step.

To honour a removal request, run `npm run psn:track -- --hide TheirOnlineId`: they disappear from lookups, search and
leaderboards.

## Home page feeds

"Latest platinums", "Top this week" and "Most played this month" merge members' synced history with tracked players' recent
games (`PsnPlayerTitle`) and snapshots. Platinum dates are exact: they're read from the trophy list, a few per refresh.
"Popular guides" only has what members write; while it's empty it lists the most-played games that still need a guide.

## Trophy addresses and dark mode

Trophy pages live at `/games/<game>/<trophy>`, for example `/games/hollow-knight/watcher`. Slugs are unique within a
list; hidden trophies use `hidden-<number>` so the address doesn't spoil them, and repeated names get the trophy number
added (`src/lib/trophy-slug.ts`). Old `/trophies/<id>` links redirect. `npm run db:trophy-slugs` fills in any trophy
without a slug and runs in the Render build.

The site is light by default. Members can switch to dark in Settings, Appearance (`User.theme`); it never follows the
device's own light or dark setting. Dark colours are in `globals.css` under `:root[data-theme="dark"]` and meet the
same contrast rules as the light ones.

## Community features

- **Community activity** (`/community`): short updates from members, with tabs for everyone, friends and people you
  follow, and your clubs. Members can follow anyone (no approval) as well as add friends.
- **Clubs** (`/clubs`): groups around an interest. Members join to see and post updates; the owner or an admin can delete
  a club. A club is deleted with its owner's account.
- **Messages** (`/messages`): private conversations and group chats (up to 20 people). Members choose who can message
  them in Settings (anyone, friends and people they follow, or nobody). Only a conversation's members can open it.
- **Reputation**: counted live from what a member contributes (threads, replies, guides, tips and their upvotes, updates,
  sessions hosted), with ranks from Newcomer to Legend and badges. Shown next to forum posts and on `/forums/user/<name>`.
- **Profiles**: Trophy Vault (five chosen trophies), a profile card theme (Ember, Circuit, Ocean, Forest, Frost,
  Platinum, Arcade: `PROFILE_CARDS` and `src/components/ProfileCardArt.tsx`), a picture (PSN avatar, ten built-in ones in
  `src/components/avatars.tsx`, or a game icon), a banner from one of the member's games, an accent colour
  (`src/lib/profile-themes.ts`), YouTube/Twitch/other stream links, "Playing now" (set on a game page, clears after 3
  hours), a trophy log of the last 50 trophies with exact times, saved guides, and filters for platform, completion and
  order on the games list.
- **Games**: members rate the platinum's difficulty (1 to 10, averaged with guides) and the game (1 to 5 stars); admins can
  flag a list's platinum or 100% as unobtainable with a reason; "Reveal all hidden trophies"; recent players.
- **Guides**: a trophy-by-trophy section under the roadmap, favourites, and "Send to a friend" (copy, email, share sheet or
  a private message).
- **Sessions**: each session has its own page with the trophies it's for, who has joined, and comments; times show in the
  viewer's own time zone.

## Forums

`/forums` has sections, each with optional sub-sections, holding threads and replies. A thread can be tagged with a game,
and the game's page lists its threads under Discussion. Admins create, edit, reorder and delete sections at
`/forums/manage`, and can pin, lock, move and delete threads and posts. Members can edit and delete their own posts.
Make someone an admin with `npm run user:role -- <username> ADMIN` (`USER` to undo). `npm run forums:seed` creates the
standard sections and sub-sections (safe to run again; it leaves existing ones alone). The forum also has Rules
(`/forums/rules`) and Staff (`/forums/staff`, everyone with the admin role) tabs. Never make the shared demo account
an admin: its password is public. Posts stay up, credited to a deleted user, when an account is deleted.

## New trophy lists and new DLC

The home page's "New trophy lists" are the games with the highest PSN list ids (`NPWR12345_00`): Sony hands them out in
order, so they're the most recently created lists. "New DLC" first shows DLC packs found when a list we already had grew
(PSN's game listings report each list's trophy total; when it rises, the list is fetched again and the new pack is marked
`addedLater`), then DLC of the newest games. The players cron loads a few of these lists per run
(`PSN_NEW_LISTS_PER_RUN`, `PSN_GROWN_LISTS_PER_RUN`); `npm run psn:lists -- 40` loads a batch by hand.

## Difficulty and time to platinum

These come from guides. When someone posts a guide, the game's difficulty becomes the average of its guides' ratings and
the hours and playthroughs the median, shared by all of the game's trophy lists (PS4, PS5, regions). Games without a
guide show "Needs a guide". `npm run db:estimates` recalculates every game, for example after importing guides.

## Game details from IGDB

PSN only has trophy data. Release dates, descriptions, genres, developer, publisher, screenshots and trailers come from
[IGDB](https://www.igdb.com), which is free through a Twitch developer app:

1. Sign in at [dev.twitch.tv/console](https://dev.twitch.tv/console) (turn on two-factor authentication on your Twitch
   account if it asks), then **Register Your Application**: any name, OAuth redirect URL `http://localhost`,
   category **Website Integration**, client type **Confidential**.
2. Open the app, copy the **Client ID**, click **New Secret** and copy that too.
3. Put them in `.env` (and in Render, **Environment**) as `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET`.
4. Test one title: `npm run igdb:import -- "Hollow Knight"`. Then fill the whole catalogue with `npm run igdb:import`
   (about 4 games a second; safe to stop and run again).

After that, each game page looks itself up on its first visit, and `GET /api/cron/games` (same `CRON_SECRET` header)
catches the rest, 100 games per call. Only names that match exactly are used, so a few games stay without details
rather than getting the wrong trailer. Existing values are never overwritten.

## Trophy lists and "duplicate" games

PSN gives every platform, and often every region, its own trophy list. Rainbow Six Siege has a PS4 list and a PS5 list;
small games often have four regional lists per platform. Each list is its own row in the `Game` table because progress,
trophies and rarity differ between them.

The catalogue only contains lists the site has seen on someone's profile, because PSN has no public game search. To
fill gaps, the first view of a game page probes neighbouring list ids in the background (lists released together get
consecutive `NPWR` numbers) and adds any with the same title. Some cross-gen games (Fall Guys, for example) have no
separate PS5 list at all: PS5 players earn the PS4 list.

Lists of the same game share a `titleKey` (the title lowercased with punctuation, trademark symbols and accents removed,
see `titleKey()` in `src/lib/utils.ts`). Search and the games page show one entry per `titleKey` with its platforms and
list count, and every game page has a switcher between its lists. After changing `titleKey()`, run
`npm run db:backfill-titles` to recompute keys for existing rows.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router, React 19, Server Components, Server Actions) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4. Design tokens live in `src/app/globals.css` (`@theme`) |
| Type | IBM Plex Mono throughout |
| Database | Prisma 6 + PostgreSQL (Neon free tier works) |
| Auth | bcrypt password hashes and an HS256 JWT in an httpOnly cookie (`jose`) |
| Validation | Zod in every server action |
| PSN | `psn-api` behind a `TrophyProvider` interface, with real and mock providers |

## Features

| Area | Where |
|---|---|
| Accounts, PSN link and sync, privacy, data export, account deletion | `/register`, `/login`, `/settings`, `/api/account/export` |
| Profiles, platinum tracker, milestones, friends | `/u/[username]`, `/u/[username]/[game]`, `/friends` |
| Live PSN profile lookup (any public player) | `/psn/[onlineId]`, `src/lib/psn/lookup.ts` |
| Game database, DLC pages, trophy pages | `/games`, `/games/[slug]`, `/games/[slug]/dlc/[group]`, `/trophies/[id]` |
| Release dates, screenshots, trailers (IGDB) and guide-based estimates | `src/lib/igdb.ts`, `src/lib/estimates.ts` |
| Guides with roadmaps, missables, collectibles, tips | `/guides`, `/guides/[slug]`, `/guides/new` |
| Compare two members side by side | `/compare` |
| Leaderboards (global, country, friends; all time, weekly, monthly) | `/leaderboards`, `src/lib/leaderboard.ts` |
| Search (games, PSN players, members, trophies, guides, sessions) | `/search` |
| Co-op and boosting sessions | `/sessions` |
| Forums with sections, sub-sections and game threads | `/forums`, `/forums/manage` (admins) |
| Terms and privacy policy | `/terms`, `/privacy` (operator details come from `SITE_*` env vars) |
| Contact form (Formspree) | `/contact`, `?topic=removal` or `?topic=privacy` preselects a topic |

## Database

The app uses PostgreSQL. The free tier of [Neon](https://neon.tech) is enough; any PostgreSQL 14+ works. Put the connection
string in `DATABASE_URL` and run `npx prisma db push` to create the tables.

Use Neon's **direct** connection string (turn "Connection pooling" off in Neon's Connect dialog). The pooled one breaks
`prisma db push`.

Moving from an old SQLite `prisma/dev.db`: point `DATABASE_URL` at an empty PostgreSQL database, run
`npx prisma db push`, then `npm run db:from-sqlite`. It copies every table, then prints row counts.

## Deploying for free (Render + Neon)

Render hosts the website, Neon holds the data. Both have free plans that don't need a card.

1. **Create the database.** Sign up at neon.tech, create a project (pick the Frankfurt region to match Render), open
   **Connect**, switch **Connection pooling** off, and copy the connection string.
2. **Optional: bring your local data.** In `.env`, set `DATABASE_URL` to that string, then run
   `npx prisma db push` and `npm run db:from-sqlite`.
3. **Create the website.** At dashboard.render.com: **New**, then **Blueprint**, pick `TheRealSouls/huntresser` (the repository keeps its original name).
4. When Render asks for values: `DATABASE_URL` is the Neon string, `PSN_NPSSO` is your token, and
   `NEXT_PUBLIC_SITE_URL` is `https://huntresser.onrender.com` (or the address Render shows), or `https://trophypilot.com` once your domain points at Render.
5. Click **Apply** and wait for **Live**. `/api/health` should show `"mode":"live"`.
6. **Keep it awake.** At cron-job.org (free), add a job for `https://<your-site>/api/ping` every 10 minutes. Render's
   free plan puts the site to sleep after 15 minutes without visitors and waking it takes about 40 seconds; the ping stops
   that. It doesn't touch the database, so Neon still sleeps when nobody's around. One always-on free service fits inside
   Render's 750 free hours a month.
7. **Keep data fresh (optional).** Add two more jobs every 10 minutes, each with the header
   `Authorization: Bearer <CRON_SECRET>` (copy it from Render, **Environment**):
   `https://<your-site>/api/cron/sync` and `https://<your-site>/api/cron/players`. With IGDB keys set, add
   `https://<your-site>/api/cron/games` every 30 minutes too.
8. In Formspree, add the Render address to the form's allowed domains.

Without the ping, free Render sites sleep after 15 minutes without visitors and the first request afterwards takes up to
a minute. The data is in Neon, so nothing is lost while it sleeps.

**Speed.** The free plan has a tenth of a CPU, so the site avoids repeating work: the home page is built once a minute and
served to everyone; shared data (leaderboards, the games list, a game's details) is cached in memory for a minute or two
and refreshed in the background (`src/lib/cache.ts`); and pages don't read the login cookie, so the navbar fills in from
`/api/me` after the page arrives (`src/components/session.tsx`). Light or dark is applied in the browser before the
page paints.

**Local development** can use the same Neon database, but then everything you do locally happens on the live site, and
`npm run db:reset` would wipe it. Safer: in Neon, **Branches**, **Create branch** (call it `dev`), and put the `dev`
branch's connection string in your local `.env`. A branch starts as a copy of the live data.

Every push to `main` redeploys automatically.

## Accessibility

The target is WCAG 2.2 AA, and `/accessibility` is the public statement (reports go to the contact form's
"Accessibility problem" topic). What keeps it there:

- Colour tokens in `src/app/globals.css` are chosen for contrast: every text colour reaches 4.5:1 on white and on both
  grey surfaces, white reaches 4.5:1 on the red, and form fields use `line-strong` (3:1). Check new colours before adding
  them, and don't lower text contrast with opacity.
- Text links are underlined (`.link`), not told apart by colour alone.
- Every page has one `h1` and headings in order; landmarks (header, nav, main, footer) and a skip link come from the layout.
- Links that only contain an image get an `aria-label`; decorative images and icons are `aria-hidden` or have empty `alt`.
  `TrophyIcon` announces its grade, and `ProgressBar` takes a `label`.
- The account menu is a disclosure (button with `aria-expanded`), closes on Escape and returns focus. Revealing a hidden
  trophy moves focus to it. Tables that scroll sideways are focusable regions.
- Motion is off under `prefers-reduced-motion`, and targets are at least 24 by 24 px.

Home, games, a game, a trophy, guides, the forum index, leaderboards, search, sessions, a PSN profile, a member profile,
compare, settings, the guide editor, login, sign-up, contact, privacy and accessibility pages were checked with axe-core
(WCAG 2.2 A/AA rules plus best practices) with no violations. Forum section and thread pages weren't, because no live
threads existed yet. Rerun it after
UI changes: load the page, inject axe from cdnjs in the browser console, and call `axe.run()`.

## Production checklist

- Set `SESSION_SECRET`, `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL` and the `SITE_*` operator/contact variables.
- Contact messages go to Formspree form `NEXT_PUBLIC_FORMSPREE_FORM_ID` (default `xljdozjl`). In the Formspree dashboard,
  restrict the form to your production domain and turn on its spam filtering. The form also sends a `_gotcha` honeypot.
- The contact form shows a Google reCAPTCHA v2 checkbox when `CAPTCHA_SITE_KEY` is set, and sends its token as
  `g-recaptcha-response`. Formspree checks the token: in the form's settings, turn on reCAPTCHA with a custom key and
  paste the **secret** key there. In the reCAPTCHA admin console, list every domain the site runs on (`localhost`, the
  Render address, `trophypilot.com`).
- Have the terms and privacy policy reviewed for your jurisdiction before launch.
- The rate limiter in `src/lib/rate-limit.ts` is in-memory. Replace it with Redis (or similar) if you run more than one instance.
- Security headers are set in `next.config.ts`. Serve the site over HTTPS only.

## Project layout

```
prisma/            schema, fictional demo catalogue, seed script
scripts/           psn-check, psn-import, psn-track, psn-discover, demo-user, smoke, recompute-progress, backfill-titles, sqlite-to-postgres
src/actions/       server actions (auth, account and PSN, friends, community)
src/lib/           db, auth, trophy maths, stats, leaderboards, privacy, rate limiting, PSN providers, lookup and catalogue
src/components/    UI kit, skeletons, trophy list, tips, generated art
src/app/           routes
```

## Notes

- **Privacy:** public profiles appear everywhere. Friends-only profiles are visible to accepted friends and only appear on
  friends leaderboards. Private profiles are visible only to the owner. A separate setting removes a user from leaderboards.
- **Points and levels** use PSN's values (300/90/30/15). The level curve approximates the PS5 one.
- **OneDrive:** if this folder syncs to OneDrive you may see harmless `.next` cache warnings in dev. Moving the repo outside
  OneDrive gives a smoother dev loop.
