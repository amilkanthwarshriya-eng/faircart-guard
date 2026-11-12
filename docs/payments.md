# Payments

> Status: design and contract. Items marked "to verify" must be confirmed by running them in the sandbox; record results in `docs/paypal-spike.md`.

## 1. Principles

1. The backend decides the amount from the approved quotation in the database. The client never supplies amounts.
2. Returning from PayPal proves nothing. A payment is `COMPLETED` only after the backend captures and verifies status, amount and currency.
3. Capture happens once, atomically, and only from backend code. Neither the browser nor the LLM can trigger it.
4. Sandbox only. `PAYPAL_BASE_URL` is validated to `https://api-m.sandbox.paypal.com` at startup.
5. The payment goes to one configured sandbox merchant. The selected vendor is **not** the payee. No split payments or payouts.

## 2. Flow

1. Buyer approves the exact quotation and amount (`POST /api/requests/:id/approve`).
2. `POST /api/payments/create-order` loads the approval, inserts a `Payment` (`ORDER_CREATED`), calls PayPal `POST /v2/checkout/orders` (intent CAPTURE, `reference_id` = request ID, `custom_id` = payment ID, return and cancel URLs, idempotency key `create-{paymentId}`), stores the order ID, sets `APPROVAL_PENDING`, returns the approval URL.
3. The frontend redirects the buyer to PayPal; the buyer approves.
4. PayPal returns to `FRONTEND_URL/payments/return?paymentId=...`. The page calls `POST /api/payments/capture-order { paymentId }`.
5. Backend: payment must be `APPROVAL_PENDING`; `GET /v2/checkout/orders/{id}` must show `APPROVED`; atomically claim `APPROVAL_PENDING -> CAPTURING`; `POST /v2/checkout/orders/{id}/capture` with idempotency key `capture-{paymentId}`; verify; persist.
6. Webhooks reconcile status if the browser never returns or the result was pending.
7. The UI polls `GET /api/payments/:id` and shows success only for `COMPLETED`.

## 3. Verification rules (`verifyPayPalCapture`)

A capture is `COMPLETED` only if all of the following hold, otherwise the outcome is `PENDING_REVIEW` or `FAILED` and success is never shown:

- The returned order ID equals the stored order ID.
- `purchase_units[0].reference_id` equals the purchase request ID.
- A capture object exists and its status is `COMPLETED`.
- Capture `amount.currency_code` equals the stored currency.
- Capture `amount.value` equals the stored amount (decimal comparison).

`DECLINED` or `FAILED` captures map to `FAILED`. `PENDING` maps to `PENDING_REVIEW`.

## 4. Payment state machine

| From | To | Trigger |
|---|---|---|
| (new) | ORDER_CREATED | Approval valid; no active payment for it |
| ORDER_CREATED | APPROVAL_PENDING | Order created at PayPal |
| APPROVAL_PENDING | CANCELLED | Buyer cancelled or order voided |
| APPROVAL_PENDING | CAPTURING | Atomic claim by one capture request |
| CAPTURING | COMPLETED | Verified capture |
| CAPTURING | PENDING_REVIEW | Pending capture or any mismatch |
| CAPTURING | FAILED | Declined or failed |
| PENDING_REVIEW | COMPLETED / FAILED | Reconciliation by GET order or webhook |
| COMPLETED | REFUNDED | Webhook records a refund |

Illegal transitions are rejected. A final state is never regressed by an out-of-order event.

## 5. Idempotency and duplicate protection

- PayPal `PayPal-Request-Id` keys: `create-{paymentId}` and `capture-{paymentId}`; retries reuse the same key.
- Atomic claim: a conditional update from `APPROVAL_PENDING` to `CAPTURING` lets exactly one request proceed; others return current state without calling PayPal.
- Database constraints: unique `paypalOrderId`, unique `paypalCaptureId`, one active payment per approval (partial unique index), unique `WebhookEvent.paypalEventId`.
- If PayPal reports the order already captured, the backend reads the order and reconciles rather than failing.
- Stuck `CAPTURING` payments older than about two minutes are reconciled via GET order.

## 6. Webhooks

- Endpoint: `POST /api/webhooks/paypal`, mounted with the raw body parser.
- Verification: `POST /v1/notifications/verify-webhook-signature` with the transmission headers, `PAYPAL_WEBHOOK_ID` and the event; accept only `verification_status` of `SUCCESS`.
- Idempotency: insert `WebhookEvent` by PayPal event ID; a unique violation means a duplicate and returns 200.
- Handled events: order approved (log), capture completed, capture pending, capture denied, capture refunded (confirm exact names in the dashboard list). Unknown events are stored as ignored.
- Local development: expose the API with ngrok and register that URL in the sandbox app. Dashboard simulator events are commonly reported not to pass real verification (to verify); prefer a real sandbox payment.

## 7. Currency policy

PayPal's currency-codes documentation states that PayPal stopped offering domestic payment services in India on 1 April 2021 and that PayPal Payments Private Limited users cannot use INR to receive payments. The team therefore decides in Phase 1 (record in `docs/paypal-spike.md`):

- **Option A (recommended):** run the whole demo in USD with US-country sandbox accounts.
- **Option B (stretch):** procure in INR and charge USD using one fixed, labelled demo rate stored on the approval.
- **Option C:** INR on a real India-region setup, only if proven to work.

Currency is a field on request, quote, approval, payment and PayPal order; all must match.

## 8. PayPal Agent Toolkit

- Package `@paypal/agent-toolkit` (TypeScript, Node 18+), sandbox via `context.sandbox`, actions enabled selectively by configuration (to verify against the installed version).
- Use in this project: **read-only** tools for the AI agent (for example reading an order's status for the purchase summary), behind `USE_PAYPAL_TOOLKIT=true`.
- Not exposed to the LLM: any create, pay, capture, refund or dispute tool. An allow-list is enforced at startup.
- The payment path is direct Orders v2. The app works fully with the toolkit disabled.

## 9. Security checklist

- Secrets only in server env; none in Git or the frontend bundle.
- Amount, currency and order ID come from the database.
- Capture only from `APPROVAL_PENDING`, only once, only from backend code.
- Webhooks use raw body, signature verification and unique-event idempotency.
- Logs include payment ID, order ID, status transitions and PayPal debug IDs; they exclude secrets, tokens and full payloads.
- Payment routes are rate-limited, UUID-validated and authorised; CORS allows only the frontend origin.

## 10. Testing

Automated (mocked PayPal via msw): order creation, buyer cancellation, successful capture, failed capture, currency mismatch, amount mismatch, duplicate capture, already-captured reconciliation, repeated webhook, invalid signature, status reconciliation, approval changed, toolkit tool restriction, out-of-order events.

Manual: one or more full sandbox checkouts on staging with order ID, capture ID and PayPal debug IDs recorded in `docs/paypal-spike.md`. Do not claim a sandbox test passed unless it was run.

## 11. Frontend/backend contract

- `return_url`: `FRONTEND_URL/payments/return?paymentId=:id`; `cancel_url`: `FRONTEND_URL/payments/cancel?paymentId=:id`.
- Return page calls capture-order with `paymentId` only, then polls `GET /api/payments/:id`.
- Cancel page calls `POST /api/payments/:id/cancel`.
- UI states: `COMPLETED` success; `PENDING_REVIEW` pending; `FAILED` failed; `CANCELLED` cancelled; `CAPTURING` in progress.

## 12. Troubleshooting

| Symptom | Likely cause | Action |
|---|---|---|
| 401 from token endpoint | Wrong credentials or environment | Re-copy sandbox credentials; confirm Sandbox mode |
| Order rejected or PayPal page error | Unsupported currency or mismatched account regions | Use USD and US sandbox accounts; read the error body and debug ID |
| Capture: order not approved | Buyer has not approved | GET order first; require `APPROVED` |
| Capture: already captured | Duplicate capture | GET order and reconcile |
| Instrument declined | Funding source failed | Let the buyer restart approval |
| Webhook verification FAILURE | Wrong webhook ID, parsed body, simulator event | Use the raw body, check the webhook ID, test with a real payment |
| No webhooks locally | ngrok URL changed | Update the webhook URL in the dashboard |
