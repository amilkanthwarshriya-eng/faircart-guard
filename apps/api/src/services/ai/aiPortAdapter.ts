import type {
  AiAnalysisInput,
  AiAnalysisPort,
  AiAnalysisResult,
  AiRisk,
  AiRiskCategory,
  AiRiskSeverity,
} from '../procurement/integration/aiPort';
import type { AnalysisContext } from './analysis/types';
import { agentStepsFromEnv, type AgentSteps } from './agent/steps';

export class RealAiAnalysisPort implements AiAnalysisPort {
  private steps: AgentSteps | null = null;
  private env: Record<string, string | undefined>;

  constructor(env: Record<string, string | undefined> = process.env) {
    this.env = env;
  }

  private getSteps(): AgentSteps {
    if (!this.steps) {
      this.steps = agentStepsFromEnv(this.env);
    }
    return this.steps;
  }

  async analyze(input: AiAnalysisInput): Promise<AiAnalysisResult> {
    try {
      const steps = this.getSteps();
      const ctx: AnalysisContext = {
        budget: input.request.budget,
        currency: input.request.currency,
        deadlineDays: input.request.deadlineDays,
        requiredSpecs: input.request.requiredSpecs,
      };

      const risks: AiRisk[] = [];
      for (const q of input.quotes) {
        const sourceText = q.otherFeesDescription
          ? `Vendor: ${q.vendorName}\nOther fees: ${q.otherFeesDescription}\nLine items: ${q.lineItems.map((l) => `${l.description}: ${l.lineTotal ?? ''}`).join(', ')}`
          : `Vendor: ${q.vendorName}\nLine items: ${q.lineItems.map((l) => `${l.description}: ${l.lineTotal ?? ''}`).join(', ')}`;

        const res = await steps.analyze(ctx, {
          quoteId: q.quoteId,
          sourceText,
          calculatedTotal: q.evaluation.totals.calculatedTotal ?? null,
          extraction: {
            vendorName: q.vendorName,
            statedTotal: q.evaluation.totals.statedTotal ?? null,
            subtotal: q.evaluation.totals.subtotal ?? null,
            tax: q.evaluation.totals.tax ?? null,
            shipping: q.evaluation.totals.shipping ?? null,
            otherFees: q.evaluation.totals.otherFees ?? null,
            discount: q.evaluation.totals.discount ?? null,
            deliveryDays: q.evaluation.deliveryDays,
            validUntil: null,
            paymentTerms: null,
            evidence: {},
            lineItems: q.lineItems.map((l) => ({
              description: l.description,
              quantity: l.quantity ? Number(l.quantity) : null,
              unitPrice: l.unitPrice ? String(l.unitPrice) : null,
              lineTotal: l.lineTotal ? String(l.lineTotal) : null,
            })),
            missingFields: [],
            uncertainties: [],
            product: null,
            quantity: null,
            unitPrice: null,
            currency: q.evaluation.currency,
            deliveryDate: null,
          },
        });

        for (const r of res.risks) {
          risks.push({
            quoteId: q.quoteId,
            category: r.type as AiRiskCategory,
            severity: r.severity as AiRiskSeverity,
            title: r.title,
            description: r.detail,
            evidence: r.evidence,
          });
        }
      }

      const rankedQuotes = input.ranking.entries
        .filter((e) => e.eligible)
        .map((e) => {
          const matchingQuote = input.quotes.find((q) => q.quoteId === e.quoteId);
          return {
            quoteId: e.quoteId,
            vendorName: matchingQuote?.vendorName ?? 'Unknown',
            rank: e.rank ?? 1,
            total: e.totalAmount ?? '0.00',
            deliveryDays: matchingQuote?.evaluation.deliveryDays ?? null,
            scores: {
              cost: e.costScore ?? 0,
              delivery: e.deliveryScore ?? 0,
              specs: e.specificationScore ?? 0,
              completeness: e.completenessScore ?? 0,
              final: e.finalScore ?? 0,
            },
            risks: risks
              .filter((r) => r.quoteId === e.quoteId)
              .map((r) => ({ type: r.category, severity: r.severity, title: r.title })),
          };
        });

      const ineligibleQuotes = input.ranking.entries
        .filter((e) => !e.eligible)
        .map((e) => {
          const matchingQuote = input.quotes.find((q) => q.quoteId === e.quoteId);
          return {
            quoteId: e.quoteId,
            vendorName: matchingQuote?.vendorName ?? null,
            total: e.totalAmount ?? null,
            reasons: e.disqualification.map((d) => `${d.rule}: ${d.explanation}`),
          };
        });

      const explanation = await steps.explain({
        currency: input.request.currency,
        budget: input.request.budget,
        deadlineDays: input.request.deadlineDays,
        weights: input.ranking.weights,
        ranked: rankedQuotes,
        ineligible: ineligibleQuotes,
      });

      return {
        status: 'OK',
        source: `${steps.provider}:${steps.model}`,
        risks,
        explanation: {
          text: explanation.headline + (explanation.whyWinner ? '\n\n' + explanation.whyWinner : ''),
          json: explanation,
        },
      };
    } catch (err: unknown) {
      return {
        status: 'FAILED',
        source: this.steps ? `${this.steps.provider}:${this.steps.model}` : 'ai',
        risks: [],
        explanation: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
