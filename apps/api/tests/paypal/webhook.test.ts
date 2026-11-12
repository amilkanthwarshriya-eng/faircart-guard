import Decimal from "decimal.js";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTokenCache, createWebhookProcessor, InMemoryPaymentRepository, InMemoryWebhookEventStore, verifyPayPalWebhook } from "../../src/services/paypal";
import { B, REQ, tokenOk } from "./mocks";

let verification = "SUCCESS";
const server = setupServer(
  http.post(`${B}/v1/oauth2/token`, () => HttpResponse.json(tokenOk)),
  http.post(`${B}/v1/notifications/verify-webhook-signature`, () => HttpResponse.json({ verification_status: verification })),
);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(() => { verification = "SUCCESS"; clearTokenCache(); });

async function capturingPayment(repo: InMemoryPaymentRepository) {
  const p = await repo.create({ purchaseRequestId: REQ, quoteId: "Q1", approvalId: "A1", amount: new Decimal("215.00"), currency: "USD" });
  await repo.transition(p.id, ["ORDER_CREATED"], "APPROVAL_PENDING", { paypalOrderId: "ORD1" });
  await repo.transition(p.id, ["APPROVAL_PENDING"], "CAPTURING");
  return p;
}
const evt = (id: string, type: string, custom: string, value = "215.00", currency = "USD") =>
  ({ id, event_type: type, resource: { id: "CAP1", custom_id: custom, amount: { currency_code: currency, value } } });

describe("webhook signature", () => {
  it("accepts SUCCESS and rejects FAILURE", async () => {
    expect(await verifyPayPalWebhook({ "paypal-auth-algo": "x" }, { id: "E1" })).toBe(true);
    verification = "FAILURE";
    expect(await verifyPayPalWebhook({}, { id: "E1" })).toBe(false);
  });
});

describe("webhook processing", () => {
  it("completes a capturing payment and ignores a repeated event", async () => {
    const repo = new InMemoryPaymentRepository();
    const proc = createWebhookProcessor({ repo, events: new InMemoryWebhookEventStore() });
    const p = await capturingPayment(repo);
    expect(await proc.process(evt("E1", "PAYMENT.CAPTURE.COMPLETED", p.id))).toBe("PROCESSED");
    expect((await repo.get(p.id))!.status).toBe("COMPLETED");
    expect(await proc.process(evt("E1", "PAYMENT.CAPTURE.COMPLETED", p.id))).toBe("DUPLICATE");
  });
  it("a mismatched amount does not complete the payment", async () => {
    const repo = new InMemoryPaymentRepository();
    const proc = createWebhookProcessor({ repo, events: new InMemoryWebhookEventStore() });
    const p = await capturingPayment(repo);
    await proc.process(evt("E2", "PAYMENT.CAPTURE.COMPLETED", p.id, "1.00"));
    expect((await repo.get(p.id))!.status).toBe("PENDING_REVIEW");
  });
  it("never regresses a final state on an out-of-order pending event", async () => {
    const repo = new InMemoryPaymentRepository();
    const proc = createWebhookProcessor({ repo, events: new InMemoryWebhookEventStore() });
    const p = await capturingPayment(repo);
    await proc.process(evt("E3", "PAYMENT.CAPTURE.COMPLETED", p.id));
    await proc.process(evt("E4", "PAYMENT.CAPTURE.PENDING", p.id));
    expect((await repo.get(p.id))!.status).toBe("COMPLETED");
  });
  it("ignores unknown payments", async () => {
    const proc = createWebhookProcessor({ repo: new InMemoryPaymentRepository(), events: new InMemoryWebhookEventStore() });
    expect(await proc.process(evt("E5", "PAYMENT.CAPTURE.COMPLETED", "nope"))).toBe("IGNORED");
  });
  it("records a refund only from COMPLETED", async () => {
    const repo = new InMemoryPaymentRepository();
    const proc = createWebhookProcessor({ repo, events: new InMemoryWebhookEventStore() });
    const p = await capturingPayment(repo);
    await proc.process(evt("E6", "PAYMENT.CAPTURE.COMPLETED", p.id));
    await proc.process(evt("E7", "PAYMENT.CAPTURE.REFUNDED", p.id));
    expect((await repo.get(p.id))!.status).toBe("REFUNDED");
  });
});
