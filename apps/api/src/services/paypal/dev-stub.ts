import Decimal from "decimal.js";
import type { PayableProvider } from "./service";

/** DEV ONLY: lets you test the PayPal flow before Member 3's approval module exists. Disabled in production. */
export function devStubPayables(): PayableProvider {
  return {
    async getApprovedPayable(requestId) {
      return {
        requestId, approvalId: `dev-approval-${requestId}`, quoteId: "dev-quote",
        amount: new Decimal(process.env.DEV_STUB_AMOUNT ?? "215.00"),
        currency: process.env.DEV_STUB_CURRENCY ?? "USD",
        description: "FairCart Guard dev stub purchase", valid: true,
      };
    },
  };
}
