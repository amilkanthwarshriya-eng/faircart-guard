import type { ApproveResponseDto } from '../../contracts';
import type { ApproveBody } from '../../schemas/approval';
import { approveQuote } from './approval';
import { toApprovalDto } from './dto';
import { prismaApprovalStore } from './prismaApprovalStore';

export async function approveRequestQuote(requestId: string, body: ApproveBody): Promise<ApproveResponseDto & { created: boolean }> {
  const { approval, idempotent } = await approveQuote(prismaApprovalStore, { requestId, quoteId: body.quoteId, expectedTotal: body.expectedTotal, approvedBy: body.approvedBy });
  return { approval: toApprovalDto(approval), idempotent, created: !idempotent };
}
