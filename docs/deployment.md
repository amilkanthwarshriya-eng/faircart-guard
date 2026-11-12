# Deployment (Render)

> Verify commands and plan limits against Render's current documentation before relying on them.

## Services

| Service | Type | Notes |
|---|---|---|
| faircart-db | PostgreSQL | Managed database; check the plan's retention and expiry terms |
| faircart-api | Web service (Node) | Health check `/health`; runs Prisma migrations during build |
| faircart-web | Static site | Build `apps/web`; SPA rewrite to `/index.html` |

A `render.yaml` blueprint at the repository root defines all three. Secrets use `sync: false` and are entered in the dashboard.

## Environment (API)

`DATABASE_URL` (from the database), `NODE_ENV=production`, `DEMO_MODE=false` for live runs, `PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `FRONTEND_URL`, `LLM_PROVIDER`, `GEMINI_API_KEY` (or Anthropic variables), `USE_PAYPAL_TOOLKIT`.

Frontend: `VITE_API_URL` pointing at the API.

## Steps

1. Push to GitHub; create the blueprint in Render from the repository.
2. Enter all `sync: false` secrets.
3. Build command runs `npm ci`, the API build and `npx prisma migrate deploy --schema apps/api/prisma/schema.prisma`.
4. Seed demo data once with a one-off command; any seed route must be disabled in production.
5. Set CORS to allow only `FRONTEND_URL`; enable `trust proxy`.
6. Confirm `GET /health` is 200 and reports the database as ok.
7. Update `FRONTEND_URL` and `VITE_API_URL` to the deployed URLs.
8. In the PayPal sandbox app, register a webhook for `https://<api-host>/api/webhooks/paypal`, copy the webhook ID into `PAYPAL_WEBHOOK_ID`, and redeploy.
9. Smoke test from a clean browser: create request, analyse, approve, pay with the sandbox buyer, confirm `COMPLETED`.

## Continuous integration

GitHub Actions runs install, migrations against a Postgres service, typecheck, tests and build on every push and pull request. Tests use mocked PayPal and LLM calls.

## Before a demo

- Warm the API (free services may sleep after inactivity; check current terms).
- Confirm the database has not expired.
- Confirm the sandbox buyer can log in and the webhook points at the current URL.
- Keep a local ngrok run as a backup environment.

## Troubleshooting

| Symptom | Cause | Action |
|---|---|---|
| CORS errors | `FRONTEND_URL` / `VITE_API_URL` mismatch | Align values; allow only the frontend origin |
| Slow first request | Cold start | Warm before demo |
| Migration fails | Missing `DATABASE_URL` at build time | Fix env or run migrations at start |
| Webhooks failing | Wrong webhook ID or URL | Re-register and update `PAYPAL_WEBHOOK_ID` |
| Payment page error | Currency or sandbox account region | See `docs/payments.md` |
