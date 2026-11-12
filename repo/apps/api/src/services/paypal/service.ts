import type Decimal from "decimal.js";
import { PayPalError, PaymentConflictError } from "./errors";
import { capturePayPalOrder, createPayPalOrder, getPayPalOrder } from "./orders";
import type { PaymentRepository } from "./repository";
import { isFinal } from "./state";
import type { Payment } from "./types";
import { verifyPayPalCapture, type CaptureOutcome } from "./verify";

/** What Member 3's approval module must provide. The amount ALWAYS comes from here, never from the browser. */
export interface Payable {
  requestId: string; approvalId: string; quoteId: string;
  amount: Decimal; currency: string; description: string;
  /** false when the approval was invalidated or the quote expired */
  valid: boolean;
}
export interface PayableProvider { getApprovedPayable(requestId: string): Promise<Payable | null> }

export function toView(p: Payment) {
  return {
    id: p.id, purchaseRequestId: p.purchaseRequestId, quoteId: p.quoteId, status: p.status,
    paypalOrderId: p.paypalOrderId ?? null, paypalCaptureId: p.paypalCaptureId ?? null,
    amount: p.amount.toFixed(2), currency: p.currency,
    rawCaptureStatus: p.rawCaptureStatus ?? null, failureReason: p.failureReason ?? null,
    approvalUrl: p.status === "APPROVAL_PENDING" ? p.approvalUrl ?? null : null,
    capturedAt: p.capturedAt ?? null, createdAt: p.createdAt, updatedAt: p.updatedAt,
  };
}
export type PaymentView = ReturnType<typeof toView>;

const STUCK_MS = 2 * 60_000;

export function createPaymentService(deps: { repo: PaymentRepository; payables: PayableProvider }) {
  const { repo, payables } = deps;

  async function mustGet(id: string) {
    const p = await repo.get(id);
    if (!p) throw new PaymentConflictError("NOT_FOUND", "Payment not found");
    return p;
  }

  async function applyOutcome(p: Payment, outcome: CaptureOutcome) {
    if (outcome.kind === "COMPLETED") {
      return repo.transition(p.id, ["CAPTURING", "PENDING_REVIEW"], "COMPLETED",
        { paypalCaptureId: outcome.captureId, rawCaptureStatus: "COMPLETED", capturedAt: new Date(), failureReason: undefined });
    }
    if (outcome.kind === "FAILED") {
      return repo.transition(p.id, ["CAPTURING", "PENDING_REVIEW"], "FAILED",
        { rawCaptureStatus: outcome.reason, failureReason: outcome.reason });
    }
    return repo.transition(p.id, ["CAPTURING"], "PENDING_REVIEW",
      { paypalCaptureId: outcome.captureId, failureReason: outcome.reason, rawCaptureStatus: outcome.reason });
  }

  const expected = (p: Payment) => ({ orderId: p.paypalOrderId!, requestId: p.purchaseRequestId, amount: p.amount, currency: p.currency });

  async function reconcile(p: Payment) {
    if (!p.paypalOrderId) return;
    const order = await getPayPalOrder(p.paypalOrderId);
    await applyOutcome(p, verifyPayPalCapture(order, expected(p)));
  }

  return {
    /** POST /api/payments/create-order */
    async createOrder(requestId: string) {
      const payable = await payables.getApprovedPayable(requestId);
      if (!payable) throw new PaymentConflictError("NO_APPROVAL", "No approved quotation for this request");
      if (!payable.valid) throw new PaymentConflictError("APPROVAL_INVALID", "Approval is invalid or the quotation expired; approve again");
      const existing = await repo.findActiveByApproval(payable.approvalId);
      if (existing) return toView(existing);
      const pay = await repo.create({
        purchaseRequestId: payable.requestId, quoteId: payable.quoteId, approvalId: payable.approvalId,
        amount: payable.amount, currency: payable.currency,
      });
      try {
        const o = await createPayPalOrder({
          paymentId: pay.id, requestId: payable.requestId, amount: payable.amount,
          currency: payable.currency, description: payable.description,
        });
        await repo.update(pay.id, { paypalOrderId: o.orderId, approvalUrl: o.approvalUrl });
        const next = await repo.transition(pay.id, ["ORDER_CREATED"], "APPROVAL_PENDING");
        return toView(next!);
      } catch (e) {
        await repo.transition(pay.id, ["ORDER_CREATED"], "FAILED", {
          failureReason: e instanceof PayPalError ? e.code : "CREATE_FAILED",
          paypalDebugId: e instanceof PayPalError ? e.debugId : undefined,
        });
        throw e;
      }
    },

    /** POST /api/payments/capture-order  (input: paymentId only) */
    async captureOrder(paymentId: string) {
      const p = await mustGet(paymentId);
      if (isFinal(p.status) || p.status === "CAPTURING" || p.status === "PENDING_REVIEW" || p.status === "COMPLETED") return toView(p);
      if (p.status !== "APPROVAL_PENDING" || !p.paypalOrderId) throw new PaymentConflictError("NOT_CAPTURABLE", `Payment is ${p.status}`);

      const order = await getPayPalOrder(p.paypalOrderId);
      if (order.status !== "APPROVED") throw new PaymentConflictError("NOT_APPROVED_BY_BUYER", "The buyer has not approved the order at PayPal");

      // Atomic claim: only one concurrent request can move APPROVAL_PENDING -> CAPTURING.
      const claimed = await repo.transition(paymentId, ["APPROVAL_PENDING"], "CAPTURING");
      if (!claimed) return toView(await mustGet(paymentId));

      try {
        const captured = await capturePayPalOrder(p.paypalOrderId, paymentId);
        await applyOutcome(claimed, verifyPayPalCapture(captured, expected(claimed)));
      } catch (e) {
        const code = e instanceof PayPalError ? e.code : "UNKNOWN";
        if (code === "INSTRUMENT_DECLINED") {
          await repo.transition(paymentId, ["CAPTURING"], "FAILED", { failureReason: code, rawCaptureStatus: code, paypalDebugId: (e as PayPalError).debugId });
        } else {
          try { await reconcile(claimed); } catch { /* still unknown */ }
          await repo.transition(paymentId, ["CAPTURING"], "PENDING_REVIEW", {
            failureReason: `RECONCILE_NEEDED_${code}`, paypalDebugId: e instanceof PayPalError ? e.debugId : undefined,
          });
        }
      }
      return toView(await mustGet(paymentId));
    },

    /** GET /api/payments/:id  (reconciles stuck or pending payments first) */
    async getPayment(paymentId: string) {
      let p = await mustGet(paymentId);
      const stuck = p.status === "CAPTURING" && Date.now() - p.updatedAt.getTime() > STUCK_MS;
      if (p.status === "PENDING_REVIEW" || stuck) {
        try {
          await reconcile(p);
        } catch { /* leave as is */ }
        p = await mustGet(paymentId);
      }
      return toView(p);
    },

    /** POST /api/payments/:id/cancel */
    async cancelPayment(paymentId: string) {
      const done = await repo.transition(paymentId, ["ORDER_CREATED", "APPROVAL_PENDING"], "CANCELLED");
      if (done) return toView(done);
      const p = await mustGet(paymentId);
      if (p.status === "CANCELLED") return toView(p);
      throw new PaymentConflictError("ALREADY_FINAL", `Payment is ${p.status}`);
    },
  };
}
export type PaymentService = ReturnType<typeof createPaymentService>;
