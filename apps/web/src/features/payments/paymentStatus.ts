import type { PaymentStatus } from "../../types/api";

/** The ONLY success state. Redirects, query strings and capture HTTP 200 never count. */
export const isVerifiedSuccess = (s?: PaymentStatus | null): boolean => s === "COMPLETED";
const TERMINAL: PaymentStatus[] = ["COMPLETED", "PENDING_REVIEW", "FAILED", "CANCELLED", "REFUNDED"];
export const isTerminal = (s?: PaymentStatus | null): boolean => !!s && TERMINAL.includes(s);

export const STATUS_COPY: Record<PaymentStatus, { tone: "ok" | "warn" | "bad" | "info"; title: string; body: string }> = {
  ORDER_CREATED: { tone: "info", title: "Waiting for PayPal approval", body: "Approve the payment on PayPal to continue." },
  APPROVAL_PENDING: { tone: "info", title: "Waiting for PayPal approval", body: "Approve the payment on PayPal to continue." },
  CAPTURING: { tone: "info", title: "Confirming your payment with PayPal", body: "This usually takes a few seconds." },
  COMPLETED: { tone: "ok", title: "Payment verified", body: "PayPal confirmed the capture and our server verified the amount and currency." },
  PENDING_REVIEW: { tone: "warn", title: "Payment is under review", body: "This payment is not confirmed yet." },
  FAILED: { tone: "bad", title: "Payment failed", body: "No payment was confirmed. Return to approval to try again." },
  CANCELLED: { tone: "info", title: "Payment cancelled", body: "Nothing was confirmed." },
  REFUNDED: { tone: "info", title: "Payment refunded", body: "This payment was refunded." },
};
