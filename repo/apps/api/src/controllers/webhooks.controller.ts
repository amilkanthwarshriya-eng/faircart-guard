// OWNER: Member 4
import type { NextFunction, Request, Response } from "express";
import { getWebhookProcessor, verifyPayPalWebhook } from "../services/paypal";

export async function handlePayPalWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    const raw = req.body as unknown;
    if (!Buffer.isBuffer(raw)) {
      return res.status(400).json({ code: "RAW_BODY_REQUIRED", message: "Mount the webhook route before express.json()" });
    }
    let event: any;
    try { event = JSON.parse(raw.toString("utf8")); } catch { return res.status(400).json({ code: "INVALID_JSON", message: "Body is not JSON" }); }
    const needed = ["paypal-transmission-id", "paypal-transmission-time", "paypal-transmission-sig", "paypal-cert-url", "paypal-auth-algo"];
    if (needed.some((h) => !req.headers[h])) {
      return res.status(400).json({ code: "INVALID_SIGNATURE", message: "Missing PayPal signature headers" });
    }
    if (!(await verifyPayPalWebhook(req.headers, event))) {
      return res.status(400).json({ code: "INVALID_SIGNATURE", message: "Webhook signature invalid" });
    }
    const result = await getWebhookProcessor().process(event);
    res.status(200).json({ result });
  } catch (e) { next(e); }
}
