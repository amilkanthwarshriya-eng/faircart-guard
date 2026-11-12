// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { setupServer } from "msw/node";
import { handlers, resetMock } from "../mocks/handlers";
import { renderRoute } from "../test/render";
import Comparison from "./Comparison";

const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => { cleanup(); resetMock(); });
afterAll(() => server.close());

describe("Comparison table", () => {
  it("lists all three vendors and marks the ineligible one", async () => {
    renderRoute("/requests/:id/compare", "/requests/req-1/compare", <Comparison />);
    const c = (await screen.findByText("Vendor C")).closest("tr")!;
    expect(c.className).toContain("bad");
    expect(c.textContent).toContain("INELIGIBLE");
    expect(screen.getByText("Vendor A").closest("tr")!.className).not.toContain("bad");
    expect(screen.getByText("Vendor B")).toBeTruthy();
  });
  it("shows server-provided totals unchanged", async () => {
    renderRoute("/requests/:id/compare", "/requests/req-1/compare", <Comparison />);
    expect((await screen.findByText("Vendor A")).closest("tr")!.textContent).toContain("17910.00");
  });
});
