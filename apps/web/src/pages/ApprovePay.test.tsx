// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { handlers, resetMock } from "../mocks/handlers";
import { renderRoute } from "../test/render";
import ApprovePay from "./ApprovePay";

vi.mock("../lib/navigation", () => ({ redirect: vi.fn() }));
import { redirect } from "../lib/navigation";

const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => { cleanup(); resetMock(); vi.clearAllMocks(); });
afterAll(() => server.close());
const open = (qs: string) => renderRoute("/requests/:id/approve", `/requests/req-1/approve?${qs}`, <ApprovePay />);

describe("Approve and pay", () => {
  it("keeps the pay button disabled until the buyer confirms", async () => {
    open("quoteId=q-a&amount=17910.00&currency=INR");
    const btn = (await screen.findByRole("button", { name: /Pay with PayPal/ })) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    await userEvent.click(screen.getByLabelText(/I approve this exact quotation/));
    expect(btn.disabled).toBe(false);
  });
  it("approves, creates the order and redirects to PayPal", async () => {
    open("quoteId=q-a&amount=17910.00&currency=INR");
    await userEvent.click(await screen.findByLabelText(/I approve this exact quotation/));
    await userEvent.click(screen.getByRole("button", { name: /Pay with PayPal/ }));
    await waitFor(() => expect(redirect).toHaveBeenCalledWith(expect.stringContaining("/payments/return?paymentId=MOCK-PAY-1")));
  });
  it("shows an error and does not redirect when the amount does not match", async () => {
    open("quoteId=q-a&amount=1.00&currency=INR");
    await userEvent.click(await screen.findByLabelText(/I approve this exact quotation/));
    await userEvent.click(screen.getByRole("button", { name: /Pay with PayPal/ }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/amount no longer matches/i);
    expect(redirect).not.toHaveBeenCalled();
  });
  it("asks for a quotation first when none is selected", () => {
    open("");
    expect(screen.getByText(/Choose a quotation/)).toBeTruthy();
  });
});
