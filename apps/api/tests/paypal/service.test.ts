import Decimal from "decimal.js";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTokenCache, createPaymentService, InMemoryPaymentRepository, PaymentConflictError, type PayableProvider } from "../../src/services/paypal";
import { B, captureBody, orderCreated, REQ, tokenOk } from "./mocks";

let captureCalls = 0;
const server = setupServer(http.post(`${B}/v1/oauth2/token`, () => HttpResponse.json(tokenOk)));
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

let valid = true;
const payables: PayableProvider = {
  async getApprovedPayable(requestId) {
    return { requestId, approvalId: "A1", quoteId: "Q1", amount: new Decimal("215.00"), currency: "USD", description: "T-shirts", valid };
  },
};
let repo: InMemoryPaymentRepository;
let svc: ReturnType<typeof createPaymentService>;
beforeEach(() => { captureCalls = 0; valid = true; clearTokenCache(); repo = new InMemoryPaymentRepository(); svc = createPaymentService({ repo, payables }); });

function mockPayPal(opts: { orderStatus?: string; capture?: () => Response | Promise<Response> } = {}) {
  server.use(
    http.post(`${B}/v2/checkout/orders`, () => HttpResponse.json(orderCreated())),
    http.get(`${B}/v2/checkout/orders/ORD1`, () => HttpResponse.json({ id: "ORD1", status: opts.orderStatus ?? "APPROVED", links: [] })),
    http.post(`${B}/v2/checkout/orders/ORD1/capture`, async () => {
      captureCalls++;
      return opts.capture ? opts.capture() : HttpResponse.json(captureBody());
    }),
  );
}

describe("create order", () => {
  it("creates an order from the approved amount and returns the approval URL", async () => {
    mockPayPal();
    const v = await svc.createOrder(REQ);
    expect(v.status).toBe("APPROVAL_PENDING");
    expect(v.amount).toBe("215.00");
    expect(v.approvalUrl).toContain("checkoutnow");
  });
  it("returns the existing payment instead of creating a second one", async () => {
    mockPayPal();
    const a = await svc.createOrder(REQ);
    const b = await svc.createOrder(REQ);
    expect(b.id).toBe(a.id);
  });
  it("refuses an invalid approval", async () => {
    valid = false;
    await expect(svc.createOrder(REQ)).rejects.toMatchObject({ code: "APPROVAL_INVALID" });
  });
});

describe("capture", () => {
  it("completes after verified capture", async () => {
    mockPayPal();
    const { id } = await svc.createOrder(REQ);
    const v = await svc.captureOrder(id);
    expect(v.status).toBe("COMPLETED");
    expect(v.paypalCaptureId).toBe("CAP1");
  });
  it("calls PayPal capture exactly once for 10 parallel requests", async () => {
    mockPayPal();
    const { id } = await svc.createOrder(REQ);
    const results = await Promise.all(Array.from({ length: 10 }, () => svc.captureOrder(id)));
    expect(captureCalls).toBe(1);
    expect((await svc.getPayment(id)).status).toBe("COMPLETED");
    expect(results.length).toBe(10);
  });
  it("a repeated capture after success does not call PayPal again", async () => {
    mockPayPal();
    const { id } = await svc.createOrder(REQ);
    await svc.captureOrder(id);
    await svc.captureOrder(id);
    expect(captureCalls).toBe(1);
  });
  it("amount mismatch goes to PENDING_REVIEW, never COMPLETED", async () => {
    mockPayPal({ capture: () => HttpResponse.json(captureBody({ amount: "100.00" })) });
    const { id } = await svc.createOrder(REQ);
    const v = await svc.captureOrder(id);
    expect(v.status).toBe("PENDING_REVIEW");
    expect(v.failureReason).toBe("AMOUNT_MISMATCH");
  });
  it("currency mismatch goes to PENDING_REVIEW", async () => {
    mockPayPal({ capture: () => HttpResponse.json(captureBody({ currency: "EUR" })) });
    const { id } = await svc.createOrder(REQ);
    expect((await svc.captureOrder(id)).failureReason).toBe("CURRENCY_MISMATCH");
  });
  it("refuses capture before the buyer approved at PayPal", async () => {
    mockPayPal({ orderStatus: "CREATED" });
    const { id } = await svc.createOrder(REQ);
    await expect(svc.captureOrder(id)).rejects.toBeInstanceOf(PaymentConflictError);
    expect((await svc.getPayment(id)).status).toBe("APPROVAL_PENDING");
    expect(captureCalls).toBe(0);
  });
  it("declined instrument becomes FAILED", async () => {
    mockPayPal({ capture: () => HttpResponse.json({ name: "UNPROCESSABLE_ENTITY", details: [{ issue: "INSTRUMENT_DECLINED" }] }, { status: 422 }) });
    const { id } = await svc.createOrder(REQ);
    const v = await svc.captureOrder(id);
    expect(v.status).toBe("FAILED");
    expect(v.failureReason).toBe("INSTRUMENT_DECLINED");
  });
  it("already captured at PayPal is reconciled to COMPLETED", async () => {
    let first = true;
    server.use(
      http.post(`${B}/v2/checkout/orders`, () => HttpResponse.json(orderCreated())),
      http.get(`${B}/v2/checkout/orders/ORD1`, () => HttpResponse.json(first ? { id: "ORD1", status: "APPROVED", links: [] } : captureBody())),
      http.post(`${B}/v2/checkout/orders/ORD1/capture`, () => { first = false; return HttpResponse.json({ name: "UNPROCESSABLE_ENTITY", details: [{ issue: "ORDER_ALREADY_CAPTURED" }] }, { status: 422 }); }),
    );
    const { id } = await svc.createOrder(REQ);
    expect((await svc.captureOrder(id)).status).toBe("COMPLETED");
  });
});

describe("cancel", () => {
  it("cancels, and then capture is refused without calling PayPal", async () => {
    mockPayPal();
    const { id } = await svc.createOrder(REQ);
    expect((await svc.cancelPayment(id)).status).toBe("CANCELLED");
    expect((await svc.captureOrder(id)).status).toBe("CANCELLED");
    expect(captureCalls).toBe(0);
  });
  it("cannot cancel a completed payment", async () => {
    mockPayPal();
    const { id } = await svc.createOrder(REQ);
    await svc.captureOrder(id);
    await expect(svc.cancelPayment(id)).rejects.toMatchObject({ code: "ALREADY_FINAL" });
  });
});
