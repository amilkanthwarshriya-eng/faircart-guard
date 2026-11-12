import Decimal from "decimal.js";
import type { PayPalOrder } from "./types";

export type CaptureOutcome =
  | { kind: "COMPLETED"; captureId: string }
  | { kind: "PENDING_REVIEW"; reason: string; captureId?: string }
  | { kind: "FAILED"; reason: string };

/** The trust gate: pure function. COMPLETED only if order, reference, status, currency and amount all match the database. */
export function verifyPayPalCapture(
  order: PayPalOrder,
  exp: { orderId: string; requestId: string; amount: Decimal; currency: string },
): CaptureOutcome {
  const review = (reason: string, captureId?: string): CaptureOutcome => ({ kind: "PENDING_REVIEW", reason, captureId });
  if (order.id !== exp.orderId) return review("ORDER_ID_MISMATCH");
  const unit = order.purchase_units?.[0];
  if (unit?.reference_id !== exp.requestId) return review("REFERENCE_MISMATCH");
  const cap = unit?.payments?.captures?.[0];
  if (!cap) return review("NO_CAPTURE_DATA");
  if (cap.status === "DECLINED" || cap.status === "FAILED") return { kind: "FAILED", reason: cap.status };
  if (cap.status !== "COMPLETED") return review(cap.status, cap.id);
  if (cap.amount.currency_code !== exp.currency) return review("CURRENCY_MISMATCH", cap.id);
  if (!new Decimal(cap.amount.value).equals(exp.amount)) return review("AMOUNT_MISMATCH", cap.id);
  return { kind: "COMPLETED", captureId: cap.id };
}
