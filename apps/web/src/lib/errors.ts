export class ApiError extends Error {
  constructor(public code: string, message: string, public httpStatus?: number) { super(message); }
}
const COPY: Record<string, string> = {
  APPROVAL_INVALID: "The approval is no longer valid. Review the quotation and approve again.",
  AMOUNT_MISMATCH: "The amount no longer matches the quotation. Review it and approve again.",
  PAYMENT_EXISTS: "A payment already exists for this purchase. Check its status.",
  QUOTE_EXPIRED: "This quotation has expired. Request a new quotation.",
  NOT_APPROVED_BY_BUYER: "PayPal has not recorded your approval yet. Return to PayPal to approve.",
  ALREADY_FINAL: "This payment has already been finalised. Showing its current status.",
  PAYPAL_UNAVAILABLE: "PayPal is temporarily unavailable. Try again shortly.",
  NETWORK: "Could not reach the server. Check your connection and try again.",
};
export function friendlyError(e: unknown): string {
  if (e instanceof ApiError) return COPY[e.code] ?? (e.httpStatus === 429 ? "Too many requests. Wait a moment." : "Something went wrong. Try again.");
  return COPY.NETWORK;
}
