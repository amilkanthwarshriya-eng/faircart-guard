# Folder Structure and Ownership

Create the repository from this skeleton, then each member works only inside their own area. Every file has one owner (`OWNERS.json`, `.github/CODEOWNERS`, and an `OWNER.md` in owned folders). The CI job `ownership-check` fails any pull request from branch `mN/...` that touches another member's files. Rules and workflow: `CONTRIBUTING.md`.

## Ownership at a glance

| Member | Area | You own |
|---|---|---|
| M1 Frontend & UX | `apps/web/**` | The whole web app |
| M2 AI Agent | `apps/api/src/services/ai/**`, `tests/ai`, `fixtures/quotes`, `packages/shared/src/ai`, `prisma/schema/risk-recommendation.prisma`, `docs/ai-provider.md` | LLM client, PDF text, extraction, analysis, explanation, agent, prompts |
| M3 Core & Procurement | `src/app.ts`, `src/server.ts`, `routes/{index,requests,quotes,analysis,approval}.ts`, matching controllers, `middleware`, `utils`, `schemas`, `services/{procurement,intake}`, `prisma/{migrations,seed.ts,base/request/vendor-quote/approval}`, `packages/shared/src/{request,quote,approval}`, root config, `docs/api.md` | Money, rules, ranking, approval, CRUD, upload, DB migrations |
| M4 PayPal & DevOps | `services/paypal`, `routes/{payments,webhooks}.ts`, matching controllers, `prisma/schema/{payment,webhook}.prisma`, `tests/paypal`, `packages/shared/src/payment`, `.github`, `scripts`, `postman`, `render.yaml`, most `docs` | Payments, webhooks, toolkit, CI, deploy, docs, demo |
| Anyone (dependency adds only) | `package-lock.json`, `apps/*/package.json`, `packages/*/package.json` | Keep changes small and merge fast |

## Design choices that prevent overwrites

1. **One route file and one controller per owner**, and `routes/index.ts` is pre-wired, so nobody edits shared wiring.
2. **Split Prisma schema** (`prisma/schema/*.prisma`, one file per owner) and **only M3 creates migrations**. Verify your Prisma version supports multi-file schemas; if not, switch to one `schema.prisma` and send schema changes to M3.
3. **Shared contracts per domain** in `packages/shared/src/<domain>` with a pre-wired barrel file.
4. **Public entry points**: other members import `services/ai`, `services/procurement`, `services/paypal` (their `index.ts`), never internal files.
5. **Mirrored tests**: `tests/ai`, `tests/procurement`, `tests/paypal`, `tests/routes`.
6. **Automatic enforcement**: branch protection plus CODEOWNERS plus `scripts/check-ownership.mjs` (tested locally: passes for own files, fails for another owner's files, passes with the label `cross-owner-approved`).

## Notes

- `apps/web/package.json` is created by M1 (Vite). `apps/api/package.json` is created by M3 (phase 3A). The empty `index.ts` stubs only mark where each member starts.
- Replace `@REPLACE-m1` to `@REPLACE-m4` in `.github/CODEOWNERS` with real GitHub usernames before enabling code-owner reviews.
- Ownership of a new file is decided by the patterns in `OWNERS.json`. If you add a new top-level folder, ask M4 to add it, otherwise the check will report it as unowned.
- The root `README.md` and `docs/` hold the project documentation; `docs/paypal-spike.md` and `docs/ai-provider.md` are templates to fill in only after running things.

## Full tree

```
faircart-guard/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml
│   │   └── ownership-check.yml
│   ├── CODEOWNERS
│   └── pull_request_template.md
├── apps/
│   ├── api/
│   │   ├── fixtures/
│   │   │   ├── paypal-samples/
│   │   │   └── quotes/
│   │   ├── prisma/
│   │   │   ├── migrations/
│   │   │   └── schema/
│   │   │       ├── approval.prisma
│   │   │       ├── base.prisma
│   │   │       ├── payment.prisma
│   │   │       ├── request.prisma
│   │   │       ├── risk-recommendation.prisma
│   │   │       ├── vendor-quote.prisma
│   │   │       └── webhook.prisma
│   │   ├── src/
│   │   │   ├── controllers/
│   │   │   │   ├── analysis.controller.ts
│   │   │   │   ├── approval.controller.ts
│   │   │   │   ├── payments.controller.ts
│   │   │   │   ├── quotes.controller.ts
│   │   │   │   ├── requests.controller.ts
│   │   │   │   └── webhooks.controller.ts
│   │   │   ├── middleware/
│   │   │   ├── routes/
│   │   │   │   ├── analysis.ts
│   │   │   │   ├── approval.ts
│   │   │   │   ├── index.ts
│   │   │   │   ├── payments.ts
│   │   │   │   ├── quotes.ts
│   │   │   │   ├── requests.ts
│   │   │   │   └── webhooks.ts
│   │   │   ├── schemas/
│   │   │   ├── services/
│   │   │   │   ├── ai/
│   │   │   │   │   ├── agent/
│   │   │   │   │   ├── analysis/
│   │   │   │   │   ├── client/
│   │   │   │   │   ├── explanation/
│   │   │   │   │   ├── extraction/
│   │   │   │   │   ├── fixtures/
│   │   │   │   │   ├── pdf/
│   │   │   │   │   ├── prompts/
│   │   │   │   │   ├── OWNER.md
│   │   │   │   │   └── index.ts
│   │   │   │   ├── intake/
│   │   │   │   │   ├── OWNER.md
│   │   │   │   │   └── index.ts
│   │   │   │   ├── paypal/
│   │   │   │   │   ├── OWNER.md
│   │   │   │   │   └── index.ts
│   │   │   │   └── procurement/
│   │   │   │       ├── approval/
│   │   │   │       ├── money/
│   │   │   │       ├── ranking/
│   │   │   │       ├── rules/
│   │   │   │       ├── summary/
│   │   │   │       ├── OWNER.md
│   │   │   │       └── index.ts
│   │   │   ├── utils/
│   │   │   ├── app.ts
│   │   │   └── server.ts
│   │   ├── tests/
│   │   │   ├── ai/
│   │   │   ├── helpers/
│   │   │   ├── paypal/
│   │   │   ├── procurement/
│   │   │   └── routes/
│   │   └── uploads/
│   │       └── .gitignore
│   └── web/
│       ├── public/
│       ├── src/
│       │   ├── app/
│       │   ├── components/
│       │   │   ├── common/
│       │   │   └── ui/
│       │   ├── features/
│       │   │   ├── approval/
│       │   │   ├── comparison/
│       │   │   ├── history/
│       │   │   ├── payments/
│       │   │   ├── quotes/
│       │   │   ├── recommendation/
│       │   │   └── requests/
│       │   ├── hooks/
│       │   ├── lib/
│       │   ├── mocks/
│       │   ├── pages/
│       │   └── types/
│       └── OWNER.md
├── docs/
│   ├── samples/
│   ├── ai-provider.md
│   ├── api.md
│   ├── architecture.md
│   ├── demo-script.md
│   ├── deployment.md
│   ├── payments.md
│   └── paypal-spike.md
├── packages/
│   └── shared/
│       ├── src/
│       │   ├── ai/
│       │   │   ├── OWNER.md
│       │   │   └── index.ts
│       │   ├── approval/
│       │   │   ├── OWNER.md
│       │   │   └── index.ts
│       │   ├── payment/
│       │   │   ├── OWNER.md
│       │   │   └── index.ts
│       │   ├── quote/
│       │   │   ├── OWNER.md
│       │   │   └── index.ts
│       │   ├── request/
│       │   │   ├── OWNER.md
│       │   │   └── index.ts
│       │   └── index.ts
│       └── package.json
├── postman/
│   └── OWNER.md
├── scripts/
│   ├── OWNER.md
│   └── check-ownership.mjs
├── .env.example
├── .gitignore
├── CONTRIBUTING.md
├── FOLDER_STRUCTURE.md
├── OWNERS.json
├── README.md
├── package.json
└── tsconfig.base.json
```
