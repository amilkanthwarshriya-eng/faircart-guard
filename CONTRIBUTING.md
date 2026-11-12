# Contributing and Ownership Rules

Goal: four people build in parallel without overwriting each other. Every file has exactly one owner (see `OWNERS.json`, `.github/CODEOWNERS` and the `OWNER.md` in each folder).

## Who owns what

| Member | Area | Main folders |
|---|---|---|
| M1 - Frontend & UX | Web app | `apps/web/**` |
| M2 - AI Agent | LLM, extraction, analysis, explanation | `apps/api/src/services/ai/**`, `apps/api/tests/ai/**`, `apps/api/fixtures/quotes/**`, `packages/shared/src/ai/**`, `prisma/schema/risk-recommendation.prisma` |
| M3 - Core & Procurement | API core, DB, rules, ranking, approval, intake | `apps/api/src/{app,server}.ts`, `routes/{index,requests,quotes,analysis,approval}.ts`, the matching controllers, `middleware/**`, `utils/**`, `services/{procurement,intake}/**`, `prisma/{migrations,seed.ts}`, `packages/shared/src/{request,quote,approval}/**`, root `package.json` |
| M4 - PayPal & DevOps | Payments, webhooks, toolkit, CI, deploy, docs | `apps/api/src/services/paypal/**`, `routes/{payments,webhooks}.ts`, `controllers/{payments,webhooks}.controller.ts`, `prisma/schema/{payment,webhook}.prisma`, `packages/shared/src/payment/**`, `.github/**`, `scripts/**`, `postman/**`, `render.yaml`, most of `docs/**` |

Anyone may edit (dependency additions only): `package-lock.json`, `apps/*/package.json`, `packages/*/package.json`.

## How the structure prevents conflicts

- **Route files are split per owner** and `routes/index.ts` is pre-wired to import all of them. Nobody edits it.
- **The Prisma schema is split into several files** (`apps/api/prisma/schema/*.prisma`), one owner each. Only M3 creates migration files (`prisma/migrations/**`): after your schema PR merges, tell M3, who generates the migration the same day.
- **Shared contracts** live in `packages/shared/src/<domain>/`, one folder per owner, with a pre-wired barrel `index.ts`. To change a contract another member uses, open a PR in your folder and tag the consumers.
- **Services talk through each folder's `index.ts`** only. Do not import another member's internal files; import their public entry (for example `services/paypal`).
- **Tests mirror owners**: `tests/ai`, `tests/procurement`, `tests/paypal`, `tests/routes`.

## Branches and pull requests

1. Never push to `main`. Create branches named `m1/<topic>`, `m2/<topic>`, `m3/<topic>`, `m4/<topic>` (your member number first).
2. Keep PRs small (under about a day of work). Open early, merge often.
3. CI must pass: `ci` (typecheck, tests, build) and `ownership-check` (fails if your PR touches files outside your area).
4. The owner of each changed path is the required reviewer (CODEOWNERS). Another member reviews your PR as a second pair of eyes.
5. Rebase on `main` at least once a day: `git fetch && git rebase origin/main`.
6. Squash merge with a clear message, for example `m4: add capture verification`.

## Need a change in someone else's area?

1. Message the owner with what you need and why (an issue or chat message is fine).
2. Either the owner makes the change, or you open a PR, the owner approves it, and the owner adds the label `cross-owner-approved` so the ownership check passes.
3. Urgent fix in someone's file? Do the same; never force-push and never edit their file directly on `main`.

## Suggested GitHub settings (repository admin, M4)

- Protect `main`: require a pull request, require approval from Code Owners, require the status checks `ci` and `ownership-check`, block force pushes and deletions.
- Replace the `@REPLACE-m1` to `@REPLACE-m4` placeholders in `.github/CODEOWNERS` with real GitHub usernames.
- Create the label `cross-owner-approved` (only owners should apply it).

## Local setup

```bash
cp .env.example .env     # never commit .env
npm ci
docker run -d --name faircart-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=faircart -p 5432:5432 postgres:16
npm run check:ownership  # before opening a PR (compares against origin/main)
```

Each person runs their own local database; never share a `.env` or a database dump through Git.

## Secrets

Real credentials only live in your local `.env` and in Render's dashboard. Share keys through a password manager. If a secret is committed by mistake, rotate it immediately; deleting the commit is not enough.

## Commit messages

Start with your member prefix and a verb: `m1: build comparison table`, `m3: add budget rule`.
