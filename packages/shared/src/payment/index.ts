import { z } from "zod";

export const PaymentStatusSchema = z.enum([
  "ORDER_CREATED", "APPROVAL_PENDING", "CAPTURING", "COMPLETED", "PENDING_REVIEW", "FAILED", "CANCELLED", "REFUNDED",
]);
export type PaymentStatusDto = z.infer<typeof PaymentStatusSchema>;

export const CreateOrderBody = z.object({ requestId: z.string().trim().min(1) });
export const CaptureOrderBody = z.object({ paymentId: z.string().trim().min(1) });
export const PaymentIdParam = z.object({ id: z.string().trim().min(1) });

/** Response of create/capture/get/cancel (money as decimal strings). */
export interface PaymentDto {
  id: string; purchaseRequestId: string; quoteId: string; status: PaymentStatusDto;
  paypalOrderId: string | null; paypalCaptureId: string | null;
  amount: string; currency: string;
  rawCaptureStatus: string | null; failureReason: string | null;
  approvalUrl: string | null; capturedAt: string | null; createdAt: string; updatedAt: string;
}
