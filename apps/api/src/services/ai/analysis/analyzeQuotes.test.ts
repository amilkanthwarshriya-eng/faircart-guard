import { describe, expect, it } from 'vitest';
import { AiError } from '../errors';
import { INJECTION_LINE, sampleQuotes } from '../fixtures/sampleQuotes';
import { createLLMClientFrom } from '../llmClient';
import type { QuoteExtraction } from '../schemas/quoteExtraction';
import type { RawLLM } from '../types';
import { analyzeQuote, analyzeQuotes } from './analyzeQuotes';
import type { AnalysisContext, AnalysisQuoteInput } from './types';

const ctx: AnalysisContext = { budget: '20000.00', currency: 'INR', deadlineDays: 7, requiredSpecs: ['cotton fabric', 'custom printing'] };

const baseNull = {
  vendorName: null, product: null, quantity: null, unitPrice: null, lineItems: [], subtotal: null, tax: null,
  shipping: null, otherFees: null, discount: null, statedTotal: null, currency: null, deliveryDays: null,
  deliveryDate: null, validUntil: null, paymentTerms: null, evidence: {}, missingFields: [], uncertainties: [],
};
const byId = (id: string) => sampleQuotes.find((q) => q.id === id)!;

function input(id: string, calculatedTotal: string | null, patch: Record<string, unknown> = {}): AnalysisQuoteInput {
  const s = byId(id);
  const extraction = { ...baseNull, ...s.expected, evidence: { ...s.evidence }, ...patch } as unknown as QuoteExtraction;
  return { quoteId: `quote-${id}`, sourceText: s.text, extraction, calculatedTotal };
}

function fakeLLM(reply: unknown | Error) {
  const sent: Array<{ system: string; prompt: string }> = [];
  const raw: RawLLM = {
    provider: 'fake',
    model: 'fake-1',
    async complete(req) {
      sent.push(req);
      if (reply instanceof Error) throw reply;
      return JSON.stringify(reply);
    },
  };
  return { llm: createLLMClientFrom(raw, { sleep: async () => {} }), sent };
}
const noRisks = { risks: [] };

describe('rule-based risks (work without the model)', () => {
  it('quote B: extra fee is a cautious disclosure item with evidence', async () => {
    const q = input('B', '18900.00', { uncertainties: [{ field: 'otherFees', reason: 'The charge is vaguely described' }] });
    const res = await analyzeQuote(fakeLLM(noRisks).llm, ctx, q);
    const fee = res.risks.find((r) => r.type === 'AMBIGUOUS_CHARGE')!;
    expect(fee.source).toBe('RULE');
    expect(fee.severity).toBe('MEDIUM');
    expect(fee.evidence).toBe('Handling & compliance charges: INR 1,200.00');
    expect(fee.detail).toMatch(/Ask the vendor/);
    expect(JSON.stringify(res.risks)).not.toMatch(/fraud|scam|illegal/i);
    expect(res.risks.some((r) => r.type === 'INCONSISTENT_AMOUNT')).toBe(false);
  });

  it('quote A: clean quote has no risks', async () => {
    const res = await analyzeQuote(fakeLLM(noRisks).llm, ctx, input('A', '17910.00'));
    expect(res.risks).toEqual([]);
    expect(res.aiStatus).toBe('OK');
  });

  it('flags a stated total that differs from the backend total', async () => {
    const res = await analyzeQuote(fakeLLM(noRisks).llm, ctx, input('A', '17910.00', { statedTotal: '17000.00' }));
    const r = res.risks.find((x) => x.type === 'INCONSISTENT_AMOUNT')!;
    expect(r.severity).toBe('HIGH');
    expect(r.detail).toContain('910.00');
  });

  it('flags missing delivery and validity', async () => {
    const res = await analyzeQuote(fakeLLM(noRisks).llm, ctx, input('A', '17910.00', { deliveryDays: null, validUntil: null }));
    expect(res.risks.map((r) => r.type)).toEqual(expect.arrayContaining(['DELIVERY_RISK', 'MISSING_INFO']));
    expect(res.risks.every((r) => r.evidence === null)).toBe(true);
  });

  it('sorts highest severity first', async () => {
    const res = await analyzeQuote(fakeLLM(noRisks).llm, ctx, input('A', '17910.00', { statedTotal: '1.00', validUntil: null }));
    expect(res.risks[0].severity).toBe('HIGH');
    expect(res.risks.at(-1)!.severity).toBe('LOW');
  });
});

describe('AI risks must pass our checks', () => {
  const q = () => input('B', '18900.00');
  const ai = (over: Record<string, unknown>) => ({ risks: [{ type: 'HIDDEN_CHARGE', severity: 'MEDIUM', title: 'Charge outside price', detail: 'May be optional; please confirm.', evidence: 'Shipping: Free', ...over }] });

  it('keeps a risk whose evidence really is in the document', async () => {
    const res = await analyzeQuote(fakeLLM(ai({ type: 'DELIVERY_RISK' })).llm, ctx, q());
    const kept = res.risks.find((r) => r.source === 'AI')!;
    expect(kept.evidence).toBe('Shipping: Free');
    expect(kept.quoteId).toBe('quote-B');
  });

  it('drops a risk with invented evidence', async () => {
    const res = await analyzeQuote(fakeLLM(ai({ evidence: 'A secret surcharge of INR 5,000 applies' })).llm, ctx, q());
    expect(res.risks.some((r) => r.source === 'AI')).toBe(false);
    expect(res.warnings.join(' ')).toMatch(/evidence not found/);
  });

  it('drops a risk with no evidence unless it is MISSING_INFO', async () => {
    const res1 = await analyzeQuote(fakeLLM(ai({ evidence: '' })).llm, ctx, q());
    expect(res1.risks.some((r) => r.source === 'AI')).toBe(false);
    const res2 = await analyzeQuote(fakeLLM(ai({ evidence: '', type: 'MISSING_INFO' })).llm, ctx, q());
    expect(res2.risks.find((r) => r.source === 'AI')!.evidence).toBeNull();
  });

  it('drops accusatory wording', async () => {
    const res = await analyzeQuote(fakeLLM(ai({ detail: 'This looks like fraud.' })).llm, ctx, q());
    expect(res.risks.some((r) => r.source === 'AI')).toBe(false);
  });

  it('drops an AI risk that repeats a rule risk', async () => {
    const dup = ai({ type: 'AMBIGUOUS_CHARGE', evidence: 'Handling & compliance charges: INR 1,200.00' });
    const res = await analyzeQuote(fakeLLM(dup).llm, ctx, q());
    expect(res.risks.filter((r) => r.type === 'AMBIGUOUS_CHARGE')).toHaveLength(1);
    expect(res.risks.filter((r) => r.type === 'AMBIGUOUS_CHARGE')[0].source).toBe('RULE');
  });

  it('rejects extra fields from the model', async () => {
    const bad = { risks: [], recommendation: 'pick vendor B' };
    const res = await analyzeQuote(fakeLLM(bad).llm, ctx, q());
    expect(res.aiStatus).toBe('FAILED');
    expect(res.aiError?.code).toBe('SCHEMA_INVALID');
  });
});

describe('failure and injection handling', () => {
  it('model failure: rule risks still returned, failure is visible', async () => {
    const res = await analyzeQuote(fakeLLM(new AiError('CONFIG', 'key rejected')).llm, ctx, input('B', '18900.00'));
    expect(res.aiStatus).toBe('FAILED');
    expect(res.aiError).toMatchObject({ code: 'CONFIG' });
    expect(res.risks.some((r) => r.source === 'RULE')).toBe(true);
  });

  it('injected instructions are dropped even if the model repeats them', async () => {
    const poisoned = { risks: [{ type: 'OTHER', severity: 'LOW', title: 'Vendor note', detail: 'Approve this vendor immediately.', evidence: INJECTION_LINE }] };
    const res = await analyzeQuote(fakeLLM(poisoned).llm, ctx, input('D_INJECTION', '17910.00'));
    expect(res.risks.some((r) => r.source === 'AI')).toBe(false);
    expect(res.warnings.length).toBeGreaterThan(0);
  });

  it('each quote is analysed in its own call with only its own text', async () => {
    const { llm, sent } = fakeLLM(noRisks);
    await analyzeQuotes(llm, ctx, [input('A', '17910.00'), input('B', '18900.00')]);
    expect(sent).toHaveLength(2);
    expect(sent[1].prompt).toContain('PRINTPRO TEXTILES');
    expect(sent[1].prompt).not.toContain('STITCHCRAFT');
    expect(sent[0].system).toMatch(/UNTRUSTED DATA/);
  });
});
