import { useState } from "react";
import { Button, buttonVariants } from "../components/ui/button";
import { cn } from "../lib/utils";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, list } from "../lib/api-client";
import { friendlyError } from "../lib/errors";
import ManualQuoteForm from "./ManualQuoteForm";
import { Async, dash } from "../components/common/Async";

const MAX = 10 * 1024 * 1024;
export default function RequestDetail() {
  const { id = "" } = useParams(); const nav = useNavigate(); const qc = useQueryClient();
  const req = useQuery({ queryKey: ["request", id], queryFn: () => api.getRequest(id) });
  const quotes = useQuery({ queryKey: ["quotes", id], queryFn: async () => list(await api.listQuotes(id)) });
  const [msg, setMsg] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["quotes", id] });
  const run = useMutation({ mutationFn: (f: () => Promise<unknown>) => f(), onSuccess: () => { setMsg(null); refresh(); }, onError: (e) => setMsg(friendlyError(e)) });

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.type !== "application/pdf") return setMsg("Only PDF files are accepted.");
    if (f.size > MAX) return setMsg("File is too large (10 MB maximum).");
    run.mutate(() => api.uploadQuote(id, f));
  }
  const r = req.data;
  return (
    <main>
      <Async loading={req.isLoading} error={req.error}>
        <h1>{dash(r?.title)}</h1>
        <p>{r?.quantity} units · budget {r?.budget} {r?.currency} · deadline {dash(r?.deadline)} · status {dash(r?.status)}</p>
        {Array.isArray(r?.specifications) && <p>Specs: {r.specifications.join(", ")}</p>}
      </Async>
      <h2>Quotations</h2>
      <Async loading={quotes.isLoading} error={quotes.error}>
        {(quotes.data ?? []).length === 0 ? <p>No quotations yet. Upload a PDF or enter one manually.</p> :
          <ul>{quotes.data!.map((q) => (
            <li key={q.id}>{dash(q.vendor?.name ?? q.vendorName)} — {q.status}{" "}
              {q.status === "UPLOADED" && <Button disabled={run.isPending} onClick={() => run.mutate(() => api.extractQuote(q.id))}>Extract</Button>}
              {(q.status === "EXTRACTED" || q.status === "NEEDS_REVIEW") && <Link to={`/quotes/${q.id}/review`}>Review extracted values</Link>}
            </li>))}</ul>}
      </Async>
      <label>Upload a quotation PDF<input type="file" accept="application/pdf" onChange={onFile} /></label>
      <ManualQuoteForm busy={run.isPending} onAdd={(b) => run.mutate(() => api.addManualQuote(id, b))} />
      {msg && <p role="alert" className="mt-4">{msg}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button disabled={run.isPending} onClick={() => run.mutate(async () => { await api.analyze(id); nav(`/requests/${id}/recommendation`); })}>Analyze quotations</Button>
        <Link to={`/requests/${id}/compare`} className={cn(buttonVariants(), "button-link")}>Compare quotations</Link>
      </div>
    </main>
  );
}