# FairCart Guard

**Your AI procurement agent: smarter decisions, safer spending.**

FairCart Guard helps college clubs, small businesses and organisations buy from vendors with evidence instead of guesswork. A buyer creates a purchase request, collects vendor quotations, and the agent extracts prices and terms, flags hidden or ambiguous charges, enforces purchasing rules in code, ranks eligible vendors with a transparent score, and explains the recommendation. The buyer approves the exact quotation and amount, then pays through **PayPal sandbox** checkout. The backend captures and verifies the payment before anything is shown as successful.

> **What it is not:** it does not just pick the cheapest vendor, and it does not let an AI model decide money or approvals.

## Combined Team Architecture

| Member | Domain | Key Responsibilities & Artifacts |
|---|---|---|
| **Member 1** | Frontend & UX | React, Vite, Tailwind CSS, shadcn/ui, Accessible comparison tables, Quote review, Approve & Pay checkout, Return handling (`apps/web/`) |
| **Member 2** | AI Agent | Gemini API (`gemini-3.5-flash`), Anthropic Claude adapter, PDF text extraction, Prompt injection defence, Schema validation, Rule risk detection, Recommendation explanation (`apps/api/src/services/ai/`) |
| **Member 3** | Core & Procurement Engine | Request/quote/approval domain models, PostgreSQL + Prisma DB, Business rule checks, Multi-factor ranking, Money arithmetic (`apps/api/src/services/procurement/`) |
| **Member 4** | PayPal & Integration | Orders v2 sandbox checkout, Cryptographic webhook verification, Atomic single-capture, Partial unique constraint, CI/CD Render deployment (`apps/api/src/services/paypal/`) |

## Core principles

| Principle | Meaning |
|---|---|
| **AI analyses and recommends** | The LLM reads documents and writes explanations. It never computes authoritative money and never touches payment. |
| **Backend code enforces rules** | Budget, deadline, specifications, completeness and quote validity are deterministic TypeScript. |
| **The buyer authorises** | Approval is bound to the exact quote ID, amount and currency. Any change invalidates it. |
| **PayPal processes the payment** | Orders v2 create, buyer approves on PayPal, the backend captures. Sandbox only. |
| **The app verifies and records** | Capture status, amount and currency are verified server-side; IDs are stored; webhooks reconcile idempotently. |

## Tech stack

| Layer | Technology |
|---|---|
| **Frontend** | React, Vite, TypeScript, Tailwind CSS, shadcn/ui, React Router, TanStack Query |
| **Backend** | Node.js 20, Express, TypeScript, Zod, Prisma |
| **Database** | PostgreSQL, Prisma (Decimal money arithmetic) |
| **AI** | Google Gemini (`gemini-3.5-flash`) via `LLMClient` (with Anthropic Claude fallback) |
| **Payments** | PayPal Orders v2, Sandbox, Webhooks signature verification |
| **Testing** | Vitest (285 passing tests across API & Web), Supertest, MSW |
| **Deployment** | Render (Web service, Static site, PostgreSQL), GitHub Actions CI |

## Repository layout

```
faircart-guard/
  apps/
    web/         React web application (M1)
    api/         Express API backend, AI agent, Core engine & PayPal (M2, M3, M4)
  packages/
    shared/      Shared schemas and types
  docs/          Architecture, API, AI provider, Payments, Deployment, Demo script
  postman/       faircart-guard.postman_collection.json
  scripts/       Ownership check & PayPal spike scripts
  .env.example   Environment variables template
```

## Quick start (local)

Prerequisites: Node 20+, Docker (or local PostgreSQL 16), a PayPal Sandbox Developer account, and a Gemini API key.

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env

# 3. Database setup (when running PostgreSQL locally)
npm run prisma:generate -w apps/api
npx prisma migrate dev --schema apps/api/prisma/schema.prisma
npm run db:seed -w apps/api

# 4. Run tests
npm test

# 5. Run typecheck & build
npm run typecheck
npm run build

# 6. Run both frontend and backend concurrently
npm run dev
```

API runs on `http://localhost:4000` and Web frontend on `http://localhost:5173`.

## Testing

```bash
npm run typecheck            # Typecheck all workspaces (apps/api and apps/web)
npm test                     # Run all 285 tests across the entire project
npm run build                # Production build for both backend and frontend
```

All 285 tests across 27 test files run in CI and locally with zero errors.
