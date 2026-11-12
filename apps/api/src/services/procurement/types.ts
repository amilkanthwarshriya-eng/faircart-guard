/**
 * Shared status contracts (frozen in the team workflow PDF, section 6.1) and the plain
 * record shapes used by the procurement engine. These are intentionally free of any
 * Prisma import so rules / ranking / approval stay pure and unit-testable.
 */

export const REQUEST_STATUSES = [
  'DRAFT', 'COLLECTING_QUOTES', 'ANALYZED', 'AWAITING_APPROVAL', 'APPROVED',
  'PAYMENT_IN_PROGRESS', 'PAID', 'PAYMENT_FAILED', 'CANCELLED',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const QUOTE_STATUSES = [
  'UPLOADED', 'EXTRACTED', 'NEEDS_REVIEW', 'REVIEWED', 'ELIGIBLE', 'INELIGIBLE', 'EXPIRED',
] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'INVALIDATED'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const PAYMENT_STATUSES = [
  'ORDER_CREATED', 'APPROVAL_PENDING', 'CAPTURING', 'COMPLETED', 'PENDING_REVIEW', 'FAILED', 'CANCELLED', 'REFUNDED',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Request statuses in which money may already be moving: quotes/requests become read-only. */
export const LOCKED_REQUEST_STATUSES: readonly RequestStatus[] = ['PAYMENT_IN_PROGRESS', 'PAID', 'CANCELLED'];

export interface SpecConfirmation {
  spec: string;
  confirmed: boolean;
  /** Exact quotation text supporting the confirmation. No evidence => not counted as confirmed. */
  evidence: string | null;
}

export interface Uncertainty {
  field: string;
  reason: string;
}

export interface LineItemRecord {
  description: string;
  quantity: string | null;
  unitPrice: string | null;
  lineTotal: string | null;
}

/** Money values are decimal STRINGS (never floats). */
export interface RequestRecord {
  id: string;
  title: string;
  quantity: number;
  budget: string;
  currency: string;
  deadlineDays: number;
  requiredSpecs: string[];
  status: RequestStatus;
  /** Baseline for converting a quoted delivery DATE into delivery DAYS. */
  createdAt: Date;
}

export interface QuoteRecord {
  id: string;
  requestId: string;
  vendorId: string;
  vendorName: string;
  status: QuoteStatus;
  currency: string;
  product: string | null;
  quantity: number | null;
  unitPrice: string | null;
  lineItems: LineItemRecord[];
  subtotal: string | null;
  tax: string | null;
  shipping: string | null;
  otherFees: string | null;
  otherFeesDescription: string | null;
  discount: string | null;
  statedTotal: string | null;
  deliveryDays: number | null;
  deliveryDate: Date | null;
  validUntil: Date | null;
  paymentTerms: string | null;
  specConfirmations: SpecConfirmation[];
  uncertainties: Uncertainty[];
  buyerReviewed: boolean;
  analyzedAt: Date | null;
}

export interface ApprovalRecord {
  id: string;
  requestId: string;
  quoteId: string;
  amount: string;
  currency: string;
  status: ApprovalStatus;
  fingerprint: string;
  quoteContentHash: string;
  approvedBy: string | null;
  approvedAt: Date | null;
  invalidatedAt: Date | null;
  invalidationReason: string | null;
}
