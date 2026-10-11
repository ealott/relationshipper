# Relationshipper

Questions for two. Relationshipper is a private journal for couples: each partner writes an answer on their own, and neither can read the other's until both have written. Then you talk about what you wrote.

It runs as an installable web app (PWA) at **https://relationshipper.evanlott.com**.

## How it works

- **Write, don't tap.** Every question is open-ended and every answer is a journal entry, not a multiple-choice pick. Drafts are saved to your account as you type, so they survive closing the app and follow you to other devices. Only you ever see them.
- **Private until you've both answered.** Your partner can see *that* you've answered, never *what*, until they've written their own answer. The server enforces this: your partner's answer is never sent to your device until you've written yours.
- **Then talk about it.** Once both answers are revealed they're locked, and the conversation continues as responses underneath. Tips on responding come from research on responsiveness.
- **A question a day.** Both partners get the same daily question in the couple's time zone. Questions start light and deepen over the first three weeks. After the first week, Sundays bring a check-in on the relationship itself.
- **Questions that fit where you are.** Hypotheticals about marriage, children and living together are matched to whether you're married, have kids, or live together. You can change these at any time.
- **Your own questions.** Either partner can write a question for both of you. These are labelled as written by you or your partner, apart from the research-based bank. You can also suggest one for the shared bank, where an admin reviews it.
- **An app on your Home Screen.** Today shows how to install it (Settings too, until it's installed). On iPhone, that's also what makes reminders possible.
- **Keep a copy.** Settings → Keep a copy downloads your whole journal as a readable file.
- **Make it comfortable.** Settings → Appearance sets the theme (light, dark, or the device's own), a larger text size for questions and answers, reduced motion, and whether to show writing tips and days in a row. Each device keeps its own.
- **Reminders, not pressure.** An optional daily reminder at a time you choose, plus notifications when your partner answers or responds. Notifications never include what anyone wrote. There are no compatibility scores and no "you matched!".

## The research

The 515 questions, grouped into 17 themes, and the design choices above draw on relationship science. That includes Gottman's work on love maps, turning toward and conflict; Aron's escalating self-disclosure; responsiveness and capitalization research (Reis, Gable); the Marriage Checkup (Cordova); "sliding vs. deciding" (Stanley, Rhoades); and expressive writing (Pennebaker). The write-up is in [docs/research.md](docs/research.md). It rates the evidence for each claim as Strong, Moderate or Emerging, and flags popular claims that lack peer-reviewed support. Its 71 sources were each checked against Crossref, PubMed or library records.

The app shows a plain-language version, with links to every source, at `/research` and on each theme page (from `shared/research.ts`; `npm test` checks it against the write-up). Relationshipper is a reflection tool, not therapy, and no study has tested the app itself.

## Privacy

- **Simple sign-in.** A fixed list of people (`LOGIN_USERS`) sign in with their name and one shared password (`LOGIN_PASSWORD`). Both are Cloudflare secrets, so neither is in the code or the database. With exactly two names, the accounts are created and paired on first sign-in, so there's no invite code to exchange. Guessing is rate-limited, per device and overall. Google sign-in also works if it's configured. Sessions are random tokens, stored only as SHA-256 hashes.
- **Answers belong to the couple.** Only the two partners can read their answers and responses. The admin console shows counts, questions, suggestions and accounts, but never answers or responses.
- **Leaving deletes.** If either partner leaves the couple, its answers, responses and custom questions are deleted. Deleting your account (Settings → Account) also ends the pairing and deletes everything the two of you wrote. A couple made from the two `LOGIN_USERS` names can't unpair at all, since they'd only be paired again at the next sign-in.
- **Backups.** Nightly backups (below) contain everything, answers included. They stay in the same Cloudflare account as the database, and the admin console shows only their dates and sizes.

## Stack

- Cloudflare Workers with static assets, D1 (SQLite) and a Cron Trigger for reminders.
- API: [Hono](https://hono.dev). Client: [Preact](https://preactjs.com) with preact-iso, built with Vite and `@cloudflare/vite-plugin`.
- Web Push with VAPID and RFC 8291 payload encryption on WebCrypto, so there are no push dependencies. A small custom service worker handles offline caching and notifications.
- TypeScript throughout. Shared types and the question bank live in `shared/`.
- The raccoon is drawn once, in `shared/raccoon.ts`. The in-app illustrations and the app icons both use it; after changing it, run `node scripts/generate-icons.mjs` to re-render the icons.

## How work is tracked

In GitHub issues, following [AGENTS.md](AGENTS.md): one branch and one PR per issue, with decisions and questions recorded as issue comments. Start with the pinned [Start here](https://github.com/ealott/relationshipper/issues/13) issue, which lists what's waiting on a person.

## Running it locally

You need Node 22 or later.

```sh
npm install
cp .dev.vars.example .dev.vars
npm run vapid              # paste the two VAPID lines it prints into .dev.vars
npm run db:migrate:local   # creates the local D1 database and loads the question bank
npm run dev                # http://localhost:5173
```

Sign in with a name from `LOGIN_USERS` and the `LOGIN_PASSWORD` from `.dev.vars`. On localhost with `DEV_LOGIN=true`, the welcome screen also has a test sign-in form that accepts any name and email, so you can create as many couples as you like. To try both partners at once, use two browser profiles. To open the admin console at `/admin`, sign in as someone listed in `ADMIN_EMAILS`.

To test real Google sign-in locally, add `http://localhost:5173/api/auth/google/callback` to your OAuth client's redirect URIs. Then put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.dev.vars`.

## Tests

```sh
npm run typecheck
npm test            # API tests: the Worker against a fresh local D1 for each test
npm run test:e2e    # builds, then runs two partners in two browsers on the Workers runtime
```

The end-to-end suite checks the privacy rule directly: it fails if the second partner's browser receives the first partner's answer before writing their own. Run it with `SCREENSHOTS=1` to refresh the images in `docs/screenshots`. If Playwright can't download its own browser, set `PLAYWRIGHT_CHROMIUM_PATH` to a Chromium executable.

## The question bank

The research-based questions live in `shared/questions/` as one TypeScript file per theme. Each question has an `id`, a `depth` (1 Opener, 2 Reflective, 3 Deep) and, if it only suits some couples, an `audience` (for example `unmarried`, `parents` or `apart`). `npm test` checks the bank for duplicates, length and valid tags.

`npm run seed` regenerates the question-bank migrations from those files. A migration runs only once per database, so the original bank (`0002_seed_questions.sql`) never changes. A question written later sets `addedIn` to the migration that adds it, such as `0004_future_questions`, and `npm run seed` writes that file. You can also edit live questions in the admin console.

## Admin console

Anyone listed in `ADMIN_EMAILS` (by Google email, or by their name from `LOGIN_USERS`) gets an Admin console link in Settings. It covers:

- **Overview:** counts of users, couples (and how many were active this week), answers, responses, custom questions, pending suggestions and devices with notifications on.
- **Questions:** search, add, edit or retire questions. A retired question is no longer offered, but stays readable for couples who already answered it.
- **Suggestions:** approve or reject questions people have suggested for the shared bank. Approved questions are labelled Community.
- **Users:** find and delete accounts.

## Deploying to Cloudflare

`wrangler.jsonc` serves the Worker only on `relationshipper.evanlott.com`; Cloudflare creates the DNS record and certificate. The first time:

```sh
npx wrangler login
npx wrangler d1 create relationshipper     # only on a new account: put its database_id in wrangler.jsonc
npm run db:migrate:remote

npm run vapid                              # then run the two `wrangler secret put` lines it prints
npx wrangler secret put LOGIN_USERS        # e.g. Alex,Sam
npx wrangler secret put LOGIN_PASSWORD
npx wrangler secret put ADMIN_EMAILS       # e.g. alex

npm run deploy
```

You can change the names or password at any time with `wrangler secret put`, or in the Cloudflare dashboard (**Workers & Pages → relationshipper → Settings → Variables and Secrets**). Secrets survive deploys, and existing sessions stay signed in. After that, deploying is `npm run db:migrate:remote` (if there are new migrations) followed by `npm run deploy`. Keep the VAPID keys once people subscribe: new keys invalidate every existing notification subscription. Never set `DEV_LOGIN` in production; it only works on localhost anyway.

If the static-asset upload step fails with `401 Unauthorized`, use `npm run deploy:inline` instead. This happens behind proxies that replace the upload's own short-lived token with an API token. The inline deploy ships the same build with the client files embedded in the Worker, and serves them with the same headers and fallback rules. Each static file then counts as a Worker request, which is fine at this scale.

### Optional: Google sign-in

To let people sign in with Google instead of (or as well as) the shared password:

1. In the [Google Cloud console](https://console.cloud.google.com/), create or pick a project, then open **Google Auth Platform**.
2. Under **Branding**, enter the app name and a support email, and add `evanlott.com` as an authorized domain. Under **Audience**, choose **External** and publish the app. Without publishing, only listed test users can sign in. The app asks only for `openid`, `email` and `profile`, which don't need Google's review. Adding a logo does trigger brand verification.
3. Under **Clients**, create a client of type **Web application** with this authorized redirect URI:
   `https://relationshipper.evanlott.com/api/auth/google/callback`
4. Store the client ID and secret as the `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` secrets, either with `wrangler secret put` or in the dashboard as above.

The "Continue with Google" button appears once both secrets are set. Google accounts pair with an invite code.

## Backups and recovery

| What happens | How to recover | Data lost |
|---|---|---|
| A bad update or mistake, noticed within 7 days | Rewind the database (Time Travel) | Nothing, back to the minute |
| A mistake noticed later, or the database deleted | Restore a nightly backup (kept 90 days) | Up to a day |
| The Cloudflare account lost | Each of you can download your journal (Settings → Keep a copy) | Whatever wasn't downloaded |
| Cloudflare down | Wait; the code is on GitHub and redeploys in minutes | Nothing |

Time Travel is 7 days on the Workers Free plan and 30 days on Workers Paid. Nightly backups run from the hourly cron job, after 03:00 UTC (`worker/backup.ts`). They're stored as gzipped JSON in the `BACKUPS` KV namespace and expire after 90 days. KV is used because R2 isn't enabled on this account. The admin console's Overview shows the last backup, with a **Back up now** button.

**Rewind the database** to a moment in the last 7 days. This rewinds everything, for both of you, and can itself be undone with the bookmark it prints:

```sh
npx wrangler d1 time-travel info DB                                      # current bookmark
npx wrangler d1 time-travel restore DB --timestamp=2026-10-11T14:00:00Z
```

**Restore a nightly backup.** The script only writes a SQL file. Applying it replaces the current contents, and everyone signs in again afterwards:

```sh
node scripts/restore-backup.mjs --list                 # backups kept, newest last
node scripts/restore-backup.mjs 'backup:2026-10-11T03:00:00.000Z'
npx wrangler d1 time-travel info DB                    # note the bookmark, to undo if needed
npx wrangler d1 execute DB --remote --file restore-2026-10-11T03-00-00.000Z.sql
```

Restore files contain every answer. They're ignored by git; delete them when you're done.

**Rebuild from nothing** (the database or the Worker deleted):

1. `npx wrangler d1 create relationshipper`, then put the new `database_id` in `wrangler.jsonc`.
2. `npm run db:migrate:remote` to create the tables.
3. Restore the latest nightly backup, as above.
4. Set the secrets again (`LOGIN_USERS`, `LOGIN_PASSWORD`, `ADMIN_EMAILS`; keep these in a password manager). New Web Push keys from `npm run vapid` are fine: each of you just turns notifications back on.
5. Deploy.

## Project layout

```
worker/            API (Hono), auth, reveal rules, daily question, reminders, Web Push
  routes/          auth, me, pairing, questions, push, admin
src/               Preact client: pages/, components/, lib/, sw.ts (service worker)
shared/            types shared by client and Worker, themes, research notes, time helpers
  questions/       the research-based question bank, one file per theme
migrations/        D1 schema (0001), the generated question bank (0002, 0004), drafts (0003)
public/            icons, manifest, _headers (CSP), prefs.js (applies display preferences before the first paint)
scripts/           seed builder, VAPID keys, icon renderer, service worker build, restore-backup, deploy-inline
test/              API tests (Vitest)
e2e/               two-partner browser tests (Playwright)
docs/              research write-up and screenshots
```
