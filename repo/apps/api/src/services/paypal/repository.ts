import { randomUUID } from "node:crypto";
import type Decimal from "decimal.js";
import { ACTIVE_STATUSES, canTransition } from "./state";
import type { Payment, PaymentStatus } from "./types";

export interface NewPayment {
  purchaseRequestId: string; quoteId: string; approvalId: string; amount: Decimal; currency: string;
}

export interface PaymentRepository {
  create(input: NewPayment): Promise<Payment>;
  get(id: string): Promise<Payment | null>;
  findByOrderId(orderId: string): Promise<Payment | null>;
  findActiveByApproval(approvalId: string): Promise<Payment | null>;
  /** Atomic compare-and-set: returns the updated payment, or null if the current status is not in `from` or the move is illegal. */
  transition(id: string, from: PaymentStatus[], to: PaymentStatus, patch?: Partial<Payment>): Promise<Payment | null>;
  /** Update non-status fields. */
  update(id: string, patch: Partial<Payment>): Promise<Payment>;
}

export class InMemoryPaymentRepository implements PaymentRepository {
  private rows = new Map<string, Payment>();

  async create(input: NewPayment) {
    const now = new Date();
    const p: Payment = { id: randomUUID(), ...input, status: "ORDER_CREATED", createdAt: now, updatedAt: now };
    this.rows.set(p.id, p);
    return { ...p };
  }
  async get(id: string) { const p = this.rows.get(id); return p ? { ...p } : null; }
  async findByOrderId(orderId: string) {
    for (const p of this.rows.values()) if (p.paypalOrderId === orderId) return { ...p };
    return null;
  }
  async findActiveByApproval(approvalId: string) {
    for (const p of this.rows.values()) if (p.approvalId === approvalId && ACTIVE_STATUSES.includes(p.status)) return { ...p };
    return null;
  }
  async transition(id: string, from: PaymentStatus[], to: PaymentStatus, patch: Partial<Payment> = {}) {
    const p = this.rows.get(id); // no await between check and write => atomic in a single process
    if (!p || !from.includes(p.status) || !canTransition(p.status, to)) return null;
    Object.assign(p, patch, { status: to, updatedAt: new Date() });
    return { ...p };
  }
  async update(id: string, patch: Partial<Payment>) {
    const p = this.rows.get(id);
    if (!p) throw new Error("payment not found");
    Object.assign(p, patch, { updatedAt: new Date() });
    return { ...p };
  }
}
