import { useQuery } from "@tanstack/react-query";
import { Button } from "../components/ui/button";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api-client";
import { Async, dash } from "../components/common/Async";
import { PaymentStatusView } from "../features/payments/PaymentStatusView";

export default function Summary() {
  const { id = "" } = useParams();
  const { data: r, isLoading, error } = useQuery({ queryKey: ["request", id], queryFn: () => api.getRequest(id) });
  const pay = r?.payment;
  return (
    <main><h1>Purchase summary</h1>
      <Async loading={isLoading} error={error}>
        <dl><dt>Request</dt><dd>{dash(r?.title)}</dd><dt>Status</dt><dd>{dash(r?.status)}</dd>
          <dt>Budget</dt><dd>{dash(r?.budget)} {r?.currency}</dd>
          <dt>Approval</dt><dd>{dash(r?.approval?.status)} {r?.approval?.approvedAmount} {r?.approval?.currency}</dd></dl>
        {Array.isArray(r?.ruleChecks) && <><h2>Rule checks</h2><ul>{r.ruleChecks.map((c: any, i: number) => <li key={i}>{c.rule ?? c.name}: {c.result ?? c.status}{c.reason ? ` (${c.reason})` : ""}</li>)}</ul></>}
        {r?.recommendation?.explanation && <><h2>Recommendation</h2><p>{r.recommendation.explanation}</p></>}
        <h2>Payment</h2>
        {pay ? <PaymentStatusView payment={{ id: pay.id ?? pay.paymentId, status: pay.status, paypalOrderId: pay.paypalOrderId, paypalCaptureId: pay.paypalCaptureId ?? pay.captureId, amount: pay.amount, currency: pay.currency }} /> : <p>No payment yet.</p>}
        <p className="noprint"><Button onClick={() => window.print()}>Print summary</Button> <Link to="/history">Back to history</Link></p>
      </Async></main>
  );
}
