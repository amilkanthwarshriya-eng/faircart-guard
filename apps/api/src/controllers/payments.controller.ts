// OWNER: Member 4
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { CaptureOrderBody, CreateOrderBody, PaymentIdParam } from "@faircart/shared";
import { getPaymentService, PayPalError, PaymentConflictError } from "../services/paypal";

export function fail(e: unknown, res: Response, next: NextFunction) {
  if (e instanceof ZodError) {
    const issues = (e as ZodError).issues ?? [];
    return res.status(400).json({
      code: "INVALID_INPUT",
      message: "Invalid input",
      details: issues,
      error: { code: "VALIDATION_ERROR", message: "Invalid input", details: issues },
    });
  }
  if (e instanceof PaymentConflictError) {
    const status = e.code === "NOT_FOUND" ? 404 : e.code === "NO_APPROVAL" ? 422 : 409;
    return res.status(status).json({
      code: e.code,
      message: e.message,
      error: { code: e.code, message: e.message },
    });
  }
  if (e instanceof PayPalError) {
    return res.status(502).json({
      code: "PAYPAL_UNAVAILABLE",
      message: "Payment provider error",
      details: { reason: e.code, debugId: e.debugId },
      error: { code: "PAYPAL_UNAVAILABLE", message: "Payment provider error", details: { reason: e.code, debugId: e.debugId } },
    });
  }
  return next(e);
}

export async function createOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const { requestId } = CreateOrderBody.parse(req.body);
    res.status(201).json(await getPaymentService().createOrder(requestId));
  } catch (e) { fail(e, res, next); }
}
export async function captureOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const { paymentId } = CaptureOrderBody.parse(req.body);
    res.status(200).json(await getPaymentService().captureOrder(paymentId));
  } catch (e) { fail(e, res, next); }
}
export async function getPayment(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = PaymentIdParam.parse(req.params);
    res.json(await getPaymentService().getPayment(id));
  } catch (e) { fail(e, res, next); }
}
export async function cancelPayment(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = PaymentIdParam.parse(req.params);
    res.json(await getPaymentService().cancelPayment(id));
  } catch (e) { fail(e, res, next); }
}
