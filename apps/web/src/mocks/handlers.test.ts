import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { handlers, resetMock } from "./handlers";
import { api } from "../lib/api-client";

const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => resetMock());
afterAll(() => server.close());

describe("mock API", () => {
  it("rejects approval when the amount differs from the quotation", async () => {
    await expect(api.approve("req-1", { quoteId: "q-a", approvedAmount: "1.00", currency: "INR" })).rejects.toMatchObject({ code: "AMOUNT_MISMATCH" });
  });
  it("blocks ineligible Quote C", async () => {
    await expect(api.approve("req-1", { quoteId: "q-c", approvedAmount: "16930.00", currency: "INR" })).rejects.toMatchObject({ code: "AMOUNT_MISMATCH" });
  });
  it("needs approval before an order, and is COMPLETED only after capture and polling", async () => {
    await expect(api.createOrder("req-1")).rejects.toMatchObject({ code: "APPROVAL_INVALID" });
    await api.approve("req-1", { quoteId: "q-a", approvedAmount: "17910.00", currency: "INR" });
    const o = await api.createOrder("req-1");
    expect((await api.getPayment(o.paymentId)).status).toBe("APPROVAL_PENDING");
    await api.captureOrder(o.paymentId);
    expect((await api.getPayment(o.paymentId)).status).toBe("CAPTURING");
    const done = await api.getPayment(o.paymentId);
    expect(done.status).toBe("COMPLETED");
    expect(done.paypalCaptureId).toMatch(/^MOCK-/);
    await expect(api.captureOrder(o.paymentId)).rejects.toMatchObject({ code: "ALREADY_FINAL" });
  });
});
