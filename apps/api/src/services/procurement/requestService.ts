import type { Prisma } from '@prisma/client';
import { getPrisma } from '../../db';
import { AppError, conflict, notFound } from '../../utils/errors';
import type { CreateRequestInput, PatchRequestInput } from '../../schemas/requests';
import { toRequestDto } from './dto';
import { prismaApprovalTx } from './prismaApprovalStore';
import { LOCKED_REQUEST_STATUSES, type RequestStatus } from './types';
import { daysBetween } from './rules';

const DAY_MS = 86_400_000;

export async function createRequest(input: CreateRequestInput, now: Date = new Date()) {
  const deadlineDays = input.deadlineDays ?? daysBetween(now, input.deadline as Date);
  if (deadlineDays < 1) throw new AppError(400, 'VALIDATION_ERROR', 'Deadline must be at least one day in the future', [{ path: 'deadline', message: 'Must be in the future' }]);
  const row = await getPrisma().purchaseRequest.create({
    data: {
      title: input.title, description: input.description ?? null, quantity: input.quantity,
      budget: input.budget, currency: input.currency, deadlineDays, deadline: new Date(now.getTime() + deadlineDays * DAY_MS),
      requiredSpecs: input.requiredSpecs, status: 'DRAFT', createdAt: now,
    },
  });
  return toRequestDto(row);
}

export async function listRequests(q: { status?: RequestStatus; limit: number; offset: number }) {
  const prisma = getPrisma();
  const where: Prisma.PurchaseRequestWhereInput = q.status ? { status: q.status } : {};
  const [rows, total] = await Promise.all([
    prisma.purchaseRequest.findMany({ where, orderBy: { createdAt: 'desc' }, take: q.limit, skip: q.offset }),
    prisma.purchaseRequest.count({ where }),
  ]);
  return { items: rows.map(toRequestDto), total };
}

const MATERIAL_REQUEST_KEYS = ['quantity', 'budget', 'currency', 'deadlineDays', 'deadline', 'requiredSpecs'] as const;

export async function patchRequest(id: string, input: PatchRequestInput, now: Date = new Date()) {
  return getPrisma().$transaction(async (tx) => {
    const atx = prismaApprovalTx(tx);
    const current = await atx.lockRequest(id);
    if (!current) throw notFound('Purchase request', id);
    if (LOCKED_REQUEST_STATUSES.includes(current.status)) throw conflict('REQUEST_LOCKED', `Request is ${current.status} and can no longer be edited.`);

    const data: Prisma.PurchaseRequestUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.quantity !== undefined) data.quantity = input.quantity;
    if (input.budget !== undefined) data.budget = input.budget;
    if (input.currency !== undefined) data.currency = input.currency;
    if (input.requiredSpecs !== undefined) data.requiredSpecs = input.requiredSpecs;

    if (input.deadlineDays !== undefined || input.deadline !== undefined) {
      const days = input.deadlineDays ?? daysBetween(current.createdAt, input.deadline as Date);
      if (days < 1) throw new AppError(400, 'VALIDATION_ERROR', 'Deadline must be at least one day after the request was created', [{ path: 'deadline', message: 'Too early' }]);
      data.deadlineDays = days;
      data.deadline = new Date(current.createdAt.getTime() + days * DAY_MS);
    }

    const material = MATERIAL_REQUEST_KEYS.some((k) => input[k] !== undefined);
    let nextStatus: RequestStatus | undefined;

    if (input.status === 'CANCELLED') {
      const active = await atx.findActiveApproval(id);
      if (active) await atx.invalidateApproval(active.id, 'Purchase request was cancelled.', now);
      nextStatus = 'CANCELLED';
    } else if (input.status !== undefined) {
      if (current.status === 'APPROVED') throw conflict('INVALID_STATUS_TRANSITION', 'An approved request can only be cancelled.');
      nextStatus = input.status;
    }

    if (material && nextStatus === undefined) {
      if (current.status === 'APPROVED') {
        const active = await atx.findActiveApproval(id);
        if (active) await atx.invalidateApproval(active.id, 'Purchase requirements changed after approval.', now);
      }
      if (['ANALYZED', 'AWAITING_APPROVAL', 'APPROVED'].includes(current.status)) nextStatus = 'COLLECTING_QUOTES';
    }
    if (material) {
      // Analysis results are stale: quotes need to be re-analysed (and re-approved if they were approved).
      await tx.quote.updateMany({ where: { requestId: id, status: { in: ['ELIGIBLE', 'INELIGIBLE', 'EXPIRED'] }, buyerReviewed: true }, data: { status: 'REVIEWED', analyzedAt: null } });
      await tx.quote.updateMany({ where: { requestId: id, status: { in: ['ELIGIBLE', 'INELIGIBLE', 'EXPIRED'] }, buyerReviewed: false }, data: { status: 'NEEDS_REVIEW', analyzedAt: null } });
    }
    if (nextStatus !== undefined) data.status = nextStatus;

    const row = await tx.purchaseRequest.update({ where: { id }, data });
    return toRequestDto(row);
  });
}
