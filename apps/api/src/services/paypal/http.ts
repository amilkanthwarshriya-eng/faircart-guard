import { getEnv } from "./env";
import { PayPalError } from "./errors";
import { clearTokenCache, getPayPalAccessToken } from "./token";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function toError(res: Response, debugId?: string): Promise<PayPalError> {
  let body: { name?: string; details?: Array<{ issue?: string }> } = {};
  try { body = (await res.json()) as typeof body; } catch { /* non-JSON error body */ }
  return new PayPalError(body.details?.[0]?.issue ?? body.name ?? `HTTP_${res.status}`, res.status, debugId);
}

/** Authenticated PayPal call. Retries only network errors, 429 and 5xx (max 2) with the SAME request id. Never logs secrets. */
export async function paypalFetch<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown; requestId?: string },
): Promise<T> {
  const env = getEnv();
  for (let attempt = 0; ; attempt++) {
    try {
      const token = await getPayPalAccessToken();
      const res = await fetch(`${env.PAYPAL_BASE_URL}${path}`, {
        method: init.method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...(init.requestId ? { "PayPal-Request-Id": init.requestId } : {}),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(15_000),
      });
      const debugId = res.headers.get("paypal-debug-id") ?? undefined;
      if (res.ok) return (await res.json()) as T;
      if (res.status === 401 && attempt === 0) { clearTokenCache(); continue; }
      if ((res.status === 429 || res.status >= 500) && attempt < 2) { await sleep(300 * 2 ** attempt); continue; }
      throw await toError(res, debugId);
    } catch (e) {
      if (e instanceof PayPalError) throw e;
      if (attempt < 2) { await sleep(300 * 2 ** attempt); continue; }
      throw new PayPalError("NETWORK_ERROR");
    }
  }
}
