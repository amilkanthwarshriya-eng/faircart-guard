import { z } from 'zod';

export const idParam = z.object({ id: z.string().trim().min(1).max(64) });

/** Money arrives as a decimal string (or a JSON number, converted via String - never arithmetic). Max 4 decimals. */
const MONEY_RE = /^\d{1,12}(\.\d{1,4})?$/;
export const moneyString = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === 'number' ? String(v) : v.trim()))
  .pipe(z.string().regex(MONEY_RE, 'Must be a non-negative decimal with at most 4 decimal places'));

export const currencyCode = z
  .string()
  .trim()
  .length(3, 'Must be a 3-letter ISO 4217 currency code')
  .regex(/^[A-Za-z]{3}$/)
  .transform((v) => v.toUpperCase());
