import { z } from 'zod';

/** Money is a plain decimal string ("14500.00"), never a float. null = not stated in the document. */
const money = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'money must be a plain decimal string like "2610.00" (no commas, no currency symbol)')
  .nullable();

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
  .nullable();

export const lineItemSchema = z
  .object({
    description: z.string().min(1),
    quantity: z.number().int().positive().nullable(),
    unitPrice: money,
    lineTotal: money,
  })
  .strict();

export const quoteExtractionSchema = z
  .object({
    vendorName: z.string().nullable(),
    product: z.string().nullable(),
    quantity: z.number().int().positive().nullable(),
    unitPrice: money,
    lineItems: z.array(lineItemSchema),
    subtotal: money,
    tax: money,
    shipping: money,
    otherFees: money,
    discount: money,
    statedTotal: money,
    currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
    deliveryDays: z.number().int().nonnegative().nullable(),
    deliveryDate: isoDate,
    validUntil: isoDate,
    paymentTerms: z.string().nullable(),
    evidence: z.record(z.string(), z.string()),
    missingFields: z.array(z.string()),
    uncertainties: z.array(z.object({ field: z.string(), reason: z.string() }).strict()),
  })
  .strict(); // any extra key (e.g. "approved": true) is rejected

export type QuoteExtraction = z.infer<typeof quoteExtractionSchema>;
