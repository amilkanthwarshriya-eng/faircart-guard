import { describe, expect, it } from "vitest";
import { createRequestSchema, manualQuoteSchema } from "./schemas";

const req = { title: "T-shirts", description: "", quantity: "100", budget: "20000.00", currency: "INR", deadline: "2026-11-30", specs: "", qualityPreferences: "" };
describe("create request schema", () => {
  it("accepts the demo scenario", () => expect(createRequestSchema.safeParse(req).success).toBe(true));
  it("rejects bad quantity, budget and currency", () => {
    for (const bad of [{ quantity: "0" }, { quantity: "1.5" }, { budget: "20,000" }, { budget: "-5" }, { currency: "RUPEES" }, { title: "  " }])
      expect(createRequestSchema.safeParse({ ...req, ...bad }).success).toBe(false);
  });
});
describe("manual quote schema", () => {
  const q = { vendor: "A", description: "Tee", quantity: "100", unitPrice: "145.00", lineTotal: "14500.00", currency: "INR", deliveryDays: "5" };
  it("accepts a valid quote, with delivery days optional", () => {
    expect(manualQuoteSchema.safeParse(q).success).toBe(true);
    expect(manualQuoteSchema.safeParse({ ...q, deliveryDays: "" }).success).toBe(true);
  });
  it("rejects float-looking or negative money", () => expect(manualQuoteSchema.safeParse({ ...q, unitPrice: "1e3" }).success).toBe(false));
});
