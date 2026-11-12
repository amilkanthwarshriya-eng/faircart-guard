import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api-client";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { buttonVariants } from "../components/ui/button";
import { cn } from "../lib/utils";
import { Async, dash } from "../components/common/Async";

export default function Dashboard({ history = false }: { history?: boolean }) {
  const { data, isLoading, error } = useQuery({ queryKey: ["requests"], queryFn: api.listRequests });
  const items = data?.items ?? [];
  return (
    <main>
      <h1>{history ? "Purchase history" : "Dashboard"}</h1>
      {!history && <div className="cards">{[["Total", items.length], ["Collecting quotes", items.filter((r) => r.status === "COLLECTING_QUOTES").length],
        ["Awaiting approval", items.filter((r) => r.status === "AWAITING_APPROVAL").length], ["Paid", items.filter((r) => r.status === "PAID").length]]
        .map(([k, n]) => <Card key={String(k)}><strong>{n}</strong> {k}</Card>)}</div>}
      {!history && <p className="mb-4"><Link to="/requests/new" className={cn(buttonVariants(), "button-link")}>New purchase request</Link></p>}
      <Async loading={isLoading} error={error}>
        {items.length === 0 ? <p>No purchase requests yet. Create one to start comparing quotations.</p> : (
          <div className="scroll" tabIndex={0} role="region" aria-label="Scrollable table"><table>
            <thead><tr><th>Request</th><th>Budget</th><th>Status</th><th>Summary</th></tr></thead>
            <tbody>{items.map((r) => (
              <tr key={r.id}>
                <td><Link to={`/requests/${r.id}`}>{dash(r.title)}</Link></td>
                <td>{dash(r.budget)} {r.currency}</td><td><Badge status={r.status}>{dash(r.status)}</Badge></td>
                <td><Link to={`/requests/${r.id}/summary`}>Summary</Link></td>
              </tr>))}</tbody>
          </table></div>)}
      </Async>
    </main>
  );
}
