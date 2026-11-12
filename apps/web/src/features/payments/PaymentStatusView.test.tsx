// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PAYMENT_STATUSES } from "../../types/api";
import { PaymentStatusView } from "./PaymentStatusView";

afterEach(cleanup);
const base = { id: "p1", paypalOrderId: "ORDER-1", paypalCaptureId: "CAP-1", amount: "17910.00", currency: "INR" };

describe("PaymentStatusView", () => {
  it("shows IDs and the verified message only for COMPLETED", () => {
    for (const status of PAYMENT_STATUSES) {
      const { unmount } = render(<PaymentStatusView payment={{ ...base, status }} />);
      const done = status === "COMPLETED";
      expect(!!screen.queryByText("Payment verified")).toBe(done);
      expect(!!screen.queryByText("CAP-1")).toBe(done);
      unmount();
    }
  });
  it("shows a warning, not success, for PENDING_REVIEW", () => {
    render(<PaymentStatusView payment={{ ...base, status: "PENDING_REVIEW" }} />);
    expect(screen.getByText("Payment is under review")).toBeTruthy();
  });
  it("shows a checking state when nothing has loaded", () => {
    render(<PaymentStatusView />);
    expect(screen.getByText(/Checking payment status/)).toBeTruthy();
  });
});
