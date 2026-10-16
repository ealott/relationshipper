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
- **Boogers are a goofy poke, not booty calls, though the code keeps that name (`booty_calls`) from how they started.** They go one at a time and are answered with a goofy reaction (`reaction`: flick for "Booger back", ew or bless). They're on for every couple; either partner can turn them off (`users.booty_calls_off`), which hides them for both. Notifications only ever say "booger" (`worker/notify.ts`). They aren't counted, backed up or exported.
- **The repository is public.** No secrets, passwords, journal content or the partners' private details in code, commits, issues or PRs. Tests use made-up names.
- **Database changes go in a new migration.** Never edit one that may have been applied, and that includes the generated question-bank migrations. A new seed question sets `addedIn` to a new migration, and `npm run seed` writes it.
- **Research claims come from `docs/research.md`,** whose sources were checked. `shared/research.ts` quotes them word for word, and a test checks that.
- **The voice is calm and plain.** Open-ended journaling, never multiple choice, no "you matched!" or other gamification, no exclamation marks.
