/**
 * INTEGRATION PORT for Member 2's AI analysis (TEMPORARY CONTRACT - owned by Member 3 only so the
 * backend compiles and is testable alone). Member 2 implements AiAnalysisPort inside
 * apps/api/src/services/ai and registers it with setAiAnalysisPort() at server start-up.
 *
 * The AI layer receives ONLY backend-calculated data and can only return RISKS and EXPLANATION TEXT.
 * It has no input or output path that can change eligibility, ranking, totals or approval.
 */
import type { QuoteEvaluation } from '../rules';
import type { RankingResult } from '../ranking';
import type { LineItemRecord, RequestRecord } from '../types';

export type AiRiskCategory = 'HIDDEN_CHARGE' | 'AMBIGUOUS_CHARGE' | 'INCONSISTENT_AMOUNT' | 'MISSING_INFO' | 'DELIVERY_RISK' | 'SPEC_CONCERN' | 'OTHER';
export type AiRiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface AiRisk {
  quoteId: string;
  category: AiRiskCategory;
  severity: AiRiskSeverity;
  title: string;
  description: string;
  /** Exact quotation text backing the risk, when available. */
  evidence: string | null;
}

export interface AiAnalysisQuoteInput {
  quoteId: string;
  vendorName: string;
  evaluation: QuoteEvaluation;
  lineItems: LineItemRecord[];
  otherFeesDescription: string | null;
}

export interface AiAnalysisInput {
  request: Pick<RequestRecord, 'id' | 'title' | 'quantity' | 'budget' | 'currency' | 'deadlineDays' | 'requiredSpecs'>;
  quotes: AiAnalysisQuoteInput[];
  ranking: RankingResult;
}

export interface AiAnalysisResult {
  status: 'OK' | 'UNAVAILABLE' | 'FAILED';
  /** NONE | DEMO_FIXTURE | gemini:<model> | anthropic:<model> | ... */
  source: string;
  risks: AiRisk[];
  explanation: { text: string; json?: unknown } | null;
  error?: string;
}

export interface AiAnalysisPort {
  analyze(input: AiAnalysisInput): Promise<AiAnalysisResult>;
}
