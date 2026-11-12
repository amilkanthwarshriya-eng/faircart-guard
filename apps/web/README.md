# FairCart Guard — Web

Frontend for FairCart Guard, a purchasing workflow app (requests → quotes → comparison → recommendation → approval → payment). This folder is owned by M1 (Frontend & UX) — see `OWNER.md`.

## Tech Stack

- **React 18** + **TypeScript** + **Vite** (dev server on port 5173)
- **Tailwind CSS v4** (via `@tailwindcss/vite` plugin)
- **React Router v6** — client-side routing
- **TanStack React Query** — server state / data fetching
- **react-hook-form + zod** — forms and validation
- **MSW (Mock Service Worker)** — optional API mocking
- **Vitest + Testing Library + jsdom + axe-core** — unit and accessibility tests

## Prerequisites

- **Node.js 18+** (LTS 20+ recommended)
- **npm**
- A running backend at `http://localhost:4000` (not included in this repo) — **or** use mock mode (see below)

## Setup

```bash
npm install
```

## Environment

Copy the example env file and adjust if needed:

```bash
cp .env.example .env
```

Variables:

| Variable           | Default                  | Description                                              |
| ------------------ | ------------------------ | -------------------------------------------------------- |
| `VITE_API_URL`     | `http://localhost:4000`  | Base URL of the backend API                               |
| `VITE_USE_MOCKS`   | `false`                  | Set to `true` to intercept API calls with MSW mocks (frontend-only development without a backend). Must be `false` on staging. |

## Running the app

```bash
npm run dev
```

Open **http://localhost:5173** in your browser.

To work without a backend, set `VITE_USE_MOCKS=true` in `.env` before starting the dev server.

## Testing

```bash
npm test            # runs all tests once (vitest run)
```

Includes unit tests, component tests (`*.test.tsx`), and accessibility checks (`src/test/a11y.test.tsx`).

## Type checking & production build

```bash
npm run typecheck   # tsc --noEmit
npm run build       # tsc --noEmit && vite build
```

> **Note:** `tsconfig.json` extends `./tsconfig.base.json`, which lives in this folder — the repo is self-contained and works as a standalone checkout.

## Project Structure

```
./
├── index.html           # Vite entry HTML
├── vite.config.ts       # Vite config (React + Tailwind plugins, port 5173)
├── tsconfig.json        # extends tsconfig.base.json (this folder)
├── .env.example         # template for env vars
├── public/              # static assets (incl. MSW mockServiceWorker.js)
└── src/
    ├── main.tsx         # entry point (starts MSW worker if VITE_USE_MOCKS=true)
    ├── app/             # App shell and routing
    ├── components/      # common + UI (button, card, input, badge...)
    ├── features/        # feature modules (payments, quotes, ...)
    ├── hooks/
    ├── lib/             # api-client, schemas, utils, errors
    ├── mocks/           # MSW handlers
    ├── pages/           # route pages (Dashboard, CreateRequest, Comparison, ...)
    ├── test/            # test helpers + a11y tests
    └── types/           # API type definitions
```

## Main Routes

| Route                          | Page               |
| ------------------------------ | ------------------ |
| `/`                            | Dashboard          |
| `/requests/new`                | Create request     |
| `/requests/:id`                | Request detail     |
| `/requests/:id/compare`        | Quote comparison   |
| `/requests/:id/recommendation` | Recommendation     |
| `/requests/:id/approve`        | Approve & pay      |
| `/requests/:id/summary`        | Summary            |
| `/quotes/:qid/review`          | Quote review       |
| `/history`                     | History            |
| `/payments/return` / `/payments/cancel` | Payment return/cancel |
