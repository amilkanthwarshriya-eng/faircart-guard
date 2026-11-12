import { friendlyError } from "../../lib/errors";
export function Async({ loading, error, children }: { loading: boolean; error: unknown; children: React.ReactNode }) {
  if (loading) return <p role="status">Loading…</p>;
  if (error) return <p role="alert">{friendlyError(error)}</p>;
  return <>{children}</>;
}
export const dash = (v: unknown) => (v === undefined || v === null || v === "" ? "unknown" : String(v));
