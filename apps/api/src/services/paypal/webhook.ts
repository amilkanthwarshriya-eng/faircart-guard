import Decimal from "decimal.js";
import type { IncomingHttpHeaders } from "node:http";
import { getEnv } from "./env";
import { PayPalError } from "./errors";
import { paypalFetch } from "./http";
import type { PaymentRepository } from "./repository";

export type WebhookStatus = "RECEIVED" | "PROCESSED" | "IGNORED" | "FAILED";
export interface WebhookEventStore {
  /** true if this PayPal event id was seen for the first time (unique constraint in the database) */
  recordOnce(eventId: string, eventType: string): Promise<boolean>;
  setStatus(eventId: string, status: WebhookStatus): Promise<void>;
}
export class InMemoryWebhookEventStore implements WebhookEventStore {
  rows = new Map<string, { type: string; status: WebhookStatus }>();
  async recordOnce(id: string, type: string) {
    if (this.rows.has(id)) return false;
    this.rows.set(id, { type, status: "RECEIVED" });
    return true;
  }
  async setStatus(id: string, status: WebhookStatus) {
    const r = this.rows.get(id);
    if (r) r.status = status;
  }
}

/** Verify with PayPal. Needs the parsed event from the RAW body and PAYPAL_WEBHOOK_ID. */
export async function verifyPayPalWebhook(headers: IncomingHttpHeaders, event: unknown): Promise<boolean> {
  const env = getEnv();
  if (!env.PAYPAL_WEBHOOK_ID) throw new PayPalError("WEBHOOK_ID_MISSING");
  const h = (k: string) => String(headers[k] ?? "");
  const res = await paypalFetch<{ verification_status: string }>("/v1/notifications/verify-webhook-signature", {
    method: "POST",
    body: {
      auth_algo: h("paypal-auth-algo"), cert_url: h("paypal-cert-url"),
      transmission_id: h("paypal-transmission-id"), transmission_sig: h("paypal-transmission-sig"),
      transmission_time: h("paypal-transmission-time"),
      webhook_id: env.PAYPAL_WEBHOOK_ID, webhook_event: event,
    },
  });
  return res.verification_status === "SUCCESS";
}

interface PayPalWebhookEvent {
  id: string;
  event_type: string;
  resource?: {
    id?: string;
    custom_id?: string;
    amount?: { currency_code: string; value: string };
    // NOTE (verify with a real event): where PayPal puts the order id on capture events.
    supplementary_data?: { related_ids?: { order_id?: string } };
  };
}

export function createWebhookProcessor(deps: { repo: PaymentRepository; events: WebhookEventStore }) {
  const { repo, events } = deps;
  return {
    async process(event: PayPalWebhookEvent): Promise<"PROCESSED" | "IGNORED" | "DUPLICATE"> {
      if (!(await events.recordOnce(event.id, event.event_type))) return "DUPLICATE";
      try {
        const r = event.resource ?? {};
        const orderId = r.supplementary_data?.related_ids?.order_id;
        const payment = (r.custom_id ? await repo.get(r.custom_id) : null) ?? (orderId ? await repo.findByOrderId(orderId) : null);
        if (!payment) { await events.setStatus(event.id, "IGNORED"); return "IGNORED"; }

        switch (event.event_type) {
          case "PAYMENT.CAPTURE.COMPLETED": {
            const ok = !!r.amount && r.amount.currency_code === payment.currency && new Decimal(r.amount.value).equals(payment.amount);
            if (ok) {
              await repo.transition(payment.id, ["CAPTURING", "PENDING_REVIEW"], "COMPLETED",
                { paypalCaptureId: r.id, rawCaptureStatus: "COMPLETED", capturedAt: new Date() });
            } else {
              await repo.transition(payment.id, ["CAPTURING"], "PENDING_REVIEW", { failureReason: "WEBHOOK_AMOUNT_OR_CURRENCY_MISMATCH" });
            }
            break;
          }
          case "PAYMENT.CAPTURE.PENDING":
            await repo.transition(payment.id, ["CAPTURING"], "PENDING_REVIEW", { rawCaptureStatus: "PENDING" });
            break;
          case "PAYMENT.CAPTURE.DENIED":
            await repo.transition(payment.id, ["CAPTURING", "PENDING_REVIEW"], "FAILED", { failureReason: "DENIED", rawCaptureStatus: "DENIED" });
            break;
          case "PAYMENT.CAPTURE.REFUNDED":
            await repo.transition(payment.id, ["COMPLETED"], "REFUNDED");
            break;
          default:
            await events.setStatus(event.id, "IGNORED");
            return "IGNORED";
        }
        await events.setStatus(event.id, "PROCESSED");
        return "PROCESSED";
      } catch (e) {
        await events.setStatus(event.id, "FAILED");
        throw e;
      }
    },
  };
}
export type WebhookProcessor = ReturnType<typeof createWebhookProcessor>;
