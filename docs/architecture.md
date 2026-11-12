# Architecture

> Status: design and contract. Update this file when implementation changes.

## 1. Goals

Build an AI procurement agent that recommends with evidence, enforces rules in code, requires explicit buyer approval, and connects the approved decision to a verified PayPal sandbox payment.

## 2. System overview

```
Buyer (browser, React SPA)
        |  HTTPS, JSON
        v
Express API (Node + TypeScript)  -- Zod validation, auth, rate limit, error handler
  |-- Quote intake         upload / manual entry / PDF text
  |-- AI service           extract, analyse, explain   (LLMClient -> Gemini | Claude)
  |-- Procurement engine   rules, ranking, approval binding
  |-- PayPal service       Orders v2, capture, verify
  |-- Webhook handler      signature verify, idempotent processing
        |            |                |                  |
   PostgreSQL   LLM provider   PayPal Sandbox      Agent Toolkit (read-only, optional)
```

| Component | Owner | Responsibility |
|---|---|---|
| Web app | M1 | 7 pages, typed API client, status-gated payment UI |
| AI service | M2 | Extraction, risk analysis, explanation, injection defence |
| Procurement engine and core API | M3 | Money maths, rules, ranking, approval, CRUD, upload, summary |
| PayPal, integration, DevOps | M4 | Orders v2, payment state machine, webhooks, toolkit, deploy, docs |

## 3. Trust boundaries

1. **Browser is untrusted.** It never supplies amounts, order IDs, or payment outcomes. It sends request IDs, payment IDs and explicit approvals only.
2. **Uploaded documents are untrusted.** Text in a quotation is data, never instructions. The model receives it in a delimited block with no tools attached.
3. **The LLM is advisory.** It cannot change eligibility, ranking, approval or payment. All numbers come from backend calculations.
4. **PayPal redirects are untrusted.** Returning from PayPal proves nothing; the backend verifies the order and capture with PayPal.
5. **Secrets stay on the backend.** Anthropic/Gemini keys and the PayPal secret never reach the frontend.

## 4. End-to-end data flow

1. `POST /api/requests` stores the request.
2. `POST /api/requests/:id/quotes` stores quotes (upload or manual).
3. `POST /api/quotes/:id/extract` runs PDF text extraction and the LLM; output is validated with Zod and checked for evidence; the buyer reviews uncertain fields (`PATCH /api/quotes/:id`).
4. `POST /api/requests/:id/analyze` runs: backend totals, LLM risk analysis, deterministic rules, ranking, LLM explanation. Results are stored as `QuoteRisk` and `Recommendation`.
5. `POST /api/requests/:id/approve` stores an `Approval` bound to quote ID, amount and currency.
6. `POST /api/payments/create-order` creates a PayPal order using the approved amount from the database.
7. The buyer approves on PayPal and returns to the app.
8. `POST /api/payments/capture-order` captures once, verifies status, amount and currency, and persists IDs.
9. `POST /api/webhooks/paypal` reconciles status idempotently.
10. `GET /api/requests/:id` returns the purchase summary.

## 5. Money handling

- Money is stored as `Decimal` (or integer minor units). No JavaScript floating-point for authoritative values.
- Totals are recalculated in the backend: subtotal + tax + shipping + other fees - discount. A stated total that disagrees is flagged as inconsistent.
- Rounding is applied once with a documented rule.
- Quote, approval, payment and PayPal order currencies must match or the flow stops.

## 6. Procurement rules (deterministic)

| # | Rule | Result values |
|---|---|---|
| 1 | Total cost does not exceed the budget | pass / fail |
| 2 | Delivery meets the deadline | pass / fail / needs review (unknown) |
| 3 | Mandatory specifications are satisfied | pass / fail / needs review |
| 4 | Required information is present or flagged for review | pass / needs review |
| 5 | Quotation is not expired | pass / fail |
| 6 | Uncertain or contradictory data is not silently accepted | pass / needs review |
| 7 | Only eligible quotations can be recommended | enforced |

If no quotation is eligible the API returns: "No eligible vendor found. Review the purchasing requirements or request new quotations."

## 7. Ranking

Hard constraints first; only eligible quotes are ranked.

- Cost score: min-max among eligible quotes, `(max - total) / (max - min)`, equal totals give 1.0.
- Delivery score: `(deadline_days - delivery_days) / deadline_days`, clamped to 0..1; unknown delivery scores 0 and is flagged.
- Specification compliance: share of required specs confirmed with evidence.
- Completeness: share of required fields present and reviewed.
- Final score: weighted sum. Default weights cost 45, delivery 25, specifications 20, completeness 10, configurable.

Known limitation: with only two eligible quotes, min-max gives 1.0 and 0.0 to the cheaper and dearer one. The team may choose a budget-relative cost score (`1 - total / budget`) instead; record the decision here.

## 8. State machines

**Purchase request:** DRAFT, COLLECTING_QUOTES, ANALYZED, AWAITING_APPROVAL, APPROVED, PAYMENT_IN_PROGRESS, PAID, PAYMENT_FAILED, CANCELLED.

**Quote:** UPLOADED, EXTRACTED, NEEDS_REVIEW, REVIEWED, ELIGIBLE, INELIGIBLE, EXPIRED.

**Approval:** PENDING, APPROVED, INVALIDATED (quote or amount changed).

**Payment:** see `docs/payments.md`.

## 9. AI layer

- `LLMClient.generateJson(schema, prompt)` returns schema-validated JSON or throws a typed `AiError`. Provider SDKs live only inside adapters.
- Adapters: Gemini (free tier, default for development) and Claude (optional). Provider and model come from environment variables.
- Controls: timeouts, token limits, retries only for transient failures (429, 5xx, overloaded), one JSON-repair retry, log redaction, evidence strings checked against source text, extra fields rejected.
- Demo mode returns labelled fixtures. Live mode fails loudly and never fakes output.
- Free tiers may log prompts and are rate-limited: use sample data only and cache extraction results by file hash.

## 10. Security summary

- Zod validation on every input; UUID validation on IDs; ownership checks server-side.
- helmet, CORS limited to `FRONTEND_URL`, rate limiting on payment and upload routes.
- Uploads: MIME and size validated, stored outside the public web root.
- PayPal base URL validated to the sandbox URL at startup; webhooks verified with the raw body.
- Logs exclude secrets, tokens and full payloads.

## 11. Deployment topology

Render: static site (frontend), web service (API), managed PostgreSQL. A sandbox webhook points to the API URL. See `docs/deployment.md`.

## 12. Out of scope

Split payments, vendor payouts, blockchain, cryptocurrency, live (production) PayPal.
