import { useState } from "react";
import { Button } from "../components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useParams, useSearchParams } from "react-router-dom";
import { api } from "../lib/api-client";
import { friendlyError } from "../lib/errors";
import { redirect } from "../lib/navigation";

// quoteId/amount/currency arrive from the recommendation page (backend values) and are echoed to
// POST /approve, which rejects any mismatch. PayPal's amount always comes from the DB approval.
export default function ApprovePay() {
  const { id: requestId = "" } = useParams();
  const q = useSearchParams()[0];
  const quoteId = q.get("quoteId"), amount = q.get("amount"), currency = q.get("currency");
  const quote = useQuery({ queryKey: ["quote", quoteId], queryFn: () => api.getQuote(quoteId!), enabled: !!quoteId });
  const [ok, setOk] = useState(false), [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null);
  if (!quoteId || !amount || !currency) return <main><p>Choose a quotation on the recommendation page first.</p></main>;

  async function pay() {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      await api.approve(requestId, { quoteId: quoteId!, approvedAmount: amount!, currency: currency! });
      const order = await api.createOrder(requestId);
      redirect(order.approvalUrl);
    } catch (e) { setErr(friendlyError(e)); setBusy(false); }
  }
  return (
    <main>
      <h1>Approve and pay</h1>
      <p>Vendor: {quote.data?.vendor?.name ?? quote.data?.vendorName ?? "loading"} · delivery {quote.data?.deliveryDays ?? "unknown"} days</p>
      <p>Amount: <strong>{amount} {currency}</strong> for quotation {quoteId}.</p>
      <p>Payment goes to one PayPal sandbox merchant account, not to the vendor.</p>
      <label><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /> I approve this exact quotation and amount.</label>
      <p><Button disabled={!ok || busy} onClick={pay}>{busy ? "Redirecting…" : "Pay with PayPal"}</Button></p>
      {err && <p role="alert">{err}</p>}
    </main>
  );
}
