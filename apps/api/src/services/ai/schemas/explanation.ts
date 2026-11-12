import { z } from 'zod';

/** What the model may return. It can only write text about a ranking, never change it. */
export const explanationResponseSchema = z
  .object({
    headline: z.string().min(1),
    whyWinner: z.string().min(1),
    otherQuotes: z.array(z.object({ quoteId: z.string(), text: z.string().min(1) }).strict()),
    tradeOffs: z.array(z.string()),
    remainingRisks: z.array(z.string()),
    uncertainties: z.array(z.string()),
  })
  .strict();

export type ExplanationResponse = z.infer<typeof explanationResponseSchema>;
