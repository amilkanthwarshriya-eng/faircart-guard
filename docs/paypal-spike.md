# PayPal Spike and Agent Toolkit Findings

> **STATUS: TEMPLATE. NOTHING BELOW HAS BEEN RUN YET.** Fill each field only after actually running the step. Do not record assumptions as results. Redact secrets and tokens before committing.

Owner: Member 4. Dates: ____ to ____.

## 1. Accounts

| Item | Value |
|---|---|
| Sandbox app name | |
| Business (merchant) sandbox account email | |
| Personal (buyer) sandbox account email | |
| Country of both accounts | |
| Credentials stored in | (password manager, not Git) |

## 2. Manual Orders v2 flow

| Step | Result | Notes |
|---|---|---|
| Token request succeeded | yes / no | `expires_in` = ____ seconds |
| Create order (USD) | order ID: | status after creation: |
| Approval link relation | `payer-action` / `approve` | |
| Buyer approval completed | yes / no | order status after approval: |
| GET order | | |
| Capture | capture ID: | capture status: |
| `paypal-debug-id` values | | |
| Duplicate capture (same request ID) | | response: |
| Duplicate capture (new request ID) | | response: |
| Wrong amount or currency error body | | |

Paste redacted response samples under `docs/samples/`.

## 3. Currency test

| Test | Result |
|---|---|
| INR order on a US sandbox merchant | |
| USD order on a US sandbox merchant | |

**Decision:** Option A / B / C (see `docs/payments.md`). Decided on: ____ . Agreed by M1: ____ M3: ____ .

## 4. Agent Toolkit

| Question | Answer |
|---|---|
| Installed package name and version | |
| Node version used | |
| Exported entry points | |
| Constructor options actually required | |
| Real tool names from `Object.keys(toolkit.getTools())` | |
| Does `get_order` work in sandbox? | |
| Does `create_order` accept return/cancel URLs, reference ID, idempotency key? | |
| Does `create_order` return the buyer approval link? | |
| Can payment-moving tools be left disabled by configuration? | |
| Works with Gemini through the Vercel AI SDK? | |
| Works with Claude through the Vercel AI SDK? | |

**Decision:** Option A (direct Orders v2 only) / B (toolkit inside backend wrapper) / C (read-only agent tool). Date: ____ .

## 5. Webhooks

| Item | Result |
|---|---|
| Webhook URL registered | |
| Events subscribed (exact names) | |
| Webhook ID recorded in env (not here) | yes / no |
| Real event received and verified | yes / no, event type: |
| Real event JSON saved under `docs/samples/` | yes / no |
| Payload path for the order ID in capture events | |
| Simulator event verification behaviour | |

## 6. Deployment checks

| Item | Result |
|---|---|
| Render plan limits (sleep, database expiry) as read on ____ | |
| Staging full checkout completed | yes / no, payment ID: |

## 7. End-to-end evidence

| Run | Date | Environment | Order ID | Capture ID | Final status | Evidence link |
|---|---|---|---|---|---|---|
| 1 | | | | | | |
| 2 | | | | | | |
