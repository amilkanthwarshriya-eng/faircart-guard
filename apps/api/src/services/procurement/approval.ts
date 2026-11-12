/**
 * ApprovalService - binds a buyer's approval to the EXACT quotation, amount and currency.
 *
 * - The approved amount is ALWAYS the backend-calculated quote total. The client can never
 *   supply an authoritative amount (an optional `expectedTotal` is only a stale-UI guard).
 * - fingerprint = sha256(canonical JSON { v, requestId, quoteId, vendorId, amount, currency, quoteContentHash })
 *   where quoteContentHash covers every field that affects price, delivery, validity or specs.
 *   If anything bound changes, the recomputed fingerprint differs => approval is INVALIDATED.
 * - Duplicate approve calls are idempotent (same quote + same fingerprint => the existing approval).
 * - Persistence goes through the ApprovalStore port (Prisma in production, in-memory in unit tests).
 */
import { AppError, conflict, notFound, unprocessable } from '../../utils/errors';
import { sha256Hex, stableStringify } from '../../utils/canonical';
import { Money, currencyDecimals } from '../../utils/money';
import { totalsFor } from './rules';
import type { ApprovalRecord, QuoteRecord, RequestRecord, RequestStatus } from './types';
import { LOCKED_REQUEST_STATUSES } from './types';

export const FINGERPRINT_VERSION = 1;

// ---------------------------------------------------------------------------
// Fingerprinting
// ---------------------------------------------------------------------------

const money4 = (v: string | null): string | null => {
  const m = Money.tryFrom(v);
  return m ? m.toFixed(4) : null;
};

/** Hash of everything about a quote that must not change after approval. Excludes status/analysis/notes/file metadata. */
export function quoteContentHash(q: QuoteRecord): string {
  return sha256Hex(stableStringify({
    vendorId: q.vendorId,
    currency: q.currency.toUpperCase(),
    product: q.product,
    quantity: q.quantity,
    unitPrice: money4(q.unitPrice),
    lineItems: q.lineItems.map((li) => ({
      description: li.description, quantity: li.quantity === null ? null : String(Money.from(li.quantity)), unitPrice: money4(li.unitPrice), lineTotal: money4(li.lineTotal),
    })),
    subtotal: money4(q.subtotal),
    tax: money4(q.tax),
    shipping: money4(q.shipping),
    otherFees: money4(q.otherFees),
    otherFeesDescription: q.otherFeesDescription,
    discount: money4(q.discount),
    statedTotal: money4(q.statedTotal),
    deliveryDays: q.deliveryDays,
    deliveryDate: q.deliveryDate,
    validUntil: q.validUntil,
    paymentTerms: q.paymentTerms,
    specs: [...q.specConfirmations].map((s) => ({ spec: s.spec.trim().toLowerCase(), confirmed: s.confirmed, evidence: s.evidence })).sort((a, b) => a.spec.localeCompare(b.spec)),
    buyerReviewed: q.buyerReviewed,
  }));
}

export interface ApprovalBinding {
  amount: string;
  currency: string;
  quoteContentHash: string;
  fingerprint: string;
}

/** Computes the binding for the quote's CURRENT state, or null if its total cannot be calculated. */
export function computeBinding(requestId: string, quote: QuoteRecord): ApprovalBinding | null {
  const total = totalsFor(quote).calculatedTotal;
  if (!total) return null;
  const currency = quote.currency.toUpperCase();
  const amount = total.toFixed(currencyDecimals(currency));
  const contentHash = quoteContentHash(quote);
  const fingerprint = sha256Hex(stableStringify({
    v: FINGERPRINT_VERSION, requestId, quoteId: quote.id, vendorId: quote.vendorId, amount, currency, quoteContentHash: contentHash,
  }));
  return { amount, currency, quoteContentHash: contentHash, fingerprint };
}

// ---------------------------------------------------------------------------
// Store port
// ---------------------------------------------------------------------------

export interface NewApproval {
  requestId: string;
  quoteId: string;
  amount: string;
  currency: string;
  fingerprint: string;
  quoteContentHash: string;
  approvedBy: string | null;
  approvedAt: Date;
}

export interface ApprovalTx {
  /** Load the request and lock it for the duration of the transaction (SELECT ... FOR UPDATE). */
  lockRequest(requestId: string): Promise<RequestRecord | null>;
  getQuote(quoteId: string): Promise<QuoteRecord | null>;
  findActiveApproval(requestId: string): Promise<ApprovalRecord | null>;
  /** Must throw AppError(409, 'DUPLICATE_ACTIVE_APPROVAL') if another active approval exists (unique violation). */
  createApproval(data: NewApproval): Promise<ApprovalRecord>;
  invalidateApproval(approvalId: string, reason: string, at: Date): Promise<void>;
  setRequestStatus(requestId: string, status: RequestStatus): Promise<void>;
}

export interface ApprovalStore {
  transaction<T>(fn: (tx: ApprovalTx) => Promise<T>): Promise<T>;
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

export interface ApproveInput {
  requestId: string;
  quoteId: string;
  /** Optional stale-UI guard: must equal the backend total or the call is rejected. NEVER used as the amount. */
  expectedTotal?: string | null;
  approvedBy?: string | null;
}

export interface ApproveResult {
  approval: ApprovalRecord;
  /** true when an identical, still-valid approval already existed. */
  idempotent: boolean;
}

export async function approveQuote(store: ApprovalStore, input: ApproveInput, now: Date = new Date()): Promise<ApproveResult> {
  try {
    return await store.transaction((tx) => approveInTx(tx, input, now));
  } catch (err) {
    // Lost a race against a concurrent approval: re-run once; it will now see the existing approval.
    if (err instanceof AppError && err.code === 'DUPLICATE_ACTIVE_APPROVAL') {
      return store.transaction((tx) => approveInTx(tx, input, now));
    }
    throw err;
  }
}

async function approveInTx(tx: ApprovalTx, input: ApproveInput, now: Date): Promise<ApproveResult> {
  const request = await tx.lockRequest(input.requestId);
  if (!request) throw notFound('Purchase request', input.requestId);
  if (LOCKED_REQUEST_STATUSES.includes(request.status)) {
    throw conflict('REQUEST_LOCKED', `Request is ${request.status}; approval can no longer be changed.`);
  }

  const quote = await tx.getQuote(input.quoteId);
  if (!quote || quote.requestId !== request.id) throw notFound('Quote for this request', input.quoteId);

  // Gate order: reviewed -> analysed -> eligible.
  if (!quote.buyerReviewed) {
    throw unprocessable('QUOTE_NOT_REVIEWED', 'The buyer must review this quotation before it can be approved.');
  }
  if (!quote.analyzedAt) {
    throw unprocessable('QUOTE_NOT_ANALYZED', 'This quotation has not been analysed since it was last changed. Run analysis first.');
  }
  if (quote.status !== 'ELIGIBLE') {
    throw unprocessable('QUOTE_NOT_ELIGIBLE', `Only an ELIGIBLE quotation can be approved (this one is ${quote.status}).`, { status: quote.status });
  }

  const binding = computeBinding(request.id, quote);
  if (!binding) throw unprocessable('QUOTE_TOTAL_UNAVAILABLE', 'The quotation total cannot be calculated.');
  if (binding.currency !== request.currency.toUpperCase()) {
    throw unprocessable('CURRENCY_MISMATCH', 'Quote currency does not match the request currency.');
  }
  if (Money.from(binding.amount).lte(0)) throw unprocessable('INVALID_AMOUNT', 'The approved amount must be greater than zero.');
  if (input.expectedTotal != null && !Money.from(input.expectedTotal).eq(binding.amount)) {
    throw conflict('AMOUNT_MISMATCH', 'The total you reviewed no longer matches the backend total. Reload and review again.', { backendTotal: binding.amount, currency: binding.currency });
  }

  const existing = await tx.findActiveApproval(request.id);
  if (existing) {
    if (existing.quoteId === quote.id && existing.fingerprint === binding.fingerprint) {
      return { approval: existing, idempotent: true };
    }
    if (existing.quoteId === quote.id) {
      // Same quote but its content/amount changed since approval: retire the stale approval, then re-approve below.
      await tx.invalidateApproval(existing.id, 'Quotation or amount changed after approval.', now);
    } else {
      throw conflict('ALREADY_APPROVED', 'This request already has an active approval for a different quotation.', { approvedQuoteId: existing.quoteId });
    }
  }

  const approval = await tx.createApproval({
    requestId: request.id, quoteId: quote.id, amount: binding.amount, currency: binding.currency,
    fingerprint: binding.fingerprint, quoteContentHash: binding.quoteContentHash,
    approvedBy: input.approvedBy ?? null, approvedAt: now,
  });
  await tx.setRequestStatus(request.id, 'APPROVED');
  return { approval, idempotent: false };
}

/**
 * Re-checks the request's active approval against the quote's CURRENT state and invalidates it if the
 * quote or amount changed. Returns true if an approval was invalidated.
 * Call this inside the same transaction as any quote/request mutation.
 */
export async function invalidateIfStale(tx: ApprovalTx, requestId: string, reason = 'Quotation or amount changed after approval.', now: Date = new Date()): Promise<boolean> {
  const active = await tx.findActiveApproval(requestId);
  if (!active) return false;
  const quote = await tx.getQuote(active.quoteId);
  const binding = quote ? computeBinding(requestId, quote) : null;
  if (binding && binding.fingerprint === active.fingerprint) return false;
  await tx.invalidateApproval(active.id, reason, now);
  await tx.setRequestStatus(requestId, 'COLLECTING_QUOTES'); // re-analysis + re-approval required
  return true;
}

export interface VerifiedApproval {
  approvalId: string;
  requestId: string;
  quoteId: string;
  amount: string;
  currency: string;
  fingerprint: string;
}

/**
 * Integration point for Member 4: returns the ONLY amount/currency PayPal may use, after re-verifying
 * that the approval still matches the quote's current state. Throws 409 otherwise.
 */
export async function verifyApprovalForPayment(store: ApprovalStore, requestId: string, now: Date = new Date()): Promise<VerifiedApproval> {
  return store.transaction(async (tx) => {
    const request = await tx.lockRequest(requestId);
    if (!request) throw notFound('Purchase request', requestId);
    const stale = await invalidateIfStale(tx, requestId, 'Quotation or amount changed after approval.', now);
    const active = stale ? null : await tx.findActiveApproval(requestId);
    if (!active) throw conflict('APPROVAL_REQUIRED', 'No valid approval exists for this request. Buyer approval (or re-approval) is required.');
    return { approvalId: active.id, requestId, quoteId: active.quoteId, amount: active.amount, currency: active.currency, fingerprint: active.fingerprint };
  });
}
