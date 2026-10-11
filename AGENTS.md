# Working agreement

How people and agents work on Relationshipper. Adapted from the upquick working agreement, as used in ealott/real-estate-academy.

## Issues are the record

GitHub issues are the shared record of what's planned, decided and blocked. Work that comes up in chat gets an issue before it gets a branch.

- **Writing one:** say **What**, **Why**, and **Done when**. A decision also lists the **Options**.
- **Claiming one:** add the `in-progress` label and an assignee. An agent also comments `🤖 Claimed by Claude (for @ealott). Branch: <branch>.`
- **Questions:** a comment starting `Question:`, mentioning who needs to answer. Label the issue `needs-decision`.
- **Decisions:** a comment starting `Decision (YYYY-MM-DD):` that says what was decided and by whom. The other partner isn't on GitHub, so whoever relays their answer records it.
- **Agent comments** end with the Claude Code footer.
- **Start here:** the pinned issue [#13](https://github.com/ealott/relationshipper/issues/13) lists everything waiting on a person, in priority order. Update it whenever you add, answer or close such an issue.

## Labels

| Label | Meaning |
|---|---|
| `P1: now`, `P2: this week`, `P3: next`, `P4: later` | Priority |
| `needs-decision` | Waiting on a choice |
| `needs-human` | Only a person can do it: accounts, devices, money |
| `agent-ready` | Clear enough for an agent to pick up |
| `in-progress` | Claimed |
| `bug`, `enhancement`, `documentation` | Kind of work |

## Branches and pull requests

- One issue, one branch, one PR. Name the branch `<issue>-<slug>`, like `3-display-preferences`.
- The PR body starts with `Closes #<issue>`.
- Before opening a PR, run `npm run typecheck && npm test && npm run test:e2e`.
- PRs are squash-merged into `main`. The agent that opened one merges it once the checks pass, unless the issue asks for review first. Then it deploys and comments on the issue.

## Environments

- `main` is production, at https://relationshipper.evanlott.com. There's no dev site.
- Deploys are manual. Apply new migrations first (`npm run db:migrate:remote`), then run `npm run deploy`. Where the static-asset upload is blocked, as in Claude's cloud sessions, use `npm run deploy:inline`.
- Backups and recovery are in the [README](README.md#backups-and-recovery).

## This repository is public

Never put passwords, secrets, journal content, production data or the partners' private details in code, commits, issues or PRs. Tests use made-up names and passwords. Secrets live in Cloudflare (`wrangler secret put`, or the dashboard), and `.dev.vars` is git-ignored.
