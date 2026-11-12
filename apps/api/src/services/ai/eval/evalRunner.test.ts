import { describe, expect, it } from 'vitest';
import { demoExtractionFor } from '../agent/steps';
import { createReferenceEngine } from '../agent/referenceEngine';
import { INJECTION_LINE, sampleQuotes } from '../fixtures/sampleQuotes';
import { createLLMClientFrom } from '../llmClient';
import type { RawLLM } from '../types';
import { formatReport, runEval } from './evalRunner';

const engine = createReferenceEngine({ now: () => new Date('2026-11-11T00:00:00Z') });
const good = {
  headline: 'StitchCraft Apparels is the best overall choice',
  whyWinner: 'StitchCraft Apparels scores 0.821, the highest, with a total of INR 17,910 that leaves INR 2,090 of the budget and delivery in 5 days.',
  otherQuotes: [{ quoteId: 'qB', text: 'PrintPro Textiles ranks #2 (score 0.397): it costs INR 990 more but delivers 1 day faster.' }],
  tradeOffs: [], remainingRisks: [], uncertainties: [],
};

function fake(tweak: (id: string, e: Record<string, unknown>) => Record<string, unknown> = (_i, e) => e) {
  const raw: RawLLM = {
    provider: 'fake', model: 'fake-1',
    async complete({ system, prompt }) {
      if (system.startsWith('You extract')) {
        const s = [...sampleQuotes].sort((a, b) => b.text.length - a.text.length).find((x) => prompt.includes(x.text))!;
        return JSON.stringify(tweak(s.id, demoExtractionFor(s) as unknown as Record<string, unknown>));
      }
      if (system.startsWith('You review ONE')) return JSON.stringify({ risks: [] });
      return JSON.stringify(good);
    },
  };
  return createLLMClientFrom(raw, { sleep: async () => {} });
}

describe('eval runner', () => {
  it('a perfect model scores 100% and passes injection + pipeline checks', async () => {
    const r = await runEval(fake(), engine);
    expect(r.accuracy).toBe(1);
    expect(r.injection.passed).toBe(true);
    expect(r.pipeline.passed).toBe(true);
    expect(r.ok).toBe(true);
    expect(formatReport(r)).toMatch(/RESULT: PASS/);
  });

  it('reports wrong fields and fails the run', async () => {
    const r = await runEval(fake((id, e) => (id === 'A' ? { ...e, tax: '999.00', evidence: { ...(e.evidence as object), tax: 'GST: INR 999.00' } } : e)), engine);
    const a = r.quotes.find((q) => q.id === 'A')!;
    expect(a.fields.find((f) => f.field === 'tax')!.pass).toBe(false);
    expect(r.accuracy).toBeLessThan(1);
    expect(formatReport(r)).toMatch(/MISS tax/);
  });

  it('an obedient model is caught by the evidence check (injection test passes)', async () => {
    const r = await runEval(fake((id, e) => (id === 'D_INJECTION' ? { ...e, statedTotal: '1.00', evidence: { ...(e.evidence as object), statedTotal: INJECTION_LINE } } : e)), engine);
    expect(r.injection.passed).toBe(true);
    expect(r.injection.detail).toMatch(/null/);
  });

  it('reports a provider failure instead of crashing', async () => {
    const raw: RawLLM = { provider: 'fake', model: 'm', complete: async () => { throw new Error('boom'); } };
    const r = await runEval(createLLMClientFrom(raw, { sleep: async () => {}, maxRetries: 0 }), engine);
    expect(r.ok).toBe(false);
    expect(r.quotes[0].error).toMatch(/PROVIDER_ERROR/);
  });
});
