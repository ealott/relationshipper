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

- **The reveal rule is the product.** A partner's answer never reaches the other's device until they've written their own. Answer reads go through `buildState` (`worker/questionState.ts`). Drafts are only ever returned to their author. Admin endpoints never return answers, replies or drafts. Tests cover each of these; keep them passing, and extend them with any new endpoint.
- **The repository is public.** No secrets, passwords, journal content or the partners' private details in code, commits, issues or PRs. Tests use made-up names.
- **Database changes go in a new migration.** Never edit one that may have been applied, and that includes the generated question-bank migration.
- **Research claims come from `docs/research.md`,** whose sources were checked. `shared/research.ts` quotes them word for word, and a test checks that.
- **The voice is calm and plain.** Open-ended journaling, never multiple choice, no "you matched!" or other gamification, no exclamation marks.
