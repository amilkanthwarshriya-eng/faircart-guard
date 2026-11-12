import { describe, expect, it } from "vitest";
import { PAYMENT_STATUSES } from "../../types/api";
import { isTerminal, isVerifiedSuccess } from "./paymentStatus";

describe("payment status gating", () => {
  it("only COMPLETED is success", () => {
    for (const s of PAYMENT_STATUSES) expect(isVerifiedSuccess(s)).toBe(s === "COMPLETED");
    expect(isVerifiedSuccess(undefined)).toBe(false);
  });
  it("keeps polling for in-progress states", () => {
    expect(isTerminal("CAPTURING")).toBe(false);
    expect(isTerminal("APPROVAL_PENDING")).toBe(false);
    expect(isTerminal("PENDING_REVIEW")).toBe(true);
  });
});
