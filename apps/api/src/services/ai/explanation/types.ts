import type { RiskType, Severity } from '../schemas/quoteRisk';

/** Ranking output from M3 (VendorRankingService). Everything here is trusted backend data. */
export interface RankedQuote {
  quoteId: string;
  vendorName: string | null;
  rank: number; // 1 = recommended
  total: string; // decimal string, e.g. "17910.00"
  deliveryDays: number | null;
  scores: { cost: number; delivery: number; specs: number; completeness: number; final: number }; // all 0..1
  risks: Array<{ type: RiskType; severity: Severity; title: string }>;
}

export interface IneligibleQuote {
  quoteId: string;
  vendorName: string | null;
  total: string | null;
  reasons: string[]; // from M3 rule results, e.g. "Delivery in 10 days is later than the 7-day deadline"
}

export interface RankingData {
  currency: string;
  budget: string;
  deadlineDays: number;
  weights: { cost: number; delivery: number; specs: number; completeness: number };
  ranked: RankedQuote[];
  ineligible: IneligibleQuote[];
}

export interface QuoteNote {
  quoteId: string;
  vendorName: string;
  text: string;
}

export interface Explanation {
  /** AI = model text that passed all checks. TEMPLATE = written by code from the data. */
  source: 'AI' | 'TEMPLATE';
  /** OK = model used. SKIPPED = nothing to explain. REJECTED = model text failed our checks. FAILED = model call failed. */
  aiStatus: 'OK' | 'SKIPPED' | 'REJECTED' | 'FAILED';
  aiError?: { code: string; message: string };
  headline: string;
  whyWinner: string;
  otherQuotes: QuoteNote[];
  ineligible: QuoteNote[];
  tradeOffs: string[];
  remainingRisks: string[];
  uncertainties: string[];
  warnings: string[];
}
