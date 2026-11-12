// Standalone harness: lets you run the real PayPal sandbox flow WITHOUT the rest of the monorepo.
// It is NOT copied into the repo. Pages below stand in for Member 1's return/cancel pages.
import { randomUUID } from "node:crypto";
import express from "express";
import { loadEnv } from "./loadEnv";
loadEnv();

const { default: payments } = await import("../apps/api/src/routes/payments");
const { default: webhooks } = await import("../apps/api/src/routes/webhooks");

const app = express();
app.use("/api", webhooks);          // raw body: must be BEFORE express.json()
app.use(express.json());
app.use("/api", payments);
app.get("/health", (_req, res) => res.json({ status: "ok", mode: "m4-dev-harness" }));

const page = (body: string) => `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;max-width:640px;margin:40px auto">${body}`;
app.get("/", (_req, res) => res.send(page(`
<h2>Member 4 dev harness</h2>
<p>Creates a sandbox order for the dev-stub amount, sends you to PayPal, then captures on return.</p>
<button id="b" style="padding:10px 16px">Pay with PayPal (sandbox)</button><pre id="out"></pre>
<script>
document.getElementById("b").onclick = async () => {
  const r = await fetch("/api/payments/create-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: crypto.randomUUID() }) });
  const j = await r.json();
  if (j.approvalUrl) location.href = j.approvalUrl; else document.getElementById("out").textContent = JSON.stringify(j, null, 2);
};
</script>`)));
app.get("/payments/return", (_req, res) => res.send(page(`
<h2>Returned from PayPal</h2><p>Asking the backend to capture and verify...</p><pre id="out"></pre>
<script>
const id = new URLSearchParams(location.search).get("paymentId");
fetch("/api/payments/capture-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paymentId: id }) })
  .then(r => r.json()).then(j => { document.getElementById("out").textContent = JSON.stringify(j, null, 2); });
</script>`)));
app.get("/payments/cancel", (_req, res) => res.send(page(`
<h2>Cancelled at PayPal</h2><pre id="out"></pre>
<script>
const id = new URLSearchParams(location.search).get("paymentId");
fetch("/api/payments/" + id + "/cancel", { method: "POST" }).then(r => r.json()).then(j => { document.getElementById("out").textContent = JSON.stringify(j, null, 2); });
</script>`)));

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("unhandled:", err instanceof Error ? err.message : err);
  res.status(500).json({ code: "INTERNAL", message: "Internal error" });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log(`Member 4 harness on http://localhost:${port}  (request id example: ${randomUUID()})`));
