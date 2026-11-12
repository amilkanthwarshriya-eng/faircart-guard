import { looksLikeInjection } from '../extraction/verifyEvidence';
import type { QuoteAnalysis } from '../analysis/types';
import { AiError } from '../errors';
import type { Explanation, RankedQuote, RankingData } from '../explanation/types';
import type { QuoteExtraction } from '../schemas/quoteExtraction';
import type { EngineQuote, EngineRequest, ProcurementEngine, ScoredQuote } from './engine';
import { agentStepsFromEnv, type AgentSteps } from './steps';

export interface AgentRequest {
  requestId: string;
  currency: string;
  budget: string;
  deadlineDays: number;
  requiredSpecs: string[];
  weights?: EngineRequest['weights'];
}

export interface AgentQuoteInput {
  quoteId: string;
  sourceText: string;
  /** Buyer-reviewed values. If given, the model is not called to extract this quote again. */
  extraction?: QuoteExtraction;
}

export type QuoteOutcome = 'ELIGIBLE' | 'INELIGIBLE' | 'NEEDS_REVIEW' | 'UNREADABLE';

export interface QuoteReport {
  quoteId: string;
  outcome: QuoteOutcome;
  extraction: QuoteExtraction | null;
  extractionWarnings: string[];
  injectionSuspected: boolean;
  calculatedTotal: string | null;
  analysis: QuoteAnalysis | null;
  ruleReasons: string[];
  rank: number | null;
  scores: ScoredQuote['scores'] | null;
  error?: { code: string; message: string };
}

export interface AgentResult {
  requestId: string;
  mode: 'LIVE' | 'DEMO';
  provider: string;
  model: string;
  /** Show this to the user. */
  label: string;
  quotes: QuoteReport[];
  ranking: RankingData;
  explanation: Explanation;
}

export const DEFAULT_WEIGHTS = { cost: 45, delivery: 25, specs: 20, completeness: 10 };

/**
 * Chains: extract -> backend totals -> risk analysis -> rules (M3) -> rank (M3) -> explain.
 * Eligibility, ranking and money always come from the ProcurementEngine. The AI steps can only add text and risk flags.
 * This function has no access to approval or payment code.
 */
export async function runProcurementAnalysis(
  deps: { engine: ProcurementEngine; steps: AgentSteps },
  input: { request: AgentRequest; quotes: AgentQuoteInput[] },
): Promise<AgentResult> {
  const { engine, steps } = deps;
  const { request } = input;
  const req: EngineRequest = {
    currency: request.currency, budget: request.budget, deadlineDays: request.deadlineDays,
    requiredSpecs: request.requiredSpecs, weights: request.weights ?? DEFAULT_WEIGHTS,
  };
  const ctx = { budget: req.budget, currency: req.currency, deadlineDays: req.deadlineDays, requiredSpecs: req.requiredSpecs };

  const reports: QuoteReport[] = [];
  const engineQuotes = new Map<string, EngineQuote>();

  for (const q of input.quotes) {
    // 1. Extract (or reuse the buyer-reviewed values).
    let extraction: QuoteExtraction;
    let warnings: string[] = [];
    let injectionSuspected = looksLikeInjection(q.sourceText);
    try {
      if (q.extraction) extraction = q.extraction;
      else {
        const r = await steps.extract(q.sourceText, q.quoteId);
        extraction = r.extraction;
        warnings = r.warnings;
        injectionSuspected = injectionSuspected || r.injectionSuspected;
      }
    } catch (err) {
      if (!(err instanceof AiError)) throw err;
      reports.push({
        quoteId: q.quoteId, outcome: 'UNREADABLE', extraction: null, extractionWarnings: [], injectionSuspected,
        calculatedTotal: null, analysis: null, ruleReasons: [`Could not read this quotation (${err.code}): ${err.message}`],
        rank: null, scores: null, error: { code: err.code, message: err.message },
      });
      continue;
    }

    // 2. Backend total first, then risk analysis, then the rules.
    const calculatedTotal = engine.calculateTotal(extraction);
    const analysis = await steps.analyze(ctx, { quoteId: q.quoteId, sourceText: q.sourceText, extraction, calculatedTotal });
    const eq: EngineQuote = { quoteId: q.quoteId, sourceText: q.sourceText, extraction, calculatedTotal, risks: analysis.risks };
    engineQuotes.set(q.quoteId, eq);
    const rules = engine.evaluateRules(req, eq);

    reports.push({
      quoteId: q.quoteId,
      outcome: rules.status === 'PASS' ? 'ELIGIBLE' : rules.status === 'FAIL' ? 'INELIGIBLE' : 'NEEDS_REVIEW',
      extraction, extractionWarnings: warnings, injectionSuspected, calculatedTotal, analysis,
      ruleReasons: rules.reasons, rank: null, scores: null,
    });
  }

  // 3. Rank only the quotes that passed the rules.
  const eligible = reports.filter((r) => r.outcome === 'ELIGIBLE').map((r) => engineQuotes.get(r.quoteId)!);
  const scored = engine.rank(req, eligible);
  for (const s of scored) {
    const r = reports.find((x) => x.quoteId === s.quoteId)!;
    r.rank = s.rank;
    r.scores = s.scores;
  }

  // 4. Build the ranking data and explain it.
  const byId = new Map(reports.map((r) => [r.quoteId, r]));
  const ranked: RankedQuote[] = scored.map((s) => {
    const r = byId.get(s.quoteId)!;
    return {
      quoteId: s.quoteId, vendorName: r.extraction!.vendorName, rank: s.rank,
      total: r.calculatedTotal ?? r.extraction!.statedTotal ?? '0.00',
      deliveryDays: r.extraction!.deliveryDays, scores: s.scores,
      risks: (r.analysis?.risks ?? []).map((k) => ({ type: k.type, severity: k.severity, title: k.title })),
    };
  });
  const ranking: RankingData = {
    currency: req.currency, budget: req.budget, deadlineDays: req.deadlineDays, weights: req.weights, ranked,
    ineligible: reports
      .filter((r) => r.outcome !== 'ELIGIBLE')
      .map((r) => ({
        quoteId: r.quoteId, vendorName: r.extraction?.vendorName ?? null,
        total: r.calculatedTotal ?? r.extraction?.statedTotal ?? null,
        reasons: r.outcome === 'NEEDS_REVIEW' ? r.ruleReasons.map((x) => `Needs review: ${x}`) : r.ruleReasons,
      })),
  };
  const explanation = await steps.explain(ranking);

  return {
    requestId: request.requestId, mode: steps.mode, provider: steps.provider, model: steps.model,
    label:
      steps.mode === 'DEMO'
        ? 'DEMO MODE: sample data and fixed outputs. No AI model was used.'
        : `Analysed with ${steps.provider} (${steps.model}). Rules and ranking were calculated by the backend.`,
    quotes: reports, ranking, explanation,
  };
}

/** Entry point for M3's POST /api/requests/:id/analyze route. DEMO_MODE and LLM_PROVIDER come from the environment. */
export async function analyzeProcurementRequest(
  engine: ProcurementEngine,
  input: { request: AgentRequest; quotes: AgentQuoteInput[] },
  env: Record<string, string | undefined> = process.env,
): Promise<AgentResult> {
  return runProcurementAnalysis({ engine, steps: agentStepsFromEnv(env) }, input);
}
