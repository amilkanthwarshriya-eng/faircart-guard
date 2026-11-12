// OWNER: Member 4
import { Router } from "express";
import rateLimit from "express-rate-limit";
import * as c from "../controllers/payments.controller";

const router = Router();
router.use("/payments", rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false }));
router.post("/payments/create-order", c.createOrder);
router.post("/payments/capture-order", c.captureOrder);
router.get("/payments/:id", c.getPayment);
router.post("/payments/:id/cancel", c.cancelPayment);
export default router;
