import type { PaymentStatus } from "./types";

export const ALLOWED: Record<PaymentStatus, PaymentStatus[]> = {
  ORDER_CREATED: ["APPROVAL_PENDING", "FAILED", "CANCELLED"],
  APPROVAL_PENDING: ["CAPTURING", "CANCELLED", "FAILED"],
  CAPTURING: ["COMPLETED", "PENDING_REVIEW", "FAILED"],
  PENDING_REVIEW: ["COMPLETED", "FAILED"],
  COMPLETED: ["REFUNDED"],
  FAILED: [], CANCELLED: [], REFUNDED: [],
};
export const canTransition = (from: PaymentStatus, to: PaymentStatus) => ALLOWED[from].includes(to);
export const isFinal = (s: PaymentStatus) => ALLOWED[s].length === 0;
export const ACTIVE_STATUSES: PaymentStatus[] = ["ORDER_CREATED", "APPROVAL_PENDING", "CAPTURING", "COMPLETED", "PENDING_REVIEW"];
