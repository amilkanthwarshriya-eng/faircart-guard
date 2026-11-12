import { AlertTriangle, CheckCircle2, Clock, Info, XCircle } from "lucide-react";
import type { PaymentView } from "../../types/api";
import { Card } from "../../components/ui/card";
import { STATUS_COPY, isVerifiedSuccess } from "./paymentStatus";

const ICON = { ok: CheckCircle2, warn: AlertTriangle, bad: XCircle, info: Info } as const;
const BORDER = { ok: "border-l-green-700", warn: "border-l-amber-500", bad: "border-l-red-700", info: "border-l-blue-600" } as const;

export function PaymentStatusView({ payment }: { payment?: PaymentView }) {
  if (!payment) return <p role="status" className="flex items-center gap-2"><Clock size={18} aria-hidden="true" />Checking payment status…</p>;
  const c = STATUS_COPY[payment.status]; const Icon = ICON[c.tone];
  return (
    <Card role="status" aria-live="polite" className={`border-l-4 ${BORDER[c.tone]}`}>
      <h2 className="flex items-center gap-2"><Icon size={22} aria-hidden="true" />{c.title}</h2>
      <p>{c.body}</p>
      {isVerifiedSuccess(payment.status) && (
        <dl>
          <dt>PayPal order ID</dt><dd>{payment.paypalOrderId ?? "unavailable"}</dd>
          <dt>Capture ID</dt><dd>{payment.paypalCaptureId ?? "unavailable"}</dd>
          <dt>Amount</dt><dd>{payment.amount} {payment.currency}</dd>
        </dl>
      )}
    </Card>
  );
}
