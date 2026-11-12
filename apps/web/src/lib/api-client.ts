import { ApiError } from "./errors";
import type { ApiErrorBody, ApprovalResponse, CreateOrderResponse, HealthResponse, PaymentView } from "../types/api";

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:4000";

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { headers: typeof init?.body === "string" ? { "Content-Type": "application/json" } : undefined, ...init });
  } catch {
    throw new ApiError("NETWORK", "Network error");
  }
  const text = await res.text();
  let data: unknown;
  try { data = text ? JSON.parse(text) : undefined; } catch { data = undefined; }
  if (!res.ok) {
    const b = data as Partial<ApiErrorBody> | undefined;
    throw new ApiError(b?.code ?? "UNKNOWN", b?.message ?? res.statusText, res.status);
  }
  return data as T;
}
const post = <T>(path: string, body?: unknown) =>
  http<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

type Obj = Record<string, any>; // eslint-disable-line
export const list = (d: unknown): Obj[] => (Array.isArray(d) ? d : (d as Obj | undefined)?.items ?? []);
export const api = {
  listRequests: () => http<{ items: Obj[]; total: number }>("/api/requests"),
  createRequest: (b: Obj) => post<Obj>("/api/requests", b),
  getRequest: (id: string) => http<Obj>(`/api/requests/${encodeURIComponent(id)}`),
  getQuote: (qid: string) => http<Obj>(`/api/quotes/${encodeURIComponent(qid)}`),
  listQuotes: (id: string) => http<unknown>(`/api/requests/${encodeURIComponent(id)}/quotes`),
  addManualQuote: (id: string, b: Obj) => post<Obj>(`/api/requests/${encodeURIComponent(id)}/quotes`, b),
  uploadQuote: (id: string, file: File) => { const f = new FormData(); f.append("file", file); return http<Obj>(`/api/requests/${encodeURIComponent(id)}/quotes`, { method: "POST", body: f }); },
  extractQuote: (qid: string) => post<Obj>(`/api/quotes/${encodeURIComponent(qid)}/extract`),
  reviewQuote: (qid: string) => http<Obj>(`/api/quotes/${encodeURIComponent(qid)}`, { method: "PATCH", body: JSON.stringify({ reviewed: true }) }),
  analyze: (id: string) => post<Obj>(`/api/requests/${encodeURIComponent(id)}/analyze`),
  getRecommendation: (id: string) => http<Obj>(`/api/requests/${encodeURIComponent(id)}/recommendation`),
  health: () => http<HealthResponse>("/health"),
  // approve echoes back the values the buyer saw; the backend rejects any mismatch (409 AMOUNT_MISMATCH).
  approve: (requestId: string, b: { quoteId: string; approvedAmount: string; currency: string }) =>
    post<ApprovalResponse>(`/api/requests/${encodeURIComponent(requestId)}/approve`, { ...b, confirm: true }),
  createOrder: (requestId: string) => post<CreateOrderResponse>("/api/payments/create-order", { requestId }),
  captureOrder: (paymentId: string) => post<PaymentView>("/api/payments/capture-order", { paymentId }),
  cancelPayment: (paymentId: string) => post<PaymentView>(`/api/payments/${encodeURIComponent(paymentId)}/cancel`),
  getPayment: (id: string) => http<PaymentView>(`/api/payments/${encodeURIComponent(id)}`),
};
