import Decimal from "decimal.js";
import { verifyApprovalForPayment, type ApprovalStore } from "../procurement/approval";
import { prismaApprovalStore } from "../procurement/prismaApprovalStore";
import type { Payable, PayableProvider } from "./service";
import { AppError } from "../../utils/errors";

export class ProcurementPayableProvider implements PayableProvider {
  constructor(private store: ApprovalStore = prismaApprovalStore) {}

  async getApprovedPayable(requestId: string): Promise<Payable | null> {
    try {
      const verified = await verifyApprovalForPayment(this.store, requestId);
      return {
        requestId: verified.requestId,
        approvalId: verified.approvalId,
        quoteId: verified.quoteId,
        amount: new Decimal(verified.amount),
        currency: verified.currency,
        description: `FairCart purchase: request ${verified.requestId}`,
        valid: true,
      };
    } catch (e) {
      if (e instanceof AppError && (e.code === "APPROVAL_REQUIRED" || e.code === "NOT_FOUND")) {
        return null;
      }
      throw e;
    }
  }
}

