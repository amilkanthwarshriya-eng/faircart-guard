/** Prisma implementation of the ApprovalStore port (transactions + row locks). */
import type { Prisma } from '@prisma/client';
import { getPrisma } from '../../db';
import { AppError } from '../../utils/errors';
import type { ApprovalStore, ApprovalTx } from './approval';
import { toApprovalRecord, toQuoteRecord, toRequestRecord } from './mappers';

export function prismaApprovalTx(tx: Prisma.TransactionClient): ApprovalTx {
  return {
    async lockRequest(id) {
      await tx.$queryRaw`SELECT id FROM "PurchaseRequest" WHERE id = ${id} FOR UPDATE`;
      const row = await tx.purchaseRequest.findUnique({ where: { id } });
      return row ? toRequestRecord(row) : null;
    },
    async getQuote(id) {
      const row = await tx.quote.findUnique({ where: { id }, include: { vendor: true, lineItems: true } });
      return row ? toQuoteRecord(row) : null;
    },
    async findActiveApproval(requestId) {
      const row = await tx.approval.findFirst({ where: { requestId, status: 'APPROVED' } });
      return row ? toApprovalRecord(row) : null;
    },
    async createApproval(d) {
      try {
        const row = await tx.approval.create({ data: { ...d, status: 'APPROVED' } });
        return toApprovalRecord(row);
      } catch (e) {
        if ((e as { code?: string }).code === 'P2002') throw new AppError(409, 'DUPLICATE_ACTIVE_APPROVAL', 'Another active approval already exists');
        throw e;
      }
    },
    async invalidateApproval(approvalId, reason, at) {
      await tx.approval.update({ where: { id: approvalId }, data: { status: 'INVALIDATED', invalidatedAt: at, invalidationReason: reason } });
    },
    async setRequestStatus(requestId, status) {
      await tx.purchaseRequest.update({ where: { id: requestId }, data: { status } });
    },
  };
}

export const prismaApprovalStore: ApprovalStore = {
  transaction: (fn) => getPrisma().$transaction((tx) => fn(prismaApprovalTx(tx)), { timeout: 15_000 }),
};
