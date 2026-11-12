/** Pure orchestration of the deterministic pipeline: totals -> rules -> eligibility -> ranking. */
import { rankVendors, type RankingResult, type RankingWeights } from './ranking';
import { evaluateQuotes, type RulesOutcome } from './rules';
import type { QuoteRecord, RequestRecord } from './types';
import { Money } from '../../utils/money';

export interface DeterministicAnalysis {
  rules: RulesOutcome;
  ranking: RankingResult;
  winnerQuoteId: string | null;
  /** Budget minus the winner's total (projection only - nothing is committed until approval). */
  projectedRemainingBudget: string | null;
}

export function buildAnalysis(args: { request: RequestRecord; quotes: readonly QuoteRecord[]; now: Date; weights?: RankingWeights }): DeterministicAnalysis {
  const { request, quotes, now, weights } = args;
  const rules = evaluateQuotes(request, quotes, now);
  const ranking = rankVendors({ evaluations: rules.evaluations, deadlineDays: request.deadlineDays, weights });
  const winner = ranking.entries.find((e) => e.rank === 1);
  const projectedRemainingBudget = winner?.totalAmount
    ? Money.from(request.budget).sub(winner.totalAmount).roundToCurrency(request.currency).toCurrencyString(request.currency)
    : null;
  return { rules, ranking, winnerQuoteId: ranking.winnerQuoteId, projectedRemainingBudget };
}
