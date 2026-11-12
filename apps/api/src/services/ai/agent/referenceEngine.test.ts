import { describe, expect, it } from 'vitest';
import { sampleQuotes } from '../fixtures/sampleQuotes';
import { demoExtractionFor } from './steps';
import { createReferenceEngine } from './referenceEngine';
import type { EngineQuote, EngineRequest } from './engine';

const req: EngineRequest = {
  currency: 'INR', budget: '20000.00', deadlineDays: 7, requiredSpecs: ['cotton fabric', 'custom printing'],
  weights: { cost: 45, delivery: 25, specs: 20, completeness: 10 },
};
const engine = createReferenceEngine({ now: () => new Date('2026-11-11T00:00:00Z') });

function quote(id: 'A' | 'B' | 'C', patch: Partial<EngineQuote['extraction']> = {}): EngineQuote {
  const s = sampleQuotes.find((x) => x.id === id)!;
  const extraction = { ...demoExtractionFor(s), ...patch };
  const risks = id === 'B' ? [{ quoteId: id, source: 'RULE' as const, type: 'AMBIGUOUS_CHARGE' as const, severity: 'MEDIUM' as const, title: 't', detail: 'd', evidence: null }] : [];
  return { quoteId: id, sourceText: s.text, extraction, calculatedTotal: engine.calculateTotal(extraction), risks };
}

describe('reference engine (stand-in for M3)', () => {
  it('calculates totals', () => {
    expect(quote('A').calculatedTotal).toBe('17910.00');
    expect(quote('B').calculatedTotal).toBe('18900.00');
    expect(quote('C').calculatedTotal).toBe('16930.00');
  });

  it('rules: A and B pass, C fails on the delivery deadline', () => {
    expect(engine.evaluateRules(req, quote('A')).status).toBe('PASS');
    expect(engine.evaluateRules(req, quote('B')).status).toBe('PASS');
    const c = engine.evaluateRules(req, quote('C'));
    expect(c.status).toBe('FAIL');
    expect(c.reasons[0]).toBe('Delivery in 10 days is later than the 7-day deadline');
  });

  it('rules: over budget, expired, unknown delivery', () => {
    expect(engine.evaluateRules({ ...req, budget: '17000.00' }, quote('A')).status).toBe('FAIL');
    expect(engine.evaluateRules(req, quote('A', { validUntil: '2026-10-01' })).reasons.join()).toMatch(/expired/);
    expect(engine.evaluateRules(req, quote('A', { deliveryDays: null })).status).toBe('NEEDS_REVIEW');
  });

  it('ranking matches the worked example in the project doc (A 0.821, B 0.397)', () => {
    const ranked = engine.rank(req, [quote('B'), quote('A')]);
    expect(ranked.map((r) => r.quoteId)).toEqual(['A', 'B']);
    expect(ranked[0].scores.final).toBeCloseTo(0.821, 2);
    expect(ranked[1].scores.final).toBeCloseTo(0.397, 2);
    expect(ranked[0].scores.delivery).toBeCloseTo(0.286, 2);
    expect(ranked[1].scores.delivery).toBeCloseTo(0.429, 2);
    expect(ranked[1].scores.completeness).toBeCloseTo(0.9, 5);
  });

  it('single eligible quote gets cost score 1 and rank 1', () => {
    const r = engine.rank(req, [quote('A')]);
    expect(r[0]).toMatchObject({ rank: 1 });
    expect(r[0].scores.cost).toBe(1);
  });
});
