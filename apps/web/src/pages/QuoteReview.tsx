import { useState } from "react";
import { Button } from "../components/ui/button";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api-client";
import { friendlyError } from "../lib/errors";
import { Async, dash } from "../components/common/Async";

const FIELDS = ["vendorName", "product", "quantity", "unitPrice", "subtotal", "tax", "shipping", "otherFees", "discount", "statedTotal", "currency", "deliveryDays", "validUntil", "paymentTerms"];

// Every extracted value is shown with its quoted evidence; uncertain or missing values are flagged
// and the buyer must tick a confirmation before the quote can be marked reviewed.
export default function QuoteReview() {
  const { qid = "" } = useParams(); const qc = useQueryClient();
  const { data: q, isLoading, error } = useQuery({ queryKey: ["quote", qid], queryFn: () => api.getQuote(qid) });
  const [ok, setOk] = useState(false);
  const save = useMutation({ mutationFn: () => api.reviewQuote(qid), onSuccess: () => qc.invalidateQueries({ queryKey: ["quote", qid] }) });
  const ex = q?.extraction ?? q ?? {};
  const ev: Record<string, string> = ex.evidence ?? {};
  const unsure = new Map<string, string>((ex.uncertainties ?? []).map((u: any) => [u.field, u.reason]));
  const missing: string[] = ex.missingFields ?? [];
  return (
    <main><h1>Review extracted values</h1>
      <Async loading={isLoading} error={error}>
        <div className="scroll" tabIndex={0} role="region" aria-label="Scrollable table"><table><thead><tr><th>Field</th><th>Value</th><th>Evidence from the quotation</th><th>Note</th></tr></thead>
          <tbody>{FIELDS.map((f) => (
            <tr key={f} className={unsure.has(f) || missing.includes(f) ? "bad" : ""}>
              <td>{f}</td><td>{dash(ex[f])}</td><td>{ev[f] ? <blockquote>{ev[f]}</blockquote> : "no evidence"}</td>
              <td>{unsure.get(f) ?? (missing.includes(f) ? "Not stated in the quotation" : "")}</td></tr>))}</tbody></table></div>
        <label><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /> I have checked these values against the quotation, including the highlighted rows.</label>
        <Button disabled={!ok || save.isPending || q?.status === "REVIEWED"} onClick={() => save.mutate()}>{q?.status === "REVIEWED" ? "Already reviewed" : "Confirm reviewed values"}</Button>
        {save.error && <p role="alert">{friendlyError(save.error)}</p>}
        <p><Link to={`/requests/${q?.requestId ?? q?.purchaseRequestId ?? ""}`}>Back to request</Link></p>
      </Async></main>
  );
}
