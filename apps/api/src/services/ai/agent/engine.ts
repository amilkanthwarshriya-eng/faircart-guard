import type { QuoteExtraction } from '../schemas/quoteExtraction';
import type { QuoteRisk } from '../schemas/quoteRisk';

/**
 * CONTRACT WITH MEMBER 3. M3's procurement engine (money library, rules, ranking) must satisfy this interface.
 * The AI agent only calls these functions. It never decides eligibility, ranking or money itself.
 */
export interface EngineRequest {
  currency: string;
  budget: string;
  deadlineDays: number;
  requiredSpecs: string[];
  weights: { cost: number; delivery: number; specs: number; completeness: number };
}

export interface EngineQuote {
  quoteId: string;
  sourceText: string;
  extraction: QuoteExtraction;
  calculatedTotal: string | null;
  risks: QuoteRisk[];
}

export interface RuleOutcome {
  status: 'PASS' | 'FAIL' | 'NEEDS_REVIEW';
  reasons: string[]; // plain sentences, e.g. "Delivery in 10 days is later than the 7-day deadline"
}

export interface ScoredQuote {
  quoteId: string;
  rank: number; // 1 = best
  scores: { cost: number; delivery: number; specs: number; completeness: number; final: number }; // all 0..1
}

export interface ProcurementEngine {
  /** Decimal-safe total from subtotal + tax + shipping + fees - discount. null if it cannot be calculated. */
  calculateTotal(extraction: QuoteExtraction): string | null;
  evaluateRules(request: EngineRequest, quote: EngineQuote): RuleOutcome;
  /** Receives ONLY quotes that passed the rules. Returns them ranked. */
  rank(request: EngineRequest, eligible: EngineQuote[]): ScoredQuote[];
}
