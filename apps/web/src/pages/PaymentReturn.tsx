import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api-client";
import { ApiError, friendlyError } from "../lib/errors";
import { PaymentStatusView } from "../features/payments/PaymentStatusView";
import { usePayment } from "../features/payments/usePayment";

// The URL is only a trigger. Status always comes from GET /api/payments/:id.
export default function PaymentReturn({ cancelled = false }: { cancelled?: boolean }) {
  const paymentId = useSearchParams()[0].get("paymentId");
  const fired = useRef(false);
  const [err, setErr] = useState<string | null>(null);
  const { data, error } = usePayment(paymentId);

  useEffect(() => {
    if (!paymentId || fired.current) return;
    fired.current = true; // strict-mode double-effect guard
    const call = cancelled ? api.cancelPayment(paymentId) : api.captureOrder(paymentId);
    call.catch((e) => { if (!(e instanceof ApiError && e.code === "ALREADY_FINAL")) setErr(friendlyError(e)); });
  }, [paymentId, cancelled]);

  if (!paymentId) return <main><p>Missing payment reference.</p><Link to="/">Back to dashboard</Link></main>;
  return (
    <main>
      <h1>Payment status</h1>
      <PaymentStatusView payment={data} />
      {(err || error) && <p role="alert">{err ?? friendlyError(error)}</p>}
    </main>
  );
}
