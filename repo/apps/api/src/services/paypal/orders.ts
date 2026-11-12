import type Decimal from "decimal.js";
import { getEnv } from "./env";
import { PayPalError } from "./errors";
import { paypalFetch } from "./http";
import type { PayPalOrder } from "./types";

const ZERO_DECIMAL = new Set(["JPY", "HUF", "TWD"]);
export const formatAmount = (amount: Decimal, currency: string) =>
  amount.toFixed(ZERO_DECIMAL.has(currency) ? 0 : 2);

export async function createPayPalOrder(i: {
  paymentId: string; requestId: string; amount: Decimal; currency: string; description: string;
}) {
  const env = getEnv();
  const order = await paypalFetch<PayPalOrder>("/v2/checkout/orders", {
    method: "POST",
    requestId: `create-${i.paymentId}`,
    body: {
      intent: "CAPTURE",
      purchase_units: [{
        reference_id: i.requestId,
        custom_id: i.paymentId,
        description: i.description.slice(0, 120),
        amount: { currency_code: i.currency, value: formatAmount(i.amount, i.currency) },
      }],
      payment_source: { paypal: { experience_context: {
        brand_name: "FairCart Guard",
        user_action: "PAY_NOW",
        return_url: `${env.FRONTEND_URL}/payments/return?paymentId=${i.paymentId}`,
        cancel_url: `${env.FRONTEND_URL}/payments/cancel?paymentId=${i.paymentId}`,
      } } },
    },
  });
  const link = order.links.find((l) => l.rel === "payer-action") ?? order.links.find((l) => l.rel === "approve");
  if (!link) throw new PayPalError("NO_APPROVAL_LINK");
  return { orderId: order.id, status: order.status, approvalUrl: link.href };
}

export const getPayPalOrder = (orderId: string) =>
  paypalFetch<PayPalOrder>(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, { method: "GET" });

export async function capturePayPalOrder(orderId: string, paymentId: string): Promise<PayPalOrder> {
  try {
    return await paypalFetch<PayPalOrder>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: "POST", body: {}, requestId: `capture-${paymentId}`,
    });
  } catch (e) {
    // Already captured at PayPal: reconcile from the order instead of failing.
    if (e instanceof PayPalError && e.code === "ORDER_ALREADY_CAPTURED") return getPayPalOrder(orderId);
    throw e;
  }
}
