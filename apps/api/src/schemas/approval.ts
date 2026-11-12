import { z } from 'zod';
import { moneyString } from './common';

/**
 * Deliberately NO `amount` field: the approved amount is always the backend-calculated total.
 * `expectedTotal` is only a stale-screen guard; a mismatch rejects the call (409), it is never used as the amount.
 */
export const approveSchema = z
  .object({
    quoteId: z.string().trim().min(1).max(64),
    expectedTotal: moneyString.optional(),
    approvedBy: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export type ApproveBody = z.infer<typeof approveSchema>;
