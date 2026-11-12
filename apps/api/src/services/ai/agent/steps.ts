import { analyzeQuote } from '../analysis/analyzeQuotes';
import { detectRuleRisks } from '../analysis/ruleRisks';
import type { AnalysisContext, AnalysisQuoteInput, QuoteAnalysis } from '../analysis/types';
import { AiError } from '../errors';
import { explainRecommendation } from '../explanation/explainRecommendation';
import { prepare } from '../explanation/facts';
import { buildTemplateExplanation } from '../explanation/template';
import type { Explanation, RankingData } from '../explanation/types';
import { extractQuote } from '../extraction/extractQuote';
import { createLLMClientFromEnv } from '../factory';
import { sampleQuotes, type SampleQuote } from '../fixtures/sampleQuotes';
import type { QuoteExtraction } from '../schemas/quoteExtraction';
import type { LLMClient } from '../types';

/** The three AI-touching steps, behind one interface so live mode and demo mode share the same pipeline. */
export interface AgentSteps {
  mode: 'LIVE' | 'DEMO';
  provider: string;
  model: string;
  extract(sourceText: string, quoteId: string): Promise<{ extraction: QuoteExtraction; warnings: string[]; injectionSuspected: boolean }>;
  analyze(ctx: AnalysisContext, q: AnalysisQuoteInput): Promise<QuoteAnalysis>;
  explain(data: RankingData): Promise<Explanation>;
}

export function createLiveSteps(llm: LLMClient): AgentSteps {
  return {
    mode: 'LIVE',
    provider: llm.provider,
    model: llm.model,
    async extract(sourceText) {
      const r = await extractQuote(llm, sourceText);
      return { extraction: r.extraction, warnings: r.warnings, injectionSuspected: r.injectionSuspected };
    },
    analyze: (ctx, q) => analyzeQuote(llm, ctx, q),
    explain: (data) => explainRecommendation(llm, data),
  };
}

const nullExtraction: QuoteExtraction = {
  vendorName: null, product: null, quantity: null, unitPrice: null, lineItems: [], subtotal: null, tax: null,
  shipping: null, otherFees: null, discount: null, statedTotal: null, currency: null, deliveryDays: null,
  deliveryDate: null, validUntil: null, paymentTerms: null, evidence: {}, missingFields: [], uncertainties: [],
};

export function demoExtractionFor(s: SampleQuote): QuoteExtraction {
  const e = { ...nullExtraction, ...s.expected, evidence: { ...s.evidence }, missingFields: [], uncertainties: [] } as QuoteExtraction;
  if (s.id === 'B') e.uncertainties = [{ field: 'otherFees', reason: 'The charge is vaguely described' }];
  return e;
}

/** Demo mode: fixed sample data and code-only logic. No model is called. Every result is labelled DEMO. */
export function createDemoSteps(): AgentSteps {
  const find = (text: string, quoteId: string): SampleQuote | undefined => {
    const t = text.trim();
    return sampleQuotes.find((s) => s.text.trim() === t) ?? sampleQuotes.find((s) => s.id === quoteId);
  };
  return {
    mode: 'DEMO',
    provider: 'demo',
    model: 'fixtures',
    async extract(sourceText, quoteId) {
      const s = find(sourceText, quoteId);
      if (!s) throw new AiError('INVALID_INPUT', 'Demo mode only knows the built-in sample quotations');
      return { extraction: demoExtractionFor(s), warnings: [], injectionSuspected: s.id === 'D_INJECTION' };
    },
    async analyze(ctx, q) {
      return { quoteId: q.quoteId, risks: detectRuleRisks(ctx, q), aiStatus: 'DEMO', warnings: [] };
    },
    async explain(data) {
      return buildTemplateExplanation(prepare(data), { aiStatus: 'SKIPPED', warnings: [] });
    },
  };
}

type Env = Record<string, string | undefined>;

/** DEMO_MODE=true gives demo steps. Otherwise live steps; a bad or missing key throws. Live mode never falls back to demo. */
export function agentStepsFromEnv(env: Env = process.env): AgentSteps {
  if ((env.DEMO_MODE ?? '').toLowerCase() === 'true') return createDemoSteps();
  return createLiveSteps(createLLMClientFromEnv(env));
}
