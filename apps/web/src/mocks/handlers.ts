import { http, HttpResponse } from "msw";

// MOCK API for local UI work only. Every value here is sample data (the T-shirt demo scenario)
// and every ID starts with MOCK. Nothing here is a real PayPal result.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Obj = Record<string, any>;
const err = (status: number, code: string, message: string) => HttpResponse.json({ code, message }, { status });
const day = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

function seed() {
  const q = (id: string, name: string, sub: string, tax: string, ship: string, fees: string, total: string, days: number, extra: Obj = {}): Obj => ({
    id, requestId: "req-1", vendor: { name }, subtotal: sub, tax, shipping: ship, otherFees: fees, total, deliveryDays: days, status: "REVIEWED", missingFields: [],
    extraction: { vendorName: name, product: "Custom T-shirt", quantity: "100", subtotal: sub, tax, shipping: ship, otherFees: fees, statedTotal: total, currency: "INR", deliveryDays: String(days),
      evidence: { subtotal: `Subtotal: ${sub}`, deliveryDays: `Delivery in ${days} days` }, uncertainties: [], missingFields: [] }, ...extra });
  const quotes: Obj[] = [
    q("q-a", "Vendor A", "14500.00", "2610.00", "800.00", "0.00", "17910.00", 5),
    q("q-b", "Vendor B", "15000.00", "2700.00", "0.00", "1200.00", "18900.00", 4, { status: "NEEDS_REVIEW" }),
    q("q-c", "Vendor C", "13500.00", "2430.00", "1000.00", "0.00", "16930.00", 10, { status: "INELIGIBLE" }),
  ];
  quotes[1].extraction.evidence.otherFees = "Handling and setup fee: 1,200";
  quotes[1].extraction.uncertainties = [{ field: "otherFees", reason: "The purpose of this fee is not explained" }];
  const recommendation: Obj = {
    mode: "demo", noEligibleVendor: false, budgetRemaining: "2090.00",
    recommendation: { quoteId: "q-a", explanation: "Vendor A is within budget and the 7-day deadline and scores highest overall (sample explanation).",
      tradeOffs: ["Vendor B delivers one day sooner but costs 990.00 more and includes an unexplained fee."] },
    ranking: [
      { quoteId: "q-a", total: "17910.00", score: "0.821", components: { cost: "1.00", delivery: "0.286", specs: "1.00", completeness: "1.00" } },
      { quoteId: "q-b", total: "18900.00", score: "0.397", components: { cost: "0.00", delivery: "0.429", specs: "1.00", completeness: "0.90" } },
    ],
    ineligible: [{ quoteId: "q-c", reasons: ["Delivery in 10 days misses the 7-day deadline"] }],
    risks: [{ quoteId: "q-b", severity: "medium", description: "A 1,200 extra fee is listed without explanation. Ask the vendor to disclose what it covers.", evidence: "Handling and setup fee: 1,200" }],
    uncertainties: [{ field: "Vendor B otherFees", reason: "Purpose not stated" }],
  };
  const request: Obj = { id: "req-1", title: "100 custom T-shirts (sample)", description: "Cotton fabric with custom printing", quantity: 100,
    budget: "20000.00", currency: "INR", deadline: day(7), specifications: ["cotton fabric", "custom printing"], status: "ANALYZED" };
  return { requests: [request], quotes, recommendation, approval: null as Obj | null, payment: null as Obj | null, polls: 0, n: 1 };
}
let db = seed();
export const resetMock = () => { db = seed(); };
const findReq = (id: string) => db.requests.find((r) => r.id === id);
const origin = () => (globalThis as Obj).location?.origin ?? "http://localhost:5173";
const restoreMockPayment = (id: string) => {
  if (id !== "MOCK-PAY-1") return null;
  return (db.payment ??= {
    id: "MOCK-PAY-1", status: "APPROVAL_PENDING", paypalOrderId: "MOCK-ORDER-1",
    amount: "17910.00", currency: "INR",
  });
};

export const handlers = [
  http.get("*/health", () => HttpResponse.json({ status: "ok", db: "mock", mode: "demo", llmProvider: "mock" })),
  http.get("*/api/requests", () => HttpResponse.json({ items: db.requests, total: db.requests.length })),
  http.post("*/api/requests", async ({ request }) => {
    const b = (await request.json()) as Obj; const r = { id: `req-${++db.n + 1}`, status: "COLLECTING_QUOTES", ...b };
    db.requests.push(r); return HttpResponse.json(r, { status: 201 });
  }),
  http.get("*/api/requests/:id/quotes", ({ params }) => HttpResponse.json(db.quotes.filter((q) => q.requestId === params.id))),
  http.post("*/api/requests/:id/quotes", async ({ request, params }) => {
    const ct = request.headers.get("content-type") ?? ""; let q: Obj;
    if (ct.includes("multipart")) { const f = (await request.formData()).get("file") as File | null;
      q = { vendor: { name: f?.name?.replace(/\.pdf$/i, "") ?? "Uploaded vendor" }, status: "UPLOADED" };
    } else { const b = (await request.json()) as Obj; const li = b.lineItems?.[0] ?? {};
      q = { vendor: b.vendor, total: li.lineTotal, subtotal: li.lineTotal, deliveryDays: b.deliveryDays, status: "REVIEWED" }; }
    const out = { id: `q-${++db.n}`, requestId: params.id, missingFields: [], ...q }; db.quotes.push(out); return HttpResponse.json(out, { status: 201 });
  }),
  http.get("*/api/quotes/:qid", ({ params }) => { const q = db.quotes.find((x) => x.id === params.qid); return q ? HttpResponse.json(q) : err(404, "NOT_FOUND", "Quote not found"); }),
  http.post("*/api/quotes/:qid/extract", ({ params }) => { const q = db.quotes.find((x) => x.id === params.qid); if (!q) return err(404, "NOT_FOUND", "Quote not found");
    q.status = "NEEDS_REVIEW"; q.extraction = { vendorName: q.vendor?.name, evidence: {}, uncertainties: [{ field: "total", reason: "Sample extraction" }], missingFields: ["tax"] }; q.missingFields = ["tax"]; return HttpResponse.json(q); }),
  http.patch("*/api/quotes/:qid", ({ params }) => { const q = db.quotes.find((x) => x.id === params.qid); if (!q) return err(404, "NOT_FOUND", "Quote not found"); q.status = "REVIEWED"; return HttpResponse.json(q); }),
  http.post("*/api/requests/:id/analyze", ({ params }) => { const r = findReq(String(params.id)); if (r) r.status = "ANALYZED"; return HttpResponse.json(db.recommendation); }),
  http.get("*/api/requests/:id/recommendation", () => HttpResponse.json(db.recommendation)),
  http.post("*/api/requests/:id/approve", async ({ request, params }) => {
    const b = (await request.json()) as Obj; const q = db.quotes.find((x) => x.id === b.quoteId);
    if (!b.confirm || !q) return err(400, "VALIDATION_ERROR", "Confirmation required");
    if (q.status === "INELIGIBLE" || b.approvedAmount !== q.total || b.currency !== "INR") return err(409, "AMOUNT_MISMATCH", "Amount does not match the quotation");
    db.approval = { approvalId: "MOCK-APPROVAL-1", quoteId: q.id, approvedAmount: q.total, currency: "INR", status: "APPROVED" };
    const r = findReq(String(params.id)); if (r) r.status = "APPROVED"; return HttpResponse.json(db.approval);
  }),
  http.get("*/api/requests/:id", ({ params }) => { const r = findReq(String(params.id)); if (!r) return err(404, "NOT_FOUND", "Request not found");
    return HttpResponse.json({ ...r, approval: db.approval, payment: db.payment, recommendation: db.recommendation.recommendation,
      ruleChecks: [{ rule: "Within budget", result: "pass" }, { rule: "Delivery by deadline", result: "pass (Vendor A)" }, { rule: "Vendor C delivery", result: "fail", reason: "10 days > 7 days" }] }); }),
  http.post("*/api/payments/create-order", () => {
    if (!db.approval) return err(409, "APPROVAL_INVALID", "No valid approval");
    db.payment = { id: "MOCK-PAY-1", status: "APPROVAL_PENDING", paypalOrderId: "MOCK-ORDER-1", amount: db.approval.approvedAmount, currency: "INR" }; db.polls = 0;
    return HttpResponse.json({ paymentId: db.payment.id, status: db.payment.status, approvalUrl: `${origin()}/payments/return?paymentId=${db.payment.id}` }, { status: 201 });
  }),
  http.post("*/api/payments/capture-order", async ({ request }) => {
    const { paymentId } = (await request.json()) as Obj; const p = db.payment ?? restoreMockPayment(paymentId);
    if (!p || p.id !== paymentId) return err(404, "NOT_FOUND", "Payment not found");
    if (p.status === "COMPLETED" || p.status === "CANCELLED") return err(409, "ALREADY_FINAL", "Payment already finalised");
    p.status = "CAPTURING"; return HttpResponse.json(p);
  }),
  http.post("*/api/payments/:id/cancel", () => { if (db.payment && db.payment.status !== "COMPLETED") db.payment.status = "CANCELLED"; return HttpResponse.json(db.payment ?? {}); }),
  http.get("*/api/payments/:id", ({ params }) => { const p = db.payment ?? restoreMockPayment(String(params.id));
    if (!p || p.id !== params.id) return err(404, "NOT_FOUND", "Payment not found");
    if (p.status === "CAPTURING" && ++db.polls >= 2) { p.status = "COMPLETED"; p.paypalCaptureId = "MOCK-CAPTURE-1"; const r = findReq("req-1"); if (r) r.status = "PAID"; }
    return HttpResponse.json(p); }),
];
