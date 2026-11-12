import { getEnv } from "./env";
import { PayPalError } from "./errors";

let cached: { token: string; expiresAt: number } | null = null;
let inflight: Promise<string> | null = null;

export function clearTokenCache() {
  cached = null;
  inflight = null;
}

export async function getPayPalAccessToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt - 60_000) return cached.token;
  inflight ??= (async () => {
    const env = getEnv();
    const basic = Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString("base64");
    const res = await fetch(`${env.PAYPAL_BASE_URL}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new PayPalError("AUTH_FAILED", res.status, res.headers.get("paypal-debug-id") ?? undefined);
    const j = (await res.json()) as { access_token: string; expires_in: number };
    cached = { token: j.access_token, expiresAt: Date.now() + j.expires_in * 1000 };
    return cached.token;
  })().finally(() => { inflight = null; });
  return inflight;
}
