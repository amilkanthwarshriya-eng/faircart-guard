// Local view types matching docs/api.md. packages/shared is still empty; once M3/M4 export
// their types, replace these with imports from "@faircart/shared" (same names).
export const PAYMENT_STATUSES = [
  "ORDER_CREATED", "APPROVAL_PENDING", "CAPTURING", "COMPLETED",
  "PENDING_REVIEW", "FAILED", "CANCELLED", "REFUNDED",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** GET /api/payments/:id */
export interface PaymentView {
  id: string;
  purchaseRequestId?: string;
  quoteId?: string;
  status: PaymentStatus;
  paypalOrderId?: string | null;
  paypalCaptureId?: string | null;
  amount?: string;
  currency?: string;
  failureReason?: string | null;
}
/** POST /api/payments/create-order */
export interface CreateOrderResponse { paymentId: string; status: PaymentStatus; approvalUrl: string }
/** POST /api/requests/:id/approve */
export interface ApprovalResponse { approvalId: string; quoteId: string; approvedAmount: string; currency: string; status: string }
/** GET /health */
export interface HealthResponse { status: string; db?: string; mode?: "demo" | "live"; llmProvider?: string }
/** Error body per docs/api.md */
export interface ApiErrorBody { code: string; message: string; details?: unknown }
