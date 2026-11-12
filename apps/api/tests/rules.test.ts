import { describe, it, expect } from 'vitest';
import {
  NO_ELIGIBLE_VENDOR_MESSAGE, evaluateQuote, evaluateQuotes, effectiveDeliveryDays, specCompliance, totalsFor,
  ruleBudget, ruleDeliveryDeadline, ruleMandatorySpecs, ruleRequiredInfo, ruleQuoteValidity, ruleDataConsistency, type RuleContext,
} from '../src/services/procurement/rules';
import { NOW, makeQuote, makeRequest, quoteA, quoteB, quoteC } from './fixtures';
import type { QuoteRecord } from '../src/services/procurement/types';

function ctx(over: Partial<QuoteRecord> = {}, reqOver = {}): RuleContext {
  const request = makeRequest(reqOver);
  const quote = makeQuote(over);
  return { request, quote, totals: totalsFor(quote), deliveryDays: effectiveDeliveryDays(quote, request.createdAt), now: NOW };
}

describe('BUDGET rule', () => {
  it('passes within budget', () => expect(ruleBudget(ctx()).status).toBe('PASS'));
  it('passes exactly at budget', () => expect(ruleBudget(ctx({ subtotal: '16000', tax: '2000', shipping: '2000', otherFees: '0', statedTotal: null })).status).toBe('PASS'));
  it('fails when over budget and reports by how much', () => {
    const r = ruleBudget(ctx({ subtotal: '20000', tax: '3600', shipping: '0', otherFees: '0', statedTotal: null }));
    expect(r.status).toBe('FAIL');
    expect(r.details.overBy).toBe('3600.00');
  });
  it('needs review when the total cannot be calculated', () => expect(ruleBudget(ctx({ subtotal: null })).status).toBe('NEEDS_REVIEW'));
  it('needs review on currency mismatch', () => expect(ruleBudget(ctx({ currency: 'USD' })).status).toBe('NEEDS_REVIEW'));
});

describe('DELIVERY_DEADLINE rule', () => {
  it('passes when on time', () => expect(ruleDeliveryDeadline(ctx({ deliveryDays: 5 })).status).toBe('PASS'));
  it('passes exactly on the deadline', () => expect(ruleDeliveryDeadline(ctx({ deliveryDays: 7 })).status).toBe('PASS'));
  it('fails when late (10 > 7 days)', () => {
    const r = ruleDeliveryDeadline(ctx({ deliveryDays: 10 }));
    expect(r.status).toBe('FAIL');
    expect(r.details.slackDays).toBe(-3);
  });
  it('needs review when delivery is unknown', () => expect(ruleDeliveryDeadline(ctx({ deliveryDays: null })).status).toBe('NEEDS_REVIEW'));
  it('derives days from a delivery date', () => {
    const q = makeQuote({ deliveryDays: null, deliveryDate: new Date('2026-11-19T00:00:00.000Z') });
    expect(effectiveDeliveryDays(q, NOW)).toBe(8);
    expect(ruleDeliveryDeadline({ ...ctx(), quote: q, deliveryDays: 8 }).status).toBe('FAIL');
  });
});

describe('MANDATORY_SPECS rule', () => {
  it('passes when every spec is confirmed with evidence (case/space-insensitive)', () => expect(ruleMandatorySpecs(ctx()).status).toBe('PASS'));
  it('fails when the quote explicitly does not meet a spec', () => {
    const r = ruleMandatorySpecs(ctx({ specConfirmations: [{ spec: 'Cotton fabric', confirmed: false, evidence: 'polyester blend' }, { spec: 'Custom printing', confirmed: true, evidence: 'yes' }] }));
    expect(r.status).toBe('FAIL');
    expect(r.details.contradicted).toEqual(['Cotton fabric']);
  });
  it('needs review when a spec is missing entirely', () => {
    const r = ruleMandatorySpecs(ctx({ specConfirmations: [{ spec: 'cotton fabric', confirmed: true, evidence: '100% cotton' }] }));
    expect(r.status).toBe('NEEDS_REVIEW');
    expect(r.details.unverified).toEqual(['Custom printing']);
  });
  it('needs review when confirmed without evidence', () => {
    expect(ruleMandatorySpecs(ctx({ specConfirmations: [{ spec: 'cotton fabric', confirmed: true, evidence: '  ' }, { spec: 'custom printing', confirmed: true, evidence: 'x' }] })).status).toBe('NEEDS_REVIEW');
  });
  it('scores spec compliance as a proportion', () => {
    expect(specCompliance(['a', 'b'], [{ spec: 'a', confirmed: true, evidence: 'e' }]).score).toBe(0.5);
    expect(specCompliance([], []).score).toBe(1);
  });
});

describe('REQUIRED_INFO rule', () => {
  it('passes when complete and reviewed', () => expect(ruleRequiredInfo(ctx()).status).toBe('PASS'));
  it('needs review when shipping is missing', () => {
    const r = ruleRequiredInfo(ctx({ shipping: null }));
    expect(r.status).toBe('NEEDS_REVIEW');
    expect(r.details.missing).toContain('shipping');
  });
  it('needs review when not yet reviewed by the buyer', () => expect(ruleRequiredInfo(ctx({ buyerReviewed: false })).status).toBe('NEEDS_REVIEW'));
  it('an unexplained fee is an advisory, not a blocker', () => {
    const r = ruleRequiredInfo(ctx({ otherFees: '1200', otherFeesDescription: null }));
    expect(r.status).toBe('PASS');
    expect((r.details.advisories as string[]).length).toBe(1);
    expect(r.details.completenessScore).toBeLessThan(1);
  });
});

describe('QUOTE_VALIDITY rule', () => {
  it('passes while valid', () => expect(ruleQuoteValidity(ctx()).status).toBe('PASS'));
  it('fails when expired', () => expect(ruleQuoteValidity(ctx({ validUntil: new Date('2026-11-01T00:00:00.000Z') })).status).toBe('FAIL'));
  it('needs review when no validity date is given', () => expect(ruleQuoteValidity(ctx({ validUntil: null })).status).toBe('NEEDS_REVIEW'));
});

describe('DATA_CONSISTENCY rule', () => {
  it('passes for consistent data', () => expect(ruleDataConsistency(ctx()).status).toBe('PASS'));
  it('needs review when the stated total contradicts the calculation', () => {
    const r = ruleDataConsistency(ctx({ statedTotal: '16000' }));
    expect(r.status).toBe('NEEDS_REVIEW');
    expect(r.details.difference).toBe('-1910.00');
  });
  it('needs review when the subtotal contradicts line items', () => {
    expect(ruleDataConsistency(ctx({ lineItems: [{ description: 'x', quantity: '1', unitPrice: '1', lineTotal: '100' }] })).status).toBe('NEEDS_REVIEW');
  });
  it('needs review when delivery days contradict the delivery date', () => {
    expect(ruleDataConsistency(ctx({ deliveryDays: 2, deliveryDate: new Date('2026-11-21T00:00:00.000Z') })).status).toBe('NEEDS_REVIEW');
  });
  it('needs review for unresolved uncertainties on an unreviewed quote only', () => {
    const u = [{ field: 'shipping', reason: 'unclear' }];
    expect(ruleDataConsistency(ctx({ uncertainties: u, buyerReviewed: false })).status).toBe('NEEDS_REVIEW');
    expect(ruleDataConsistency(ctx({ uncertainties: u, buyerReviewed: true })).status).toBe('PASS');
  });
  it('fails on currency mismatch', () => expect(ruleDataConsistency(ctx({ currency: 'USD' })).status).toBe('FAIL'));
});

describe('evaluateQuote / evaluateQuotes', () => {
  const request = makeRequest();

  it('Quote A and B are eligible; Quote C is ineligible for the 10-day delivery', () => {
    const out = evaluateQuotes(request, [quoteA(), quoteB(), quoteC()], NOW);
    const byId = Object.fromEntries(out.evaluations.map((e) => [e.quoteId, e]));
    expect(byId.quote_A?.eligibility).toBe('ELIGIBLE');
    expect(byId.quote_B?.eligibility).toBe('ELIGIBLE');
    expect(byId.quote_C?.eligibility).toBe('INELIGIBLE');
    expect(byId.quote_C?.reasons.join(' ')).toContain('10 day(s) misses the 7-day deadline');
    expect(out.eligibleQuoteIds).toEqual(['quote_A', 'quote_B']);
    expect(out.message).toBeNull();
    expect(byId.quote_A?.totals.calculatedTotal).toBe('17910.00');
    expect(byId.quote_B?.totals.calculatedTotal).toBe('18900.00');
  });

  it('an over-budget quote is INELIGIBLE', () => {
    expect(evaluateQuote(request, makeQuote({ subtotal: '30000', tax: '0', shipping: '0', otherFees: '0', statedTotal: null }), NOW).eligibility).toBe('INELIGIBLE');
  });

  it('an expired quote is INELIGIBLE with EXPIRED status', () => {
    const e = evaluateQuote(request, makeQuote({ validUntil: new Date('2026-01-01T00:00:00.000Z') }), NOW);
    expect(e.eligibility).toBe('INELIGIBLE');
    expect(e.suggestedQuoteStatus).toBe('EXPIRED');
  });

  it('missing information is never silently accepted (NEEDS_REVIEW, not ELIGIBLE)', () => {
    const e = evaluateQuote(request, makeQuote({ tax: null, deliveryDays: null }), NOW);
    expect(e.eligibility).toBe('NEEDS_REVIEW');
    expect(e.suggestedQuoteStatus).toBe('NEEDS_REVIEW');
  });

  it('a FAIL outranks NEEDS_REVIEW', () => {
    expect(evaluateQuote(request, makeQuote({ deliveryDays: 10, tax: null }), NOW).eligibility).toBe('INELIGIBLE');
  });

  it('returns the exact no-eligible-vendor message when nothing is eligible', () => {
    const out = evaluateQuotes(request, [quoteC()], NOW);
    expect(out.eligibleQuoteIds).toEqual([]);
    expect(out.message).toBe('No eligible vendor found. Review the purchasing requirements or request new quotations.');
    expect(out.message).toBe(NO_ELIGIBLE_VENDOR_MESSAGE);
    expect(evaluateQuotes(request, [], NOW).message).toBe(NO_ELIGIBLE_VENDOR_MESSAGE);
  });

  it('every evaluation carries all six rule results with status, explanation and details', () => {
    const e = evaluateQuote(request, quoteA(), NOW);
    expect(e.rules.map((r) => r.rule)).toEqual(['BUDGET', 'DELIVERY_DEADLINE', 'MANDATORY_SPECS', 'REQUIRED_INFO', 'QUOTE_VALIDITY', 'DATA_CONSISTENCY']);
    for (const r of e.rules) {
      expect(['PASS', 'FAIL', 'NEEDS_REVIEW']).toContain(r.status);
      expect(r.explanation.length).toBeGreaterThan(0);
      expect(typeof r.details).toBe('object');
    }
  });
});
