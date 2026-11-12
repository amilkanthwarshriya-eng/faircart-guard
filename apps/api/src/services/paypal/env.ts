import { z } from "zod";

const schema = z.object({
  PAYPAL_CLIENT_ID: z.string().min(1),
  PAYPAL_CLIENT_SECRET: z.string().min(1),
  // Hard-block anything except the sandbox URL.
  PAYPAL_BASE_URL: z.literal("https://api-m.sandbox.paypal.com"),
  PAYPAL_WEBHOOK_ID: z.string().optional(),
  FRONTEND_URL: z.string().url(),
});
export type PayPalEnv = z.infer<typeof schema>;

let cached: PayPalEnv | null = null;
export function getEnv(): PayPalEnv {
  return (cached ??= schema.parse(process.env));
}
