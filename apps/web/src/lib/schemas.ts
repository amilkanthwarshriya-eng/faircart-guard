import { z } from "zod";

const money = z.string().regex(/^\d+(\.\d{1,2})?$/, "Enter an amount like 20000.00");
const wholeNumber = z.string().regex(/^[1-9]\d*$/, "Enter a whole number above 0");
const currency = z.string().regex(/^[A-Za-z]{3}$/, "Use a 3-letter code such as INR");

export const createRequestSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: z.string(),
  quantity: wholeNumber,
  budget: money,
  currency,
  deadline: z.string().min(1, "Deadline is required"),
  specs: z.string(),
  qualityPreferences: z.string(),
});
export type CreateRequestForm = z.infer<typeof createRequestSchema>;

export const manualQuoteSchema = z.object({
  vendor: z.string().trim().min(1, "Vendor is required"),
  description: z.string().trim().min(1, "Item is required"),
  quantity: wholeNumber,
  unitPrice: money,
  lineTotal: money,
  currency,
  deliveryDays: z.string().regex(/^\d*$/, "Whole days only"),
});
export type ManualQuoteForm = z.infer<typeof manualQuoteSchema>;
