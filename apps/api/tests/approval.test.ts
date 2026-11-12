import { describe, it, expect } from 'vitest';
import { approveQuote, computeBinding, invalidateIfStale, quoteContentHash, verifyApprovalForPayment } from '../src/services/procurement/approval';
import { AppError } from '../src/utils/errors';
import { MemoryApprovalStore } from './memoryApprovalStore';
import { NOW, makeRequest, quoteA, quoteB, quoteC } from './fixtures';
import type { QuoteRecord } from '../src/services/procurement/types';

/** Quote as it looks after a successful analyze step. */
const analysed = (q: QuoteRecord, status: QuoteRecord['status'] = 'ELIGIBLE'): QuoteRecord => ({ ...q, status, analyzedAt: NOW });

function setup() {
  return new MemoryApprovalStore(makeRequest({ status: 'AWAITING_APPROVAL' }), [analysed(quoteA()), analysed(quoteB()), analysed(quoteC(), 'INELIGIBLE')]);
}
const approve = (s: MemoryApprovalStore, quoteId = 'quote_A', extra = {}) => approveQuote(s, { requestId: 'req_1', quoteId, ...extra }, NOW);
const codeOf = async (p: Promise<unknown>) => { try { await p; return 'NO_ERROR'; } catch (e) { return e instanceof AppError ? e.code : `OTHER:${String(e)}`; } };

describe('fingerprint binding', () => {
  it('is deterministic and identical for identical state', () => {
    expect(computeBinding('req_1', quoteA())?.fingerprint).toBe(computeBinding('req_1', quoteA())?.fingerprint);
    expect(computeBinding('req_1', quoteA())?.amount).toBe('17910.00');
  });
  it('changes with amount, quote identity, request and currency', () => {
    const base = computeBinding('req_1', quoteA())!.fingerprint;
    expect(computeBinding('req_1', { ...quoteA(), shipping: '900' })!.fingerprint).not.toBe(base);
    expect(computeBinding('req_1', { ...quoteA(), id: 'other' })!.fingerprint).not.toBe(base);
    expect(computeBinding('req_2', quoteA())!.fingerprint).not.toBe(base);
    expect(computeBinding('req_1', { ...quoteA(), currency: 'USD' })!.fingerprint).not.toBe(base);
  });
  it('ignores decimal formatting differences ("17910" vs "17910.0000")', () => {
    expect(quoteContentHash({ ...quoteA(), subtotal: '14500.0000' })).toBe(quoteContentHash(quoteA()));
  });
  it('is null when the total cannot be calculated', () => expect(computeBinding('req_1', { ...quoteA(), subtotal: null })).toBeNull());
});

describe('approveQuote', () => {
  it('approves an eligible, analysed, reviewed quote and stores amount/currency/timestamp/status', async () => {
    const s = setup();
    const { approval, idempotent } = await approve(s);
    expect(idempotent).toBe(false);
    expect(approval).toMatchObject({ requestId: 'req_1', quoteId: 'quote_A', amount: '17910.00', currency: 'INR', status: 'APPROVED', approvedAt: NOW });
    expect(approval.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(s.requests.get('req_1')?.status).toBe('APPROVED');
  });

  it('rejects an ineligible quote', async () => {
    expect(await codeOf(approve(setup(), 'quote_C'))).toBe('QUOTE_NOT_ELIGIBLE');
  });

  it('rejects a quote the buyer has not reviewed', async () => {
    const s = setup(); s.patchQuote('quote_A', { buyerReviewed: false });
    expect(await codeOf(approve(s))).toBe('QUOTE_NOT_REVIEWED');
  });

  it('rejects a quote that has not been analysed', async () => {
    const s = setup(); s.patchQuote('quote_A', { analyzedAt: null, status: 'REVIEWED' });
    expect(await codeOf(approve(s))).toBe('QUOTE_NOT_ANALYZED');
  });

  it('rejects unknown request / quote / quote of another request', async () => {
    const s = setup();
    expect(await codeOf(approveQuote(s, { requestId: 'nope', quoteId: 'quote_A' }, NOW))).toBe('NOT_FOUND');
    expect(await codeOf(approve(s, 'nope'))).toBe('NOT_FOUND');
    s.patchQuote('quote_A', { requestId: 'req_other' });
    expect(await codeOf(approve(s))).toBe('NOT_FOUND');
  });

  it('refuses a stale expectedTotal but never uses it as the amount', async () => {
    const s = setup();
    expect(await codeOf(approve(s, 'quote_A', { expectedTotal: '1.00' }))).toBe('AMOUNT_MISMATCH');
    const ok = await approve(s, 'quote_A', { expectedTotal: '17910' });
    expect(ok.approval.amount).toBe('17910.00');
  });

  it('is idempotent for duplicate approval requests (including concurrent ones)', async () => {
    const s = setup();
    const [r1, r2, r3] = await Promise.all([approve(s), approve(s), approve(s)]);
    expect(s.approvals.filter((a) => a.status === 'APPROVED')).toHaveLength(1);
    expect(r1.approval.id).toBe(r2.approval.id);
    expect(r2.approval.id).toBe(r3.approval.id);
    expect([r1, r2, r3].filter((r) => r.idempotent)).toHaveLength(2);
  });

  it('rejects approving a different quote while one is actively approved', async () => {
    const s = setup(); await approve(s);
    expect(await codeOf(approve(s, 'quote_B'))).toBe('ALREADY_APPROVED');
  });

  it('refuses changes once payment is in progress or paid', async () => {
    const s = setup(); s.requests.get('req_1')!.status = 'PAYMENT_IN_PROGRESS';
    expect(await codeOf(approve(s))).toBe('REQUEST_LOCKED');
  });
});

describe('invalidation and re-approval', () => {
  it('a changed AMOUNT invalidates the approval', async () => {
    const s = setup(); await approve(s);
    s.patchQuote('quote_A', { shipping: '900' }); // total 17910 -> 18010
    const changed = await s.transaction((tx) => invalidateIfStale(tx, 'req_1', undefined, NOW));
    expect(changed).toBe(true);
    expect(s.approvals[0]).toMatchObject({ status: 'INVALIDATED', invalidatedAt: NOW });
    expect(s.requests.get('req_1')?.status).toBe('COLLECTING_QUOTES');
  });

  it('a changed QUOTE (same total, different delivery) invalidates the approval', async () => {
    const s = setup(); await approve(s);
    s.patchQuote('quote_A', { deliveryDays: 6 });
    expect(computeBinding('req_1', s.quotes.get('quote_A')!)?.amount).toBe('17910.00');
    expect(await s.transaction((tx) => invalidateIfStale(tx, 'req_1', undefined, NOW))).toBe(true);
  });

  it('an unchanged quote keeps its approval', async () => {
    const s = setup(); await approve(s);
    expect(await s.transaction((tx) => invalidateIfStale(tx, 'req_1', undefined, NOW))).toBe(false);
    expect(s.approvals[0]?.status).toBe('APPROVED');
  });

  it('requires re-approval after invalidation and the old approval cannot be reused', async () => {
    const s = setup(); const first = await approve(s);
    s.patchQuote('quote_A', { shipping: '900' });
    await s.transaction((tx) => invalidateIfStale(tx, 'req_1', undefined, NOW));
    // Quote must be re-analysed before re-approval
    s.patchQuote('quote_A', { status: 'REVIEWED', analyzedAt: null });
    expect(await codeOf(approve(s))).toBe('QUOTE_NOT_ANALYZED');
    s.patchQuote('quote_A', { status: 'ELIGIBLE', analyzedAt: NOW });
    const second = await approve(s);
    expect(second.idempotent).toBe(false);
    expect(second.approval.id).not.toBe(first.approval.id);
    expect(second.approval.amount).toBe('18010.00');
    expect(s.approvals.filter((a) => a.status === 'APPROVED')).toHaveLength(1);
    expect(s.approvals.filter((a) => a.status === 'INVALIDATED')).toHaveLength(1);
  });

  it('approve() itself retires a stale approval of the same quote and re-approves the new state', async () => {
    const s = setup(); await approve(s);
    s.patchQuote('quote_A', { shipping: '900' });
    const r = await approve(s);
    expect(r.idempotent).toBe(false);
    expect(r.approval.amount).toBe('18010.00');
  });
});

describe('verifyApprovalForPayment (Member 4 integration point)', () => {
  it('returns the approved amount and currency while the approval is intact', async () => {
    const s = setup(); await approve(s);
    expect(await verifyApprovalForPayment(s, 'req_1', NOW)).toMatchObject({ quoteId: 'quote_A', amount: '17910.00', currency: 'INR' });
  });
  it('throws APPROVAL_REQUIRED if there was no approval', async () => {
    expect(await codeOf(verifyApprovalForPayment(setup(), 'req_1', NOW))).toBe('APPROVAL_REQUIRED');
  });
  it('throws and invalidates if the quote changed after approval', async () => {
    const s = setup(); await approve(s);
    s.patchQuote('quote_A', { tax: '0', statedTotal: null });
    expect(await codeOf(verifyApprovalForPayment(s, 'req_1', NOW))).toBe('APPROVAL_REQUIRED');
    expect(s.approvals[0]?.status).toBe('INVALIDATED');
  });
});
