import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api, list } from "../lib/api-client";
import { Badge } from "../components/ui/badge";
import { Async, dash } from "../components/common/Async";

const COLS = ["Vendor", "Subtotal", "Tax", "Shipping", "Other fees", "Total", "Delivery (days)", "Missing info", "Status"];

// On small screens each row becomes a card (see .stack in index.css); explicit roles keep table semantics.
export default function Comparison() {
  const { id = "" } = useParams();
  const { data, isLoading, error } = useQuery({ queryKey: ["quotes", id], queryFn: async () => list(await api.listQuotes(id)) });
  return (
    <main className="wide"><h1>Compare quotations</h1>
      <Async loading={isLoading} error={error}>
        <div className="scroll" tabIndex={0} role="region" aria-label="Quotation comparison">
          <table className="stack" role="table">
            <thead role="rowgroup"><tr role="row">{COLS.map((c) => <th key={c} role="columnheader" scope="col">{c}</th>)}</tr></thead>
            <tbody role="rowgroup">{(data ?? []).map((q) => {
              const cells = [dash(q.vendor?.name ?? q.vendorName), dash(q.subtotal), dash(q.tax), dash(q.shipping), dash(q.otherFees), dash(q.total), dash(q.deliveryDays),
                Array.isArray(q.missingFields) && q.missingFields.length ? q.missingFields.join(", ") : "none reported", dash(q.status)];
              return <tr role="row" key={q.id} className={q.status === "INELIGIBLE" ? "bad" : ""}>{cells.map((c, i) => <td role="cell" key={i} data-label={COLS[i]}>{i === 8 ? <Badge status={q.status}>{c}</Badge> : c}</td>)}</tr>;
            })}</tbody>
          </table>
        </div>
        <p>Values shown are as calculated by the server. “unknown” means the quotation did not state it.</p>
        <Link to={`/requests/${id}/recommendation`}>See recommendation</Link>
      </Async></main>
  );
}
