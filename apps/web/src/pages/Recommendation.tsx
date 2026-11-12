import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api, list } from "../lib/api-client";
import { Async, dash } from "../components/common/Async";

export default function Recommendation() {
  const { id = "" } = useParams();
  const rec = useQuery({ queryKey: ["rec", id], queryFn: () => api.getRecommendation(id), retry: false });
  const quotes = useQuery({ queryKey: ["quotes", id], queryFn: async () => list(await api.listQuotes(id)) });
  const req = useQuery({ queryKey: ["request", id], queryFn: () => api.getRequest(id) });
  const name = (qid: string) => { const q = (quotes.data ?? []).find((x) => x.id === qid); return dash(q?.vendor?.name ?? q?.vendorName ?? qid); };
  const d = rec.data;
  return (
    <main className="wide"><h1>Recommendation</h1>
      <Async loading={rec.isLoading} error={rec.error}>
        {d?.mode === "demo" && <p className="banner">Demo data: sample analysis, not a live result.</p>}
        {d?.noEligibleVendor ? <p role="alert">No eligible vendor found. Review the purchasing requirements or request new quotations.</p> : d && (<>
          <section className="card tone-ok"><h2>Recommended: {name(d.recommendation?.quoteId)}</h2><p>{d.recommendation?.explanation}</p></section>
          {d.budgetRemaining !== undefined && <p>Budget remaining after this purchase: <strong>{d.budgetRemaining} {req.data?.currency}</strong></p>}
          {(d.recommendation?.tradeOffs ?? []).length > 0 && <><h2>Trade-offs</h2><ul>{d.recommendation.tradeOffs.map((t: string, i: number) => <li key={i}>{t}</li>)}</ul></>}
          {(d.uncertainties ?? []).length > 0 && <><h2>Uncertain facts</h2><ul>{d.uncertainties.map((t: any, i: number) => <li key={i}>{typeof t === "string" ? t : `${t.field}: ${t.reason}`}</li>)}</ul></>}
          <h2>Score breakdown</h2>
          <div className="scroll" tabIndex={0} role="region" aria-label="Scrollable table"><table><thead><tr><th>Vendor</th><th>Total</th><th>Cost</th><th>Delivery</th><th>Specs</th><th>Completeness</th><th>Final</th><th>Action</th></tr></thead>
            <tbody>{(d.ranking ?? []).map((r: any) => (
              <tr key={r.quoteId}><td>{name(r.quoteId)}</td><td>{r.total}</td><td>{r.components?.cost}</td><td>{r.components?.delivery}</td>
                <td>{r.components?.specs}</td><td>{r.components?.completeness}</td><td>{r.score}</td>
                <td>{r.quoteId === d.recommendation?.quoteId && <Link to={`/requests/${id}/approve?quoteId=${r.quoteId}&amount=${encodeURIComponent(r.total)}&currency=${encodeURIComponent(req.data?.currency ?? "")}`}>Approve this quotation</Link>}</td></tr>))}</tbody></table></div>
          {(d.ineligible ?? []).length > 0 && <><h2>Ineligible quotations</h2><ul>{d.ineligible.map((x: any) => <li key={x.quoteId}>{name(x.quoteId)}: {(x.reasons ?? []).join(", ")}</li>)}</ul></>}
          {(d.risks ?? []).length > 0 && <><h2>Points to check</h2><ul>{d.risks.map((x: any, i: number) => (
            <li key={i}><strong>{name(x.quoteId)}</strong> ({x.severity}): {x.description}{x.evidence && <blockquote>{x.evidence}</blockquote>}</li>))}</ul></>}
        </>)}
      </Async></main>
  );
}
