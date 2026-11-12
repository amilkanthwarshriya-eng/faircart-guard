import { z } from 'zod';
import { currencyCode, moneyString } from './common';

const lineItem = z
  .object({
    description: z.string().trim().min(1).max(500),
    quantity: moneyString.nullish(),
    unitPrice: moneyString.nullish(),
    lineTotal: moneyString.nullish(),
  })
  .strict();

const specConfirmation = z
  .object({ spec: z.string().trim().min(1).max(200), confirmed: z.boolean(), evidence: z.string().trim().max(2000).nullish().transform((v) => v ?? null) })
  .strict();

const uncertainty = z.object({ field: z.string().trim().min(1).max(100), reason: z.string().trim().max(1000) }).strict();

/**
 * Buyer-editable quotation fields. Note: there is deliberately NO field for an authoritative total.
 * `statedTotal` is what the vendor wrote (untrusted); the backend always computes the real total.
 */
const quoteFields = {
  product: z.string().trim().max(300).nullish(),
  quantity: z.number().int().positive().max(10_000_000).nullish(),
  unitPrice: moneyString.nullish(),
  lineItems: z.array(lineItem).max(100).optional(),
  subtotal: moneyString.nullish(),
  tax: moneyString.nullish(),
  shipping: moneyString.nullish(),
  otherFees: moneyString.nullish(),
  otherFeesDescription: z.string().trim().max(1000).nullish(),
  discount: moneyString.nullish(),
  statedTotal: moneyString.nullish(),
  deliveryDays: z.number().int().min(0).max(3650).nullish(),
  deliveryDate: z.coerce.date().nullish(),
  validUntil: z.coerce.date().nullish(),
  paymentTerms: z.string().trim().max(500).nullish(),
  specConfirmations: z.array(specConfirmation).max(50).optional(),
  uncertainties: z.array(uncertainty).max(50).optional(),
  notes: z.string().trim().max(5000).nullish(),
};

/** Manual quotation entry (JSON). Buyer-typed data is treated as buyer-reviewed. */
export const createQuoteSchema = z
  .object({
    vendorName: z.string().trim().min(1).max(200),
    vendorEmail: z.string().trim().email().max(200).nullish(),
    currency: currencyCode.optional(),
    ...quoteFields,
  })
  .strict();

/** PDF upload (multipart): only vendor info; amounts are filled by extraction (Member 2) + buyer review. */
export const uploadQuoteSchema = z
  .object({
    vendorName: z.string().trim().min(1).max(200),
    vendorEmail: z.string().trim().email().max(200).optional(),
    currency: currencyCode.optional(),
    notes: z.string().trim().max(5000).optional(),
  })
  .strict();

export const patchQuoteSchema = z
  .object({
    ...quoteFields,
    /** true = buyer confirms the quotation data is reviewed; false = withdraw review. */
    markReviewed: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });

export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;
export type UploadQuoteInput = z.infer<typeof uploadQuoteSchema>;
export type PatchQuoteInput = z.infer<typeof patchQuoteSchema>;
