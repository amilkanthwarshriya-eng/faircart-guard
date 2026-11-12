/** Prisma row <-> pure record mappers. Decimal values become plain decimal strings (never floats). */
import { z } from 'zod';
import type { ApprovalRecord, LineItemRecord, QuoteRecord, RequestRecord, SpecConfirmation, Uncertainty } from './types';

const dec = (v: { toString(): string } | null | undefined): string | null => (v === null || v === undefined ? null : v.toString());

const specsSchema = z.array(z.object({ spec: z.string(), confirmed: z.boolean(), evidence: z.string().nullable().optional().transform((e) => e ?? null) }));
const uncertaintiesSchema = z.array(z.object({ field: z.string(), reason: z.string() }));
const stringArray = z.array(z.string());

// Malformed JSON never crashes or silently passes: it becomes "no confirmations" => rules say NEEDS_REVIEW.
const parseSpecs = (v: unknown): SpecConfirmation[] => { const p = specsSchema.safeParse(v); return p.success ? p.data : []; };
const parseUncertainties = (v: unknown): Uncertainty[] => { const p = uncertaintiesSchema.safeParse(v); return p.success ? p.data : []; };
export const parseStringArray = (v: unknown): string[] => { const p = stringArray.safeParse(v); return p.success ? p.data : []; };

// Structural row types (what the Prisma queries in this module include) - keeps this file free of generated-client imports.
export interface RequestRow {
  id: string; title: string; quantity: number; budget: { toString(): string }; currency: string;
  deadlineDays: number; requiredSpecs: unknown; status: string; createdAt: Date;
}
export interface QuoteRow {
  id: string; requestId: string; vendorId: string; status: string; currency: string;
  product: string | null; quantity: number | null; unitPrice: { toString(): string } | null;
  subtotal: { toString(): string } | null; tax: { toString(): string } | null; shipping: { toString(): string } | null;
  otherFees: { toString(): string } | null; otherFeesDescription: string | null; discount: { toString(): string } | null;
  statedTotal: { toString(): string } | null; deliveryDays: number | null; deliveryDate: Date | null; validUntil: Date | null;
  paymentTerms: string | null; specConfirmations: unknown; uncertainties: unknown; buyerReviewed: boolean; analyzedAt: Date | null;
  vendor: { name: string };
  lineItems: { description: string; quantity: { toString(): string } | null; unitPrice: { toString(): string } | null; lineTotal: { toString(): string } | null; position: number }[];
}
export interface ApprovalRow {
  id: string; requestId: string; quoteId: string; amount: { toString(): string }; currency: string; status: string;
  fingerprint: string; quoteContentHash: string; approvedBy: string | null; approvedAt: Date | null;
  invalidatedAt: Date | null; invalidationReason: string | null;
}

export function toRequestRecord(r: RequestRow): RequestRecord {
  return {
    id: r.id, title: r.title, quantity: r.quantity, budget: r.budget.toString(), currency: r.currency,
    deadlineDays: r.deadlineDays, requiredSpecs: parseStringArray(r.requiredSpecs), status: r.status as RequestRecord['status'], createdAt: r.createdAt,
  };
}

export function toQuoteRecord(q: QuoteRow): QuoteRecord {
  const lineItems: LineItemRecord[] = [...q.lineItems].sort((a, b) => a.position - b.position).map((li) => ({
    description: li.description, quantity: dec(li.quantity), unitPrice: dec(li.unitPrice), lineTotal: dec(li.lineTotal),
  }));
  return {
    id: q.id, requestId: q.requestId, vendorId: q.vendorId, vendorName: q.vendor.name, status: q.status as QuoteRecord['status'],
    currency: q.currency, product: q.product, quantity: q.quantity, unitPrice: dec(q.unitPrice), lineItems,
    subtotal: dec(q.subtotal), tax: dec(q.tax), shipping: dec(q.shipping), otherFees: dec(q.otherFees),
    otherFeesDescription: q.otherFeesDescription, discount: dec(q.discount), statedTotal: dec(q.statedTotal),
    deliveryDays: q.deliveryDays, deliveryDate: q.deliveryDate, validUntil: q.validUntil, paymentTerms: q.paymentTerms,
    specConfirmations: parseSpecs(q.specConfirmations), uncertainties: parseUncertainties(q.uncertainties),
    buyerReviewed: q.buyerReviewed, analyzedAt: q.analyzedAt,
  };
}

export function toApprovalRecord(a: ApprovalRow): ApprovalRecord {
  return {
    id: a.id, requestId: a.requestId, quoteId: a.quoteId, amount: a.amount.toString(), currency: a.currency,
    status: a.status as ApprovalRecord['status'], fingerprint: a.fingerprint, quoteContentHash: a.quoteContentHash,
    approvedBy: a.approvedBy, approvedAt: a.approvedAt, invalidatedAt: a.invalidatedAt, invalidationReason: a.invalidationReason,
  };
}
