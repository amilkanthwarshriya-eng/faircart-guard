/** Prisma rows -> API DTOs (see src/contracts). Money is always a decimal string. */
import type { Prisma } from '@prisma/client';
import type { ApprovalDto, PaymentSummaryDto, QuoteDto, RecommendationDto, RequestDto, RiskDto } from '../../contracts';
import { formatMoney } from '../../utils/money';
import { parseStringArray, toQuoteRecord } from './mappers';
import { totalsFor, type QuoteEvaluation } from './rules';
import type { RankedEntry, RankingWeights } from './ranking';
import type { ApprovalRecord } from './types';

export const quoteInclude = { vendor: true, lineItems: { orderBy: { position: 'asc' } } } as const satisfies Prisma.QuoteInclude;
export type QuoteFull = Prisma.QuoteGetPayload<{ include: typeof quoteInclude }>;
export type RecommendationFull = Prisma.RecommendationGetPayload<{ include: { risks: true } }>;

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export function toRequestDto(r: Prisma.PurchaseRequestGetPayload<object>): RequestDto {
  return {
    id: r.id, title: r.title, description: r.description, quantity: r.quantity,
    budget: formatMoney(r.budget.toString(), r.currency) as string, currency: r.currency,
    deadlineDays: r.deadlineDays, deadline: r.deadline.toISOString(), requiredSpecs: parseStringArray(r.requiredSpecs),
    status: r.status, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}

export function toQuoteDto(q: QuoteFull): QuoteDto {
  const rec = toQuoteRecord(q);
  const totals = totalsFor(rec);
  const cur = q.currency;
  const f = (v: { toString(): string } | null) => (v === null ? null : formatMoney(v.toString(), cur));
  return {
    id: q.id, requestId: q.requestId, vendor: { id: q.vendorId, name: q.vendor.name, email: q.vendor.email },
    source: q.source, status: q.status, currency: cur, product: q.product, quantity: q.quantity, unitPrice: f(q.unitPrice),
    lineItems: rec.lineItems,
    subtotal: f(q.subtotal), tax: f(q.tax), shipping: f(q.shipping), otherFees: f(q.otherFees), otherFeesDescription: q.otherFeesDescription,
    discount: f(q.discount), statedTotal: f(q.statedTotal),
    calculatedTotal: totals.calculatedTotal ? totals.calculatedTotal.toCurrencyString(cur) : null,
    totalsCheck: {
      consistent: totals.consistent,
      difference: totals.difference ? totals.difference.toCurrencyString(cur) : null,
      missing: [...totals.missing],
    },
    deliveryDays: q.deliveryDays, deliveryDate: iso(q.deliveryDate), validUntil: iso(q.validUntil), paymentTerms: q.paymentTerms,
    specConfirmations: rec.specConfirmations, uncertainties: rec.uncertainties,
    buyerReviewed: q.buyerReviewed, reviewedAt: iso(q.reviewedAt), reviewedFields: parseStringArray(q.reviewedFields), analyzedAt: iso(q.analyzedAt),
    file: q.sourceFileName ? { name: q.sourceFileName, size: q.sourceFileSize, sha256: q.sourceFileSha256 } : null,
    notes: q.notes, createdAt: q.createdAt.toISOString(), updatedAt: q.updatedAt.toISOString(),
  };
}

export function toApprovalDto(a: ApprovalRecord): ApprovalDto {
  return {
    id: a.id, requestId: a.requestId, quoteId: a.quoteId, amount: formatMoney(a.amount, a.currency) as string, currency: a.currency,
    status: a.status, fingerprint: a.fingerprint, approvedBy: a.approvedBy, approvedAt: iso(a.approvedAt),
    invalidatedAt: iso(a.invalidatedAt), invalidationReason: a.invalidationReason,
  };
}

export function toPaymentDto(p: Prisma.PaymentGetPayload<object>): PaymentSummaryDto {
  return {
    id: p.id, status: p.status, amount: formatMoney(p.amount.toString(), p.currency) as string, currency: p.currency,
    paypalOrderId: p.paypalOrderId, paypalCaptureId: p.paypalCaptureId,
    verified: p.status === 'COMPLETED' && p.verifiedAt !== null, verifiedAt: iso(p.verifiedAt), completedAt: iso(p.completedAt),
  };
}

export function toRecommendationDto(r: RecommendationFull): RecommendationDto {
  const ranking = r.ranking as unknown as RankedEntry[];
  const risks: RiskDto[] = r.risks.map((k) => ({
    id: k.id, quoteId: k.quoteId, category: k.category, severity: k.severity, title: k.title, description: k.description,
    evidence: k.evidence, source: k.source,
  }));
  return {
    id: r.id, requestId: r.requestId, createdAt: r.createdAt.toISOString(),
    winnerQuoteId: r.winnerQuoteId, winner: ranking.find((e) => e.quoteId === r.winnerQuoteId) ?? null,
    noEligibleMessage: r.noEligibleMessage, weights: r.weights as unknown as RankingWeights, ranking,
    rules: r.ruleResults as unknown as QuoteEvaluation[], risks,
    explanation: r.explanationText ? { text: r.explanationText, json: r.explanationJson ?? null } : null,
    ai: { status: r.aiStatus, source: r.aiSource, error: r.aiError, isDemoFixture: r.aiSource === 'DEMO_FIXTURE' },
  };
}
