# API Reference

> Status: contract. Endpoints are not final until implemented and tested. Base path `/api`. JSON in and out unless noted.
> Authentication model: to be decided by the team (open decision). Ownership of each purchase request is enforced server-side; frontend navigation is never treated as authorization.

## Conventions

- Money values are decimal **strings** (for example `"215.00"`), never floats.
- IDs are UUIDs; invalid IDs return 400.
- Errors share one shape: `{ "code": "STRING", "message": "Human readable", "details": {} }`. PayPal internals are never returned.
- Dates are ISO 8601.

| HTTP | Meaning |
|---|---|
| 400 | Invalid input |
| 401 / 403 | Not authenticated / not allowed |
| 404 | Not found |
| 409 | Conflict (already captured, approval invalidated, duplicate) |
| 422 | Business rule failure |
| 429 | Rate limited |
| 502 | Upstream (PayPal or LLM) unavailable |

## Health

`GET /health` returns `{ "status": "ok", "db": "ok", "mode": "demo|live", "llmProvider": "gemini|anthropic" }`. Used by Render's health check.

## Purchase requests

### POST /api/requests
Body: `{ title, description, quantity, budget, currency, deadline, specifications: string[], qualityPreferences?: string }`
Response 201: the request with `id`, `status: "DRAFT"`.

### GET /api/requests
Query: `status?`, `page?`, `pageSize?`. Response: `{ items: Request[], total }`.

### GET /api/requests/:id
Returns the request plus quotes, latest recommendation, approval and payment summary (the purchase summary).

### PATCH /api/requests/:id
Partial update of requirements. Allowed only before approval; after approval returns 409. Changing budget, deadline or specifications invalidates the recommendation and any approval.

## Quotations

### POST /api/requests/:id/quotes
Two forms:
- `multipart/form-data`: field `file` (PDF only, maximum size set by `MAX_UPLOAD_MB`), optional `vendorName`, `vendorEmail`.
- `application/json` (manual): `{ vendor: { name, email? }, lineItems: [{ description, quantity, unitPrice, lineTotal }], subtotal?, tax?, shipping?, otherFees?, discount?, total?, currency, deliveryDays? | deliveryDate?, validUntil?, notes? }`.
Errors: 400 invalid file type or size. Response 201: quote with `status: "UPLOADED"` or `"REVIEWED"` for manual entries.

### GET /api/requests/:id/quotes
Returns all quotes with line items and risks.

### POST /api/quotes/:id/extract
Runs PDF text extraction and the LLM. Response: structured extraction, `missingFields[]`, `uncertainties[]`, and per-field `evidence`. Quote status becomes `EXTRACTED` or `NEEDS_REVIEW`. Errors: 422 scanned PDF without text (enter manually), 502 LLM unavailable (no fake output).

### GET /api/quotes/:id
Returns one quote with line items, risks and extraction evidence.

### PATCH /api/quotes/:id
Buyer review and corrections. Body: any editable quote fields plus `reviewed: true`. Editing amounts after approval invalidates the approval.

## AI analysis

### POST /api/requests/:id/analyze
Runs totals, risk analysis, rules, ranking and explanation. Requires every quote to be extracted and reviewed (or flagged).
Response 200:
```json
{
  "mode": "live",
  "provider": "gemini",
  "weights": { "cost": 0.45, "delivery": 0.25, "specs": 0.20, "completeness": 0.10 },
  "ranking": [{ "quoteId": "uuid", "score": 0.821, "components": { "cost": 1, "delivery": 0.286, "specs": 1, "completeness": 1 }, "total": "215.00", "budgetRemaining": "25.00" }],
  "ineligible": [{ "quoteId": "uuid", "reasons": ["DELIVERY_AFTER_DEADLINE"] }],
  "ruleChecks": [{ "quoteId": "uuid", "rule": "BUDGET", "result": "pass", "detail": "..." }],
  "risks": [{ "quoteId": "uuid", "type": "AMBIGUOUS_FEE", "severity": "medium", "description": "...", "evidence": "exact text from quotation" }],
  "recommendation": { "quoteId": "uuid", "explanation": "..." },
  "noEligibleVendor": false
}
```
If no quote is eligible: `noEligibleVendor: true` with the message "No eligible vendor found. Review the purchasing requirements or request new quotations."

### GET /api/requests/:id/recommendation
Returns the stored recommendation, or 404 if analysis has not run. Responses carry `mode` so demo data is always labelled.

## Approval

### POST /api/requests/:id/approve
Body: `{ quoteId, approvedAmount, currency, confirm: true }`.
Rules: the quote must be eligible, reviewed and unexpired; the amount and currency must equal the backend-calculated values or the request is rejected with 409 `AMOUNT_MISMATCH`. Duplicate identical approvals return the existing approval (idempotent). If the quote or amount later changes, the approval becomes `INVALIDATED`.
Response 201: `{ approvalId, quoteId, approvedAmount, currency, status: "APPROVED", approvedAt }`.

## Payments

See `docs/payments.md` for the full flow and state machine.

### POST /api/payments/create-order
Body: `{ requestId }` only. The amount comes from the approval in the database.
Response 201: `{ paymentId, status: "APPROVAL_PENDING", approvalUrl }`.
Errors: 409 `APPROVAL_INVALID` / `PAYMENT_EXISTS`, 422 `QUOTE_EXPIRED`, 502 `PAYPAL_UNAVAILABLE`.

### POST /api/payments/capture-order
Body: `{ paymentId }` only. Captures once and verifies status, amount and currency.
Response 200: `{ paymentId, status, captureId?, amount, currency, capturedAt? }`.
`status` is one of `COMPLETED`, `PENDING_REVIEW`, `FAILED`. Repeat calls return the stored result without contacting PayPal again.
Errors: 409 `NOT_APPROVED_BY_BUYER`, 409 `ALREADY_FINAL`, 502 `PAYPAL_UNAVAILABLE`.

### GET /api/payments/:id
Returns `{ id, purchaseRequestId, quoteId, status, paypalOrderId, paypalCaptureId, amount, currency, rawCaptureStatus, failureReason, createdAt, updatedAt }`. May reconcile with PayPal if the payment is `PENDING_REVIEW` or stuck in `CAPTURING`. The UI shows success only when `status === "COMPLETED"`.

### POST /api/payments/:id/cancel
Marks `ORDER_CREATED` or `APPROVAL_PENDING` payments `CANCELLED`. Idempotent. Added to the original list so the cancel page can record the outcome truthfully.

## Webhooks

### POST /api/webhooks/paypal
Raw JSON body (the route uses the raw body for signature verification). Verifies the PayPal signature, stores the event once by PayPal event ID, and reconciles payment state.
Responses: 200 processed or duplicate, 400 invalid signature, 5xx only when a retry is wanted.

## Enumerations

- Payment status: `ORDER_CREATED, APPROVAL_PENDING, CAPTURING, COMPLETED, PENDING_REVIEW, FAILED, CANCELLED, REFUNDED`
- Approval status: `PENDING, APPROVED, INVALIDATED`
- Quote status: `UPLOADED, EXTRACTED, NEEDS_REVIEW, REVIEWED, ELIGIBLE, INELIGIBLE, EXPIRED`
- Risk types: `HIDDEN_CHARGE, AMBIGUOUS_FEE, INCONSISTENT_TOTAL, MISSING_INFO, DELIVERY_RISK, SPEC_CONCERN, EXPIRED_QUOTE`
- Risk severity: `low, medium, high`
