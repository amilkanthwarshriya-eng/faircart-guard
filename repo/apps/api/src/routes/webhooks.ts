// OWNER: Member 4
// IMPORTANT: app.ts (Member 3) must mount this router BEFORE express.json(), because signature
// verification needs the raw body:   app.use("/api", webhooks); app.use(express.json());
import express, { Router } from "express";
import { handlePayPalWebhook } from "../controllers/webhooks.controller";

const router = Router();
router.post("/webhooks/paypal", express.raw({ type: "application/json", limit: "1mb" }), handlePayPalWebhook);
export default router;
