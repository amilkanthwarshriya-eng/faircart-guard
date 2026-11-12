import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api-client";

export function DemoBanner() {
  const { data, isError } = useQuery({ queryKey: ["health"], queryFn: api.health, retry: false });
  if (import.meta.env.VITE_USE_MOCKS === "true") return <div className="banner" role="status">MOCK API: sample data only. No real backend, AI or PayPal payment is involved.</div>;
  if (isError) return <div className="banner" role="alert">API unreachable. Nothing shown here is a live result.</div>;
  if (data?.mode === "demo") return <div className="banner" role="status">Demo mode: sample data, not a live result.</div>;
  return null;
}
