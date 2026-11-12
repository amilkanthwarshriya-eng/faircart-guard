import Decimal from "decimal.js";
import type { Payment as PrismaPayment, Prisma, PrismaClient } from "@prisma/client";
import { ACTIVE_STATUSES, canTransition } from "./state";
import type { NewPayment, PaymentRepository } from "./repository";
import type { Payment, PaymentStatus } from "./types";
import type { WebhookEventStore, WebhookStatus } from "./webhook";

const toPayment = (r: PrismaPayment): Payment => ({
  id: r.id,
  purchaseRequestId: r.purchaseRequestId ?? r.requestId,
  quoteId: r.quoteId,
  approvalId: r.approvalId,
  amount: new Decimal(r.amount.toString()),
  currency: r.currency,
  status: r.status as PaymentStatus,
  paypalOrderId: r.paypalOrderId ?? undefined,
  approvalUrl: r.approvalUrl ?? undefined,
  paypalCaptureId: r.paypalCaptureId ?? undefined,
  rawCaptureStatus: r.rawCaptureStatus ?? r.paypalRawStatus ?? undefined,
  failureReason: r.failureReason ?? undefined,
  paypalDebugId: r.paypalDebugId ?? undefined,
  capturedAt: r.capturedAt ?? r.completedAt ?? r.verifiedAt ?? undefined,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

export class PrismaPaymentRepository implements PaymentRepository {
  constructor(private prisma: PrismaClient) {}

  async create(i: NewPayment): Promise<Payment> {
    const row = await this.prisma.payment.create({
      data: {
        requestId: i.purchaseRequestId,
        purchaseRequestId: i.purchaseRequestId,
        quoteId: i.quoteId,
        approvalId: i.approvalId,
        amount: i.amount.toFixed(4),
        currency: i.currency,
        status: "ORDER_CREATED",
      },
    });
    return toPayment(row);
  }

  async get(id: string): Promise<Payment | null> {
    const r = await this.prisma.payment.findUnique({ where: { id } });
    return r ? toPayment(r) : null;
  }

  async findByOrderId(orderId: string): Promise<Payment | null> {
    const r = await this.prisma.payment.findUnique({ where: { paypalOrderId: orderId } });
    return r ? toPayment(r) : null;
  }

  async findActiveByApproval(approvalId: string): Promise<Payment | null> {
    const r = await this.prisma.payment.findFirst({
      where: { approvalId, status: { in: ACTIVE_STATUSES } },
    });
    return r ? toPayment(r) : null;
  }

  async transition(id: string, from: PaymentStatus[], to: PaymentStatus, patch: Partial<Payment> = {}): Promise<Payment | null> {
    const legal = from.filter((f) => canTransition(f, to));
    if (legal.length === 0) return null;

    const data: Prisma.PaymentUpdateManyMutationInput = { status: to };
    if (patch.paypalOrderId !== undefined) data.paypalOrderId = patch.paypalOrderId;
    if (patch.paypalCaptureId !== undefined) data.paypalCaptureId = patch.paypalCaptureId;
    if (patch.approvalUrl !== undefined) data.approvalUrl = patch.approvalUrl;
    if (patch.rawCaptureStatus !== undefined) {
      data.rawCaptureStatus = patch.rawCaptureStatus;
      data.paypalRawStatus = patch.rawCaptureStatus;
    }
    if (patch.failureReason !== undefined) data.failureReason = patch.failureReason;
    if (patch.paypalDebugId !== undefined) data.paypalDebugId = patch.paypalDebugId;
    if (patch.capturedAt !== undefined) {
      data.capturedAt = patch.capturedAt;
      data.completedAt = patch.capturedAt;
      if (to === "COMPLETED") data.verifiedAt = patch.capturedAt;
    } else if (to === "COMPLETED") {
      const now = new Date();
      data.completedAt = now;
      data.verifiedAt = now;
      data.capturedAt = now;
      data.rawCaptureStatus = "COMPLETED";
      data.paypalRawStatus = "COMPLETED";
    }

    const res = await this.prisma.payment.updateMany({
      where: { id, status: { in: legal } },
      data,
    });
    return res.count === 1 ? this.get(id) : null;
  }

  async update(id: string, patch: Partial<Payment>): Promise<Payment> {
    const data: Prisma.PaymentUpdateInput = {};
    if (patch.paypalOrderId !== undefined) data.paypalOrderId = patch.paypalOrderId;
    if (patch.paypalCaptureId !== undefined) data.paypalCaptureId = patch.paypalCaptureId;
    if (patch.approvalUrl !== undefined) data.approvalUrl = patch.approvalUrl;
    if (patch.rawCaptureStatus !== undefined) {
      data.rawCaptureStatus = patch.rawCaptureStatus;
      data.paypalRawStatus = patch.rawCaptureStatus;
    }
    if (patch.failureReason !== undefined) data.failureReason = patch.failureReason;
    if (patch.paypalDebugId !== undefined) data.paypalDebugId = patch.paypalDebugId;
    if (patch.capturedAt !== undefined) {
      data.capturedAt = patch.capturedAt;
      data.completedAt = patch.capturedAt;
    }

    const updated = await this.prisma.payment.update({
      where: { id },
      data,
    });
    return toPayment(updated);
  }
}

export class PrismaWebhookEventStore implements WebhookEventStore {
  constructor(private prisma: PrismaClient) {}

  async recordOnce(eventId: string, eventType: string): Promise<boolean> {
    try {
      await this.prisma.webhookEvent.create({
        data: {
          paypalEventId: eventId,
          eventType,
          processingStatus: "RECEIVED",
          signatureVerified: true,
        },
      });
      return true;
    } catch (e: unknown) {
      if (isPrismaError(e, "P2002")) return false;
      throw e;
    }
  }

  async setStatus(eventId: string, status: WebhookStatus): Promise<void> {
    await this.prisma.webhookEvent.update({
      where: { paypalEventId: eventId },
      data: {
        processingStatus: status,
        processedAt: new Date(),
        processingError: status === "FAILED" ? "Processing failed" : undefined,
      },
    }).catch(() => {});
  }
}

function isPrismaError(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

