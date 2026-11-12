import { z } from 'zod';

export const riskTypes = [
  'HIDDEN_CHARGE',
  'AMBIGUOUS_CHARGE',
  'INCONSISTENT_AMOUNT',
  'MISSING_INFO',
  'DELIVERY_RISK',
  'SPEC_CONCERN',
  'OTHER',
] as const;
export const severities = ['LOW', 'MEDIUM', 'HIGH'] as const;

export type RiskType = (typeof riskTypes)[number];
export type Severity = (typeof severities)[number];

/** One risk shown to the buyer (M3 stores it as a QuoteRisk row, M1 displays it). */
export interface QuoteRisk {
  quoteId: string;
  source: 'RULE' | 'AI'; // RULE = plain code, AI = model suggestion that passed our checks
  type: RiskType;
  severity: Severity;
  title: string;
  detail: string;
  /** Exact text from the quotation. null only when the problem is that something is missing. */
  evidence: string | null;
}

/** What the model is allowed to return. It can only suggest risks, nothing else. */
export const aiRiskResponseSchema = z
  .object({
    risks: z.array(
      z
        .object({
          type: z.enum(riskTypes),
          severity: z.enum(severities),
          title: z.string().min(1),
          detail: z.string().min(1),
          evidence: z.string(),
        })
        .strict(),
    ),
  })
  .strict();
