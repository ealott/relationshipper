# Relationshipper

Research-based questions for couples. Each partner writes an answer privately, and neither can read the other's until both have written. Read [README.md](README.md) for what's built and how it deploys. Follow [AGENTS.md](AGENTS.md) for how work is tracked: GitHub issues, one branch and one PR per issue.

## Commands

```bash
npm run dev                 # local app on http://localhost:5173
npm run typecheck
npm test                    # API tests (Vitest, local D1)
npm run test:e2e            # browser tests (Playwright); set PLAYWRIGHT_CHROMIUM_PATH if needed
npm run seed                # regenerate seed migrations from shared/questions
npm run db:migrate:remote   # apply new migrations to production
npm run deploy:inline       # deploy from a Claude cloud session (the asset upload is blocked there)
```

## Rules

- **The reveal rule is the product.** A partner's answer never reaches the other's device until they've written their own. Answer reads go through `buildState` (`worker/questionState.ts`), and earlier versions of edited answers and replies through `getVersions`, which only reads revealed questions. Versions are kept only for edits after the reveal; before it, an edit replaces the answer. Drafts are only ever returned to their author. Admin endpoints never return answers, replies, earlier versions or drafts. Tests cover each of these; keep them passing, and extend them with any new endpoint.
- **Journal days are questions too.** Each day is a per-couple question (`source = 'journal'`, id `journal-<couple>-<day>`; see `shared/journal.ts`), so it gets the reveal rule, replies, edit history and drafts. Keep journal days out of the library, the daily rotation, progress, Answers, badges and admin answer counts (filter on `JOURNAL_PREFIX`). Entries are written through `/api/journal/:day`, which checks their shape.
- **Date nights are plans, not answers.** Both partners see and change them right away (`worker/routes/dates.ts`). Their notifications and reminders say when, never what: titles and notes stay out of push payloads, as everything anyone writes does. The one exception is each person's own calendar feed (`worker/routes/calendar.ts`), which they turn on to send their date nights to their calendar app, behind a secret link they can replace or turn off.
- **The timeline is a shared record, not answers.** Milestones and memories are shared right away (`worker/routes/timeline.ts`); either partner can change or remove a milestone, and each writes only their own memory. Like date nights, its notifications say that something was added, never what.
- **Fill in the blank is a goofy poke, not a booty call, though the code keeps that name (`booty_calls`) from how it started, and before the blank it was boogers.** You send your partner whatever you fill in (`word`, up to 40 characters; see `shared/blank.ts`), one at a time, and they send it back or answer with aww, haha or ew (`reaction`: back, aww, haha, ew; older rows have flick, read as back, and bless). It's on for every couple; either partner can turn it off (`users.booty_calls_off`), which hides it for both. Notifications never include what was sent or how it was answered (`worker/notify.ts`). These aren't counted, backed up or exported.
- **Self is private.** Everything in it (`self_profiles`, `life_chapters`, `life_notes`, `self_results`; `worker/routes/self.ts`) is read by its owner's own id only: never their partner, never an admin endpoint, and it isn't in the journal download. The one exception is a questionnaire its owner chooses to share (`self_shares`): their partner then gets the latest scores, never the answers, until they stop sharing or unpair. Nothing in Self sends a notification. Tests check this; extend them with anything new in Self.
- **The repository is public.** No secrets, passwords, journal content or the partners' private details in code, commits, issues or PRs. Tests use made-up names.
- **Database changes go in a new migration.** Never edit one that may have been applied, and that includes the generated question-bank migrations. A new seed question sets `addedIn` to a new migration, and `npm run seed` writes it.
- **Research claims come from `docs/research.md`,** whose sources were checked. `shared/research.ts` quotes them word for word, and a test checks that.
- **The voice is calm and plain.** Open-ended journaling, never multiple choice, no "you matched!" or other gamification, no exclamation marks. The one exception to multiple choice is a validated questionnaire in Self, which keeps its published wording and answer scale.
