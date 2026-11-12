// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import axe from "axe-core";
import { setupServer } from "msw/node";
import { handlers, resetMock } from "../mocks/handlers";
import { renderRoute } from "./render";
import Dashboard from "../pages/Dashboard";
import CreateRequest from "../pages/CreateRequest";
import RequestDetail from "../pages/RequestDetail";
import Comparison from "../pages/Comparison";
import Recommendation from "../pages/Recommendation";
import QuoteReview from "../pages/QuoteReview";
import Summary from "../pages/Summary";
import ApprovePay from "../pages/ApprovePay";

const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => { cleanup(); resetMock(); });
afterAll(() => server.close());

async function check(container: HTMLElement) {
  // color-contrast needs a real layout engine; contrast is checked by hand (see docs).
  const r = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 80)}`)).toEqual([]);
}
const pages: [string, string, string, React.ReactElement, string | RegExp][] = [
  ["dashboard", "/", "/", <Dashboard />, "100 custom T-shirts (sample)"],
  ["create request", "/requests/new", "/requests/new", <CreateRequest />, "New purchase request"],
  ["request details", "/requests/:id", "/requests/req-1", <RequestDetail />, /Vendor A/],
  ["comparison", "/requests/:id/compare", "/requests/req-1/compare", <Comparison />, "Vendor A"],
  ["recommendation", "/requests/:id/recommendation", "/requests/req-1/recommendation", <Recommendation />, /Recommended:/],
  ["quote review", "/quotes/:qid/review", "/quotes/q-b/review", <QuoteReview />, "otherFees"],
  ["summary", "/requests/:id/summary", "/requests/req-1/summary", <Summary />, "Purchase summary"],
  ["approve and pay", "/requests/:id/approve", "/requests/req-1/approve?quoteId=q-a&amount=17910.00&currency=INR", <ApprovePay />, /Vendor A/],
];
describe("accessibility (axe)", () => {
  for (const [name, path, url, el, text] of pages) {
    it(`${name} has no axe violations`, async () => {
      const { container } = renderRoute(path, url, el);
      await screen.findAllByText(text);
      await check(container);
    });
  }
});
