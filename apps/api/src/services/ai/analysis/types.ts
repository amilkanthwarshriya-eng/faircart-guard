import type { QuoteExtraction } from '../schemas/quoteExtraction';
import type { QuoteRisk } from '../schemas/quoteRisk';

export interface AnalysisContext {
  budget: string; // decimal string, e.g. "20000.00"
  currency: string; // e.g. "INR"
  deadlineDays: number;
  requiredSpecs: string[]; // e.g. ["cotton fabric", "custom printing"]
}

export interface AnalysisQuoteInput {
  quoteId: string;
  sourceText: string; // original quotation text (untrusted)
  extraction: QuoteExtraction; // verified / buyer-reviewed values
  /** Backend (M3) total from subtotal + tax + shipping + fees - discount. Authoritative. null if unavailable. */
  calculatedTotal: string | null;
}

export interface QuoteAnalysis {
  quoteId: string;
  risks: QuoteRisk[];
  /**
   * OK = AI part ran. FAILED = AI part did not run (rule-based risks are still included, never hidden from the UI).
   * DEMO = demo mode, only rule-based risks, no model was used.
   */
  aiStatus: 'OK' | 'FAILED' | 'DEMO';
  aiError?: { code: string; message: string };
  warnings: string[];
}
