# FairCart Guard – Member 3: Backend Core & Procurement Engine

Drop-in `apps/api` overlay: Express + TypeScript + Prisma/PostgreSQL + Zod + Multer.
Deterministic procurement rules, ranking, approval binding, request/quote APIs, analyze + summary.
**No AI and no PayPal logic lives here** (those are Member 2 and Member 4).

> ⚠️ This overlay was written WITHOUT access to your GitHub repo. Before copying files in,
> compare with what already exists (see "Merging into your repo" below). Nothing here overwrites
> `apps/web`, `apps/api/src/services/ai` or `apps/api/src/services/paypal`.

## Quick start

```bash
# 1. Postgres (or use your own and edit DATABASE_URL)
docker compose up -d                      # uses apps/api/docker-compose.yml

cd apps/api
cp .env.example .env                      # then check DATABASE_URL
npm install
npx prisma generate
npx prisma migrate dev --name init        # creates tables
npm run db:constraints                    # partial unique index: ONE active approval per request
npm run db:seed                           # T-shirt scenario (3 vendors, 3 quotes)
npm run dev                               # http://localhost:4000/health
```

Tests / checks:

```bash
npm test            # Vitest + Supertest (no database needed)
npm run typecheck
npm run lint
```

### Try the seeded demo (id `seed-tshirt-request`)

```bash
curl -X POST localhost:4000/api/requests/seed-tshirt-request/analyze      # A rank 1, B rank 2, C ineligible (10 days > 7)
curl localhost:4000/api/requests/seed-tshirt-request/recommendation
curl localhost:4000/api/requests/seed-tshirt-request                      # full purchase summary
curl -X POST localhost:4000/api/requests/seed-tshirt-request/approve \
     -H 'Content-Type: application/json' -d '{"quoteId":"<id of Vendor A quote>"}'
```

## Endpoints (all under `/api`, responses `{ data, meta? }`, errors `{ error: { code, message, details? } }`)

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | liveness (outside `/api`) |
| POST | `/requests` | body: title, quantity, budget, currency, `deadlineDays` **or** `deadline`, requiredSpecs[] |
| GET | `/requests` | `?status=&limit=&offset=` |
| GET | `/requests/:id` | **purchase summary** (request, quotes+totals+rule results+ranking, recommendation/risks, approval, payments, budget) |
| PATCH | `/requests/:id` | client may only set status DRAFT / COLLECTING_QUOTES / CANCELLED |
| POST | `/requests/:id/quotes` | JSON = manual entry (buyer-reviewed); `multipart/form-data` (`file` PDF + `vendorName`) = upload (unreviewed) |
| GET | `/requests/:id/quotes` | |
| GET / PATCH | `/quotes/:id` | PATCH edits fields; `markReviewed: true/false` toggles the review gate |
| POST | `/requests/:id/analyze` | totals → rules → ranking → AI port → persist |
| GET | `/requests/:id/recommendation` | latest persisted recommendation + risks |
| POST | `/requests/:id/approve` | body `{ quoteId, expectedTotal?, approvedBy? }` – **no amount field** |

Typed response contracts for Member 1: `src/contracts/index.ts`.

## Contract decisions (flagged, not silent)

* **Deadline**: stored as `deadlineDays` (authoritative for rules) plus a derived `deadline` date. API accepts either. Delivery dates in quotes are converted to days relative to request creation.
* **Totals**: `calculatedTotal` is always computed by the backend; `statedTotal` is the vendor's claim, used only for consistency checks. Any client-supplied `total/amount/calculatedTotal` is rejected (400).
* **Eligibility** has three outcomes: `ELIGIBLE`, `INELIGIBLE` (a hard rule FAILed), `NEEDS_REVIEW` (missing/uncertain/contradictory data – never ranked, never silently accepted). Persisted quote status: ELIGIBLE / INELIGIBLE / EXPIRED (validity rule failed) / NEEDS_REVIEW.
* **Request status after analyze**: `AWAITING_APPROVAL` if ≥1 eligible quote, else `ANALYZED`. Any quote/requirement change after approval invalidates it and moves the request back to `COLLECTING_QUOTES` (re-analyse + re-approve).
* **Completeness score** = present ÷ required of: subtotal, tax, shipping, otherFees, delivery, validUntil, buyerReviewed, plus "otherFeesExplained" when fees > 0. An unexplained fee lowers the score but does not block eligibility. Because of this, Quote B scores 0.3946 (not the PDF's illustrative 0.397, which assumed 0.9 completeness).
* **Cost score** is min-max among eligible quotes (as in the blueprint); the budget-relative alternative remains a team decision.
* No auth/ownership model yet (open team decision in the PDF).

## Rounding rules (`src/utils/money.ts`)

BigInt fixed-point (6 dp), no floats, no extra dependency. Components keep full precision; the final total is rounded **once**, half-up (away from zero), to the currency's minor units (INR/USD 2, JPY 0, KWD 3; HUF/TWD 0 for PayPal). Inputs: decimal strings preferred; max 4 decimals accepted by the API.

## Approval binding

`fingerprint = sha256(canonical{ v, requestId, quoteId, vendorId, amount, currency, quoteContentHash })`, where `quoteContentHash` covers every price/delivery/validity/spec/review field. Approve requires: buyer-reviewed → analysed (since last edit) → `ELIGIBLE`. Idempotent for duplicates and concurrent calls (row lock + partial unique index). **Member 4** should call `verifyApprovalForPayment(prismaApprovalStore, requestId)` (`services/procurement/approval.ts`) before creating an order and use only the returned `amount`/`currency`.

## Integration points

| Who | What |
|---|---|
| Member 2 | Implement `AiAnalysisPort` (`services/procurement/integration/aiPort.ts`) and call `setAiAnalysisPort(...)` at startup. Until then: `NullAiAnalysisPort` (empty risks, status UNAVAILABLE) or, if `DEMO_MODE=true`, a clearly labelled `DEMO_FIXTURE` that flags non-zero other-fees. Both files are **temporary stubs**. `POST /api/quotes/:id/extract` is not in this overlay. |
| Member 4 | Mount payments/webhooks routers in `src/app.ts` (TODO marker; webhook needs raw body before `express.json`). `Payment` / `WebhookEvent` models are in `prisma/schema.prisma`; summary reads Payment (`verified` = COMPLETED + `verifiedAt`). `/health` is also provided here. |
| Member 1 | Use `src/contracts/index.ts`; money is always a string. |

## Merging into your repo

1. `git pull`, then diff this overlay against `apps/api` (package.json, tsconfig, prisma/schema.prisma, src/app.ts, src/server.ts).
2. If Member 4 / others already added tables or fields to `schema.prisma`, **merge** rather than replace.
3. If the monorepo root already has ESLint/Prettier/TS configs, drop `eslint.config.mjs` and adapt `tsconfig.json` (`extends`).
4. Run the Quick start; fix any compile errors reported by `npm run typecheck` (see status below).

## Verification status (honest)

| Area | Status |
|---|---|
| money.ts (23 tests), rules (35), ranking (14), approval + fingerprint (21) | **Executed: 93/93 passed**, run with a small local stand-in for Vitest's API (no npm access in my environment). Pure modules + their tests also typechecked clean under `strict`. Re-run with real `npm test`. |
| `api.test.ts` (Supertest, services mocked) and `fileStorage.test.ts` | **Written, NOT executed** |
| Prisma schema, seed, migrations, Prisma-backed services (request/quote/analyze/summary/approval store), routes, Zod schemas, middleware, app/server | **Written, NOT compiled or run** (needs `npm install`, `prisma generate`, Postgres) |
| ESLint | config written, not run |
| Real concurrency behaviour of the row lock + partial unique index | untested against Postgres |
