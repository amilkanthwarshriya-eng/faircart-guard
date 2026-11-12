import type Decimal from "decimal.js";

export type PaymentStatus =
  | "ORDER_CREATED" | "APPROVAL_PENDING" | "CAPTURING" | "COMPLETED"
  | "PENDING_REVIEW" | "FAILED" | "CANCELLED" | "REFUNDED";

export interface Payment {
  id: string;
  purchaseRequestId: string;
  quoteId: string;
  approvalId: string;
  amount: Decimal;
  currency: string;
  status: PaymentStatus;
  paypalOrderId?: string;
  approvalUrl?: string;
  paypalCaptureId?: string;
  rawCaptureStatus?: string;
  failureReason?: string;
  paypalDebugId?: string;
  capturedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PayPalLink { rel: string; href: string }
export interface PayPalCapture { id: string; status: string; amount: { currency_code: string; value: string } }
export interface PayPalOrder {
  id: string;
  status: string;
  links: PayPalLink[];
  purchase_units?: Array<{
    reference_id?: string;
    custom_id?: string;
    payments?: { captures?: PayPalCapture[] };
  }>;
}
