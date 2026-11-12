/**
 * Typed response contracts for the frontend (Member 1). All money values are decimal STRINGS.
 * Fields marked `| null` / optional are integration points that may be empty until Member 2 / Member 4 land.
 */
import type { QuoteEvaluation } from '../services/procurement/rules';
import type { RankedEntry, RankingResult, RankingWeights } from '../services/procurement/ranking';

export interface ApiSuccess<T> { data: T; meta?: Record<string, unknown> }
export interface ApiError { error: { code: string; message: string; details?: unknown } }

export interface RequestDto {
  id: string; title: string; description: string | null; quantity: number; budget: string; currency: string;
  deadlineDays: number; deadline: string; requiredSpecs: string[]; status: string; createdAt: string; updatedAt: string;
}

export interface QuoteDto {
  id: string; requestId: string; vendor: { id: string; name: string; email: string | null };
  source: 'MANUAL' | 'UPLOADED'; status: string; currency: string;
  product: string | null; quantity: number | null; unitPrice: string | null;
  lineItems: { description: string; quantity: string | null; unitPrice: string | null; lineTotal: string | null }[];
  subtotal: string | null; tax: string | null; shipping: string | null; otherFees: string | null; otherFeesDescription: string | null;
  discount: string | null; statedTotal: string | null;
  /** Authoritative, backend-calculated total. null when it cannot be calculated. */
  calculatedTotal: string | null;
  totalsCheck: { consistent: boolean | null; difference: string | null; missing: string[] };
  deliveryDays: number | null; deliveryDate: string | null; validUntil: string | null; paymentTerms: string | null;
  specConfirmations: { spec: string; confirmed: boolean; evidence: string | null }[];
  uncertainties: { field: string; reason: string }[];
  buyerReviewed: boolean; reviewedAt: string | null; reviewedFields: string[]; analyzedAt: string | null;
  file: { name: string; size: number | null; sha256: string | null } | null;
  notes: string | null; createdAt: string; updatedAt: string;
}

export interface RiskDto {
  id: string; quoteId: string; category: string; severity: 'LOW' | 'MEDIUM' | 'HIGH'; title: string; description: string;
  evidence: string | null; source: 'AI' | 'DEMO_FIXTURE';
}

export interface RecommendationDto {
  id: string; requestId: string; createdAt: string;
  winnerQuoteId: string | null; winner: RankedEntry | null;
  noEligibleMessage: string | null;
  weights: RankingWeights;
  ranking: RankedEntry[];
  rules: QuoteEvaluation[];
  risks: RiskDto[];
  explanation: { text: string; json: unknown } | null;
  ai: { status: 'OK' | 'UNAVAILABLE' | 'FAILED' | string; source: string; error: string | null; isDemoFixture: boolean };
}

export interface ApprovalDto {
  id: string; requestId: string; quoteId: string; amount: string; currency: string;
  status: 'PENDING' | 'APPROVED' | 'INVALIDATED'; fingerprint: string;
  approvedBy: string | null; approvedAt: string | null; invalidatedAt: string | null; invalidationReason: string | null;
}

export interface PaymentSummaryDto {
  id: string; status: string; amount: string; currency: string;
  paypalOrderId: string | null; paypalCaptureId: string | null;
  /** true only when Member 4's backend verified status + amount + currency (status COMPLETED and verifiedAt set). */
  verified: boolean; verifiedAt: string | null; completedAt: string | null;
}

export interface PurchaseSummaryDto {
  request: RequestDto;
  quotes: (QuoteDto & { evaluation: QuoteEvaluation | null; ranking: RankedEntry | null })[];
  /** Live deterministic result computed from the CURRENT data. */
  analysis: { ranking: RankingResult; winnerQuoteId: string | null; noEligibleMessage: string | null };
  /** Last persisted analysis (AI parts included); null before the first analyze call. May be older than `analysis`. */
  recommendation: RecommendationDto | null;
  approval: ApprovalDto | null;
  approvalHistory: ApprovalDto[];
  /** Member 4 integration - null/empty until payments exist. */
  payments: PaymentSummaryDto[];
  budget: {
    total: string; currency: string;
    /** Amount committed by an active approval (or null). */
    committed: string | null;
    /** budget - committed; null when nothing is approved. */
    remaining: string | null;
    /** budget - recommended winner total; projection only. */
    projectedRemaining: string | null;
  };
}

export interface AnalyzeResponseDto {
  requestStatus: string;
  recommendation: RecommendationDto;
}

export interface ApproveResponseDto {
  approval: ApprovalDto;
  idempotent: boolean;
}
