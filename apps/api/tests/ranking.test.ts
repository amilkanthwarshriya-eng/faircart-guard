import { describe, it, expect } from 'vitest';
import { DEFAULT_WEIGHTS, rankVendors, validateWeights } from '../src/services/procurement/ranking';
import { evaluateQuote, evaluateQuotes, type QuoteEvaluation } from '../src/services/procurement/rules';
import { NOW, makeQuote, makeRequest, quoteA, quoteB, quoteC } from './fixtures';

const request = makeRequest();
const evalAll = (qs = [quoteA(), quoteB(), quoteC()]) => evaluateQuotes(request, qs, NOW).evaluations;
const entry = (res: ReturnType<typeof rankVendors>, id: string) => res.entries.find((e) => e.quoteId === id)!;

describe('rankVendors - scoring', () => {
  it('ranks A above B; C is excluded and never ranked', () => {
    const res = rankVendors({ evaluations: evalAll(), deadlineDays: 7 });
    expect(res.winnerQuoteId).toBe('quote_A');
    expect(entry(res, 'quote_A').rank).toBe(1);
    expect(entry(res, 'quote_B').rank).toBe(2);
    expect(entry(res, 'quote_C').rank).toBeNull();
    expect(entry(res, 'quote_C').eligible).toBe(false);
    expect(entry(res, 'quote_C').finalScore).toBeNull();
    expect(entry(res, 'quote_C').disqualification.some((d) => d.rule === 'DELIVERY_DEADLINE' && d.status === 'FAIL')).toBe(true);
  });

  it('computes cost/delivery scores per the blueprint (A: 1.00 / 0.286, B: 0.00 / 0.429)', () => {
    const res = rankVendors({ evaluations: evalAll(), deadlineDays: 7 });
    const a = entry(res, 'quote_A');
    const b = entry(res, 'quote_B');
    expect(a.costScore).toBe(1);
    expect(a.deliveryScore).toBeCloseTo(0.2857, 3);
    expect(b.costScore).toBe(0);
    expect(b.deliveryScore).toBeCloseTo(0.4286, 3);
  });

  it('computes the weighted final score (A with full completeness = 0.8214)', () => {
    const res = rankVendors({ evaluations: evalAll(), deadlineDays: 7 });
    expect(entry(res, 'quote_A').finalScore).toBeCloseTo(0.8214, 3);
    // B: unexplained 1200 fee lowers completeness to 7/8 -> 0.25*0.4286 + 0.2 + 0.1*0.875 = 0.3946
    expect(entry(res, 'quote_B').completenessScore).toBeCloseTo(0.875, 3);
    expect(entry(res, 'quote_B').finalScore).toBeCloseTo(0.3946, 3);
  });

  it('gives cost score 1.0 when all eligible totals are equal', () => {
    const q1 = quoteA();
    const q2 = makeQuote({ id: 'quote_A2', vendorId: 'vendor_A2', vendorName: 'A2', deliveryDays: 3 });
    const res = rankVendors({ evaluations: evalAll([q1, q2]), deadlineDays: 7 });
    expect(entry(res, 'quote_A').costScore).toBe(1);
    expect(entry(res, 'quote_A2').costScore).toBe(1);
    expect(res.winnerQuoteId).toBe('quote_A2'); // faster delivery breaks the tie
  });

  it('a single eligible quote gets cost score 1.0', () => {
    const res = rankVendors({ evaluations: evalAll([quoteA(), quoteC()]), deadlineDays: 7 });
    expect(entry(res, 'quote_A').costScore).toBe(1);
    expect(entry(res, 'quote_A').rank).toBe(1);
  });

  it('clamps delivery score to [0, 1]', () => {
    const fast = evaluateQuote(request, makeQuote({ deliveryDays: 0 }), NOW);
    expect(entry(rankVendors({ evaluations: [fast], deadlineDays: 7 }), 'quote_A').deliveryScore).toBe(1);
    const forced: QuoteEvaluation = { ...evaluateQuote(request, quoteA(), NOW), deliveryDays: 20 }; // would be negative
    expect(entry(rankVendors({ evaluations: [forced], deadlineDays: 7 }), 'quote_A').deliveryScore).toBe(0);
  });

  it('unknown delivery information scores 0 and is flagged', () => {
    const forced: QuoteEvaluation = { ...evaluateQuote(request, quoteA(), NOW), deliveryDays: null };
    const e = entry(rankVendors({ evaluations: [forced], deadlineDays: 7 }), 'quote_A');
    expect(e.deliveryScore).toBe(0);
    expect(e.flags).toContain('DELIVERY_UNKNOWN');
  });

  it('missing completeness information never receives a perfect score', () => {
    const forced: QuoteEvaluation = { ...evaluateQuote(request, quoteA(), NOW), completenessScore: Number.NaN };
    const e = entry(rankVendors({ evaluations: [forced], deadlineDays: 7 }), 'quote_A');
    expect(e.completenessScore).toBe(0);
    expect(e.flags).toContain('INCOMPLETE_INFORMATION');
    const partial = evaluateQuote(request, makeQuote({ otherFees: '500', otherFeesDescription: null, statedTotal: '18410' }), NOW);
    expect(entry(rankVendors({ evaluations: [partial], deadlineDays: 7 }), 'quote_A').completenessScore).toBeLessThan(1);
  });
});

describe('rankVendors - eligibility handling', () => {
  it('excludes ineligible and needs-review quotes from ranking', () => {
    const needsReview = makeQuote({ id: 'quote_N', vendorId: 'vendor_N', vendorName: 'N', tax: null });
    const res = rankVendors({ evaluations: evalAll([quoteA(), quoteC(), needsReview]), deadlineDays: 7 });
    expect(res.entries.filter((e) => e.rank !== null).map((e) => e.quoteId)).toEqual(['quote_A']);
    expect(entry(res, 'quote_N').eligibility).toBe('NEEDS_REVIEW');
    expect(entry(res, 'quote_N').rank).toBeNull();
    expect(entry(res, 'quote_C').eligibility).toBe('INELIGIBLE');
  });

  it('never ranks an "eligible" evaluation whose total cannot be calculated', () => {
    const bad: QuoteEvaluation = { ...evaluateQuote(request, quoteA(), NOW), totals: { ...evaluateQuote(request, quoteA(), NOW).totals, calculatedTotal: null } };
    const res = rankVendors({ evaluations: [bad], deadlineDays: 7 });
    expect(res.winnerQuoteId).toBeNull();
    expect(res.entries[0]?.eligible).toBe(false);
    expect(res.noEligibleMessage).toContain('No eligible vendor found');
  });

  it('returns the no-eligible message and no winner when nothing qualifies', () => {
    const res = rankVendors({ evaluations: evalAll([quoteC()]), deadlineDays: 7 });
    expect(res.winnerQuoteId).toBeNull();
    expect(res.noEligibleMessage).toBe('No eligible vendor found. Review the purchasing requirements or request new quotations.');
  });
});

describe('rankVendors - configurable weights', () => {
  it('defaults to 45/25/20/10', () => {
    expect(DEFAULT_WEIGHTS).toEqual({ cost: 0.45, delivery: 0.25, specs: 0.2, completeness: 0.1 });
  });

  it('custom weights can change the winner (delivery-heavy favours B)', () => {
    const res = rankVendors({ evaluations: evalAll(), deadlineDays: 7, weights: { cost: 0.1, delivery: 0.8, specs: 0.05, completeness: 0.05 } });
    expect(res.winnerQuoteId).toBe('quote_B');
    expect(res.weights.delivery).toBe(0.8);
  });

  it('rejects invalid weights', () => {
    expect(() => validateWeights({ cost: 0.5, delivery: 0.5, specs: 0.5, completeness: 0 })).toThrow('sum to 1');
    expect(() => validateWeights({ cost: -0.1, delivery: 0.6, specs: 0.3, completeness: 0.2 })).toThrow('non-negative');
    expect(() => rankVendors({ evaluations: evalAll(), deadlineDays: 7, weights: { cost: 1, delivery: 1, specs: 0, completeness: 0 } })).toThrow();
  });
});
