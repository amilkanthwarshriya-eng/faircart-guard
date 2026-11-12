# Demo Script

> Confirm the maximum video length and required items on the Devpost rules page. This script targets about 5 minutes; trim scenes 2 and 3 first if you must cut.
> Demo values below are **illustrative and scaled to USD** (recommended currency decision). If the team keeps INR for procurement, use the INR seed and say clearly how the PayPal charge is converted.

## Headline line (say it, and put it on the final slide)

"FairCart Guard doesn't just find the cheapest vendor. It helps buyers make evidence-based purchasing decisions, enforces spending rules, and connects approved decisions to verified PayPal payments."

## Honesty statements to say on camera

- "Payments run in the PayPal sandbox, to one configured test merchant. The recommended vendor is not the payee; we do not implement vendor payouts."
- "This run uses live analysis from <provider name>." (or "This run uses labelled demo data.")

## Setup before recording

- Seed data loaded: request "College Event T-Shirts" (100 units, budget 240.00 USD, 7-day deadline, cotton + custom printing).
- Quotes: A total 215.00, 5 days; B total 227.00, 4 days, with an extra fee; C total 203.00, 10 days.
- Services awake, `/health` OK, sandbox buyer login tested, webhook registered, browser tidy.

## Scenes

| # | Lead | Show | Say | Expected screen | Fallback |
|---|---|---|---|---|---|
| 1 | M1 | Create the purchase request | "A club needs 100 T-shirts, budget 240, within 7 days." | Request saved, status visible | Use the seeded request |
| 2 | M1 / M3 | Add the three quotations (upload one PDF, enter one manually) | "Quotes arrive as PDFs or emails; we accept uploads or manual entry." | Three quote cards | Use seeded quotes |
| 3 | M2 | Run extraction; show prices, tax, shipping, fees, delivery with evidence | "Every value is tied to text in the quotation. Anything unclear stays unknown." | Extracted fields with evidence; uncertain fields highlighted for review | Show stored extraction |
| 4 | M2 | The AI flags Quote B's extra fee with evidence | "It flags the fee as something to disclose. It does not call it fraud." | Risk card with the quoted line | Show the stored risk |
| 5 | M3 | Backend rules: Quote C rejected for 10-day delivery | "Rules are code, not AI. The cheapest quote fails the deadline." | Rule checks table with failed delivery rule | Show rule table |
| 6 | M3 / M1 | Recommendation with score breakdown and alternatives | "Here is why A ranks first, how B compares, and what is still uncertain." | Winner, score components, trade-offs | Show stored recommendation |
| 7 | M3 / M1 | Approve the exact quotation and amount | "Approval is bound to this quote and this amount." | Approval summary with budget remaining, confirmation | None needed |
| 8 | M4 | Create the PayPal order, log in as sandbox buyer, approve | "The backend created this order from the approved amount, not from the browser." | PayPal page showing the expected amount | Recorded fallback video |
| 9 | M4 | Return to the app; show verified capture, order ID and capture ID; optional read-only toolkit check | "Success appears only after the backend captured and verified status, amount and currency." | COMPLETED with IDs | Show the stored payment record and PayPal activity |
| 10 | M1 | Purchase summary and history | "Everything is recorded: request, comparison, approval, payment references, remaining budget." | Summary page | Show history list |

## Likely judge questions

| Question | Short answer |
|---|---|
| Why not pay the vendor through PayPal? | Payouts and split payments are out of scope for the MVP. One sandbox merchant demonstrates verified checkout honestly. |
| Why not let the AI decide? | The model can be manipulated by document text. Rules, scores, approval and payment are deterministic code; the model only reads and explains. |
| How do you handle a malicious quotation? | Documents are treated as untrusted data in a delimited block with no tools; output is schema-validated and evidence is checked against the source text. |
| Why Orders v2 and not only the Agent Toolkit? | We need controlled return URLs, idempotency and strict verification. The toolkit is used read-only so the agent can check payment facts but cannot create or capture payments. |
| What if PayPal reports pending or the browser never returns? | The payment stays `PENDING_REVIEW` or is reconciled by webhook; success is never shown without verification. |
| What stops duplicate charges? | Idempotency keys, an atomic claim before capture, unique database constraints and webhook event de-duplication. |
| Which LLM did you use? | State the provider used for the demo, and that the AI layer is provider-neutral. |

## Evidence pack to keep

Screenshots of each scene, order ID, capture ID, PayPal debug IDs, test run output, Postman run, architecture diagram, link to `docs/`.
