import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { verifyPayPalCapture } from "../../src/services/paypal";
import { captureBody, REQ } from "./mocks";

const exp = { orderId: "ORD1", requestId: REQ, amount: new Decimal("215.00"), currency: "USD" };
const run = (o = {}) => verifyPayPalCapture(captureBody(o) as Parameters<typeof verifyPayPalCapture>[0], exp);

describe("verifyPayPalCapture (trust gate)", () => {
  it("accepts an exact match", () => expect(run()).toEqual({ kind: "COMPLETED", captureId: "CAP1" }));
  it("accepts equal amounts with different formatting", () => expect(run({ amount: "215" }).kind).toBe("COMPLETED"));
  it("rejects amount mismatch", () => expect(run({ amount: "214.99" })).toMatchObject({ kind: "PENDING_REVIEW", reason: "AMOUNT_MISMATCH" }));
  it("rejects currency mismatch", () => expect(run({ currency: "EUR" })).toMatchObject({ kind: "PENDING_REVIEW", reason: "CURRENCY_MISMATCH" }));
  it("rejects order id mismatch", () => expect(run({ orderId: "OTHER" })).toMatchObject({ reason: "ORDER_ID_MISMATCH" }));
  it("rejects reference mismatch", () => expect(run({ ref: "22222222-2222-4222-8222-222222222222" })).toMatchObject({ reason: "REFERENCE_MISMATCH" }));
  it("treats PENDING as review, never success", () => expect(run({ status: "PENDING" })).toMatchObject({ kind: "PENDING_REVIEW", reason: "PENDING" }));
  it("maps DECLINED to FAILED", () => expect(run({ status: "DECLINED" })).toMatchObject({ kind: "FAILED" }));
  it("handles missing capture data", () =>
    expect(verifyPayPalCapture({ id: "ORD1", status: "COMPLETED", links: [], purchase_units: [{ reference_id: REQ }] }, exp)).toMatchObject({ reason: "NO_CAPTURE_DATA" }));
});
