export const B = "https://api-m.sandbox.paypal.com";
export const REQ = "11111111-1111-4111-8111-111111111111";

export const tokenOk = { access_token: "t", expires_in: 3600 };
export const orderCreated = (id = "ORD1") => ({
  id, status: "PAYER_ACTION_REQUIRED",
  links: [{ rel: "payer-action", href: `https://www.sandbox.paypal.com/checkoutnow?token=${id}` }],
});
export const captureBody = (o: { orderId?: string; ref?: string; amount?: string; currency?: string; status?: string } = {}) => ({
  id: o.orderId ?? "ORD1", status: "COMPLETED", links: [],
  purchase_units: [{
    reference_id: o.ref ?? REQ,
    payments: { captures: [{ id: "CAP1", status: o.status ?? "COMPLETED", amount: { currency_code: o.currency ?? "USD", value: o.amount ?? "215.00" } }] },
  }],
});
