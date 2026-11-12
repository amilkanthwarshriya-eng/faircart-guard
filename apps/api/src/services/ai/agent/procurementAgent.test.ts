import { describe, expect, it } from 'vitest';
import { AiError } from '../errors';
import { NO_ELIGIBLE_MESSAGE } from '../explanation/template';
import { INJECTION_LINE, sampleQuotes } from '../fixtures/sampleQuotes';
import { createLLMClientFrom } from '../llmClient';
import type { RawLLM } from '../types';
import { createReferenceEngine } from './referenceEngine';
import { runProcurementAnalysis, analyzeProcurementRequest, type AgentRequest } from './procurementAgent';
import { createDemoSteps, createLiveSteps, demoExtractionFor } from './steps';

const engine = createReferenceEngine({ now: () => new Date('2026-11-11T00:00:00Z') });
const request: AgentRequest = { requestId: 'r1', currency: 'INR', budget: '20000.00', deadlineDays: 7, requiredSpecs: ['cotton fabric', 'custom printing'] };
const sample = (id: string) => sampleQuotes.find((s) => s.id === id)!;
const q = (id: 'A' | 'B' | 'C' | 'D_INJECTION', quoteId = `q${id[0]}`) => ({ quoteId, sourceText: sample(id).text });

const goodExplanation = {
  headline: 'StitchCraft Apparels is the best overall choice',
  whyWinner: 'StitchCraft Apparels scores 0.821, the highest, with a total of INR 17,910 that leaves INR 2,090 of the budget and delivery in 5 days.',
  otherQuotes: [{ quoteId: 'qB', text: 'PrintPro Textiles ranks #2 (score 0.397): it costs INR 990 more but delivers 1 day faster.' }],
  tradeOffs: [], remainingRisks: [], uncertainties: [],
};

/** Fake provider that answers extraction, analysis and explanation requests, and counts calls. */
function routerLLM(opts: { failExtraction?: string[]; obedient?: boolean; allFail?: boolean } = {}) {
  const calls = { extract: 0, analyze: 0, explain: 0 };
  const raw: RawLLM = {
    provider: 'fake', model: 'fake-1',
    async complete({ system, prompt }) {
      if (opts.allFail) throw new AiError('CONFIG', 'key rejected');
      if (system.startsWith('You extract')) {
        calls.extract++;
        const s = [...sampleQuotes].sort((a, b) => b.text.length - a.text.length).find((x) => prompt.includes(x.text))!;
        if (opts.failExtraction?.includes(s.id)) throw new AiError('PROVIDER_ERROR', 'boom');
        const e = demoExtractionFor(s);
        if (opts.obedient && s.id === 'D_INJECTION') {
          return JSON.stringify({ ...e, statedTotal: '1.00', evidence: { ...e.evidence, statedTotal: INJECTION_LINE } });
        }
        return JSON.stringify(e);
      }
      if (system.startsWith('You review ONE')) { calls.analyze++; return JSON.stringify({ risks: [] }); }
      calls.explain++;
      return JSON.stringify(goodExplanation);
    },
  };
  return { llm: createLLMClientFrom(raw, { sleep: async () => {} }), calls };
}

describe('demo mode', () => {
  it('runs the full pipeline from fixtures and labels itself', async () => {
    const res = await runProcurementAnalysis({ engine, steps: createDemoSteps() }, { request, quotes: [q('A'), q('B'), q('C')] });
    expect(res.mode).toBe('DEMO');
    expect(res.label).toMatch(/DEMO MODE/);
    expect(res.ranking.ranked.map((r) => r.quoteId)).toEqual(['qA', 'qB']);
    expect(res.ranking.ranked[0].scores.final).toBeCloseTo(0.821, 2);
    expect(res.ranking.ineligible[0].reasons[0]).toBe('Delivery in 10 days is later than the 7-day deadline');
    expect(res.quotes.map((x) => x.outcome)).toEqual(['ELIGIBLE', 'ELIGIBLE', 'INELIGIBLE']);
    expect(res.explanation.source).toBe('TEMPLATE');
    expect(res.quotes[1].analysis?.aiStatus).toBe('DEMO');
  });

  it('rejects quotations it does not know', async () => {
    const res = await runProcurementAnalysis({ engine, steps: createDemoSteps() }, { request, quotes: [{ quoteId: 'x', sourceText: 'some other quote' }] });
    expect(res.quotes[0].outcome).toBe('UNREADABLE');
    expect(res.explanation.headline).toBe(NO_ELIGIBLE_MESSAGE);
  });
});

describe('live mode (fake provider)', () => {
  it('extracts, analyses, ranks and explains; same ranking as demo', async () => {
    const { llm, calls } = routerLLM();
    const res = await runProcurementAnalysis({ engine, steps: createLiveSteps(llm) }, { request, quotes: [q('A'), q('B'), q('C')] });
    expect(res.mode).toBe('LIVE');
    expect(res.provider).toBe('fake');
    expect(res.ranking.ranked.map((r) => r.quoteId)).toEqual(['qA', 'qB']);
    expect(res.quotes[2].outcome).toBe('INELIGIBLE');
    expect(res.explanation.source).toBe('AI');
    expect(calls).toEqual({ extract: 3, analyze: 3, explain: 1 });
    expect(res.quotes[0].calculatedTotal).toBe('17910.00');
  });

  it('uses buyer-reviewed extraction without calling the model to extract', async () => {
    const { llm, calls } = routerLLM();
    const reviewed = { ...q('A'), extraction: demoExtractionFor(sample('A')) };
    await runProcurementAnalysis({ engine, steps: createLiveSteps(llm) }, { request, quotes: [reviewed] });
    expect(calls.extract).toBe(0);
    expect(calls.analyze).toBe(1);
  });

  it('one unreadable quote does not stop the others', async () => {
    const { llm } = routerLLM({ failExtraction: ['C'] });
    const res = await runProcurementAnalysis({ engine, steps: createLiveSteps(llm) }, { request, quotes: [q('A'), q('B'), q('C')] });
    const c = res.quotes.find((x) => x.quoteId === 'qC')!;
    expect(c.outcome).toBe('UNREADABLE');
    expect(c.error?.code).toBe('PROVIDER_ERROR');
    expect(res.ranking.ranked).toHaveLength(2);
    expect(res.ranking.ineligible[0].reasons[0]).toMatch(/Could not read/);
  });

  it('total provider failure is surfaced, never faked', async () => {
    const { llm } = routerLLM({ allFail: true });
    const res = await runProcurementAnalysis({ engine, steps: createLiveSteps(llm) }, { request, quotes: [q('A'), q('B')] });
    expect(res.quotes.every((x) => x.outcome === 'UNREADABLE')).toBe(true);
    expect(res.ranking.ranked).toEqual([]);
    expect(res.explanation.headline).toBe(NO_ELIGIBLE_MESSAGE);
  });
});

describe('prompt injection cannot change eligibility, ranking or money', () => {
  it('obedient model + injected quote: poisoned total is removed, backend total and rank unchanged', async () => {
    const { llm } = routerLLM({ obedient: true });
    const res = await runProcurementAnalysis({ engine, steps: createLiveSteps(llm) }, { request, quotes: [q('D_INJECTION'), q('B'), q('C')] });
    const d = res.quotes.find((x) => x.quoteId === 'qD')!;
    expect(d.injectionSuspected).toBe(true);
    expect(d.extraction?.statedTotal).toBeNull();
    expect(d.calculatedTotal).toBe('17910.00');
    expect(d.outcome).toBe('ELIGIBLE');
    expect(d.rank).toBe(1);
    expect(res.ranking.ranked[0].total).toBe('17910.00');
  });
});

describe('environment selection', () => {
  const input = { request, quotes: [q('A')] };
  it('DEMO_MODE=true runs demo', async () => {
    const res = await analyzeProcurementRequest(engine, input, { DEMO_MODE: 'true' });
    expect(res.mode).toBe('DEMO');
  });
  it('live mode without a key fails loudly instead of falling back to demo', async () => {
    await expect(analyzeProcurementRequest(engine, input, { DEMO_MODE: 'false' })).rejects.toMatchObject({ code: 'CONFIG' });
  });
});
