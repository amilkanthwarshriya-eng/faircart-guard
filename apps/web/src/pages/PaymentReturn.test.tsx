// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { setupServer } from "msw/node";
import { handlers, resetMock } from "../mocks/handlers";
import { api } from "../lib/api-client";
import { renderRoute } from "../test/render";
import PaymentReturn from "./PaymentReturn";

const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => { cleanup(); resetMock(); vi.restoreAllMocks(); });
afterAll(() => server.close());

describe("Payment return page", () => {
  it("never shows success from a URL alone", () => {
    renderRoute("/payments/return", "/payments/return?status=success&token=ABC", <PaymentReturn />);
    expect(screen.queryByText("Payment verified")).toBeNull();
    expect(screen.getByText(/Missing payment reference/)).toBeTruthy();
  });
  it("captures once (even in StrictMode) and shows success only after the backend reports COMPLETED", async () => {
    await api.approve("req-1", { quoteId: "q-a", approvedAmount: "17910.00", currency: "INR" });
    const order = await api.createOrder("req-1");
    const spy = vi.spyOn(api, "captureOrder");
    renderRoute("/payments/return", `/payments/return?paymentId=${order.paymentId}`, <PaymentReturn />);
    expect(await screen.findByText("Payment verified", {}, { timeout: 9000 })).toBeTruthy();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(screen.getByText("MOCK-CAPTURE-1")).toBeTruthy();
  }, 15000);
  it("restores a mock payment return after a page reload", async () => {
    renderRoute("/payments/return", "/payments/return?paymentId=MOCK-PAY-1", <PaymentReturn />);
    expect(await screen.findByText("Payment verified", {}, { timeout: 9000 })).toBeTruthy();
  }, 15000);
  it("cancel route shows CANCELLED only after the backend says so", async () => {
    await api.approve("req-1", { quoteId: "q-a", approvedAmount: "17910.00", currency: "INR" });
    const order = await api.createOrder("req-1");
    renderRoute("/payments/cancel", `/payments/cancel?paymentId=${order.paymentId}`, <PaymentReturn cancelled />);
    expect(await screen.findByText("Payment cancelled")).toBeTruthy();
    expect(screen.queryByText("Payment verified")).toBeNull();
  });
});
