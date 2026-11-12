import { z } from 'zod';
import { currencyCode, moneyString } from './common';

const specs = z.array(z.string().trim().min(1).max(200)).max(50);

export const createRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000).nullish(),
    quantity: z.number().int().positive().max(10_000_000),
    budget: moneyString,
    currency: currencyCode.default('INR'),
    /** Provide either deadlineDays or a future deadline date. */
    deadlineDays: z.number().int().min(1).max(365).optional(),
    deadline: z.coerce.date().optional(),
    requiredSpecs: specs.default([]),
  })
  .strict()
  .refine((v) => v.deadlineDays !== undefined || v.deadline !== undefined, { message: 'Provide deadlineDays or deadline', path: ['deadlineDays'] });

/** Client-settable statuses. Approval/payment statuses are owned by the system (approve / PayPal flow). */
export const CLIENT_SETTABLE_STATUSES = ['DRAFT', 'COLLECTING_QUOTES', 'CANCELLED'] as const;

export const patchRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000).nullable(),
    quantity: z.number().int().positive().max(10_000_000),
    budget: moneyString,
    currency: currencyCode,
    deadlineDays: z.number().int().min(1).max(365),
    deadline: z.coerce.date(),
    requiredSpecs: specs,
    status: z.enum(CLIENT_SETTABLE_STATUSES),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });

export const listRequestsQuery = z.object({
  status: z
    .enum(['DRAFT', 'COLLECTING_QUOTES', 'ANALYZED', 'AWAITING_APPROVAL', 'APPROVED', 'PAYMENT_IN_PROGRESS', 'PAID', 'PAYMENT_FAILED', 'CANCELLED'])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type CreateRequestInput = z.infer<typeof createRequestSchema>;
export type PatchRequestInput = z.infer<typeof patchRequestSchema>;
