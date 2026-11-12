import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badge = cva("inline-block rounded-full px-2 py-0.5 text-xs font-semibold", {
  variants: { variant: { secondary: "bg-slate-100 text-slate-800", success: "bg-green-100 text-green-900", warning: "bg-amber-100 text-amber-900", destructive: "bg-red-100 text-red-900" } },
  defaultVariants: { variant: "secondary" },
});
type V = "secondary" | "success" | "warning" | "destructive";
export function statusVariant(s?: string): V {
  if (!s) return "secondary";
  if (["PAID", "ELIGIBLE", "REVIEWED", "APPROVED", "COMPLETED"].includes(s)) return "success";
  if (["INELIGIBLE", "EXPIRED", "FAILED", "PAYMENT_FAILED"].includes(s)) return "destructive";
  if (["NEEDS_REVIEW", "PENDING_REVIEW", "AWAITING_APPROVAL"].includes(s)) return "warning";
  return "secondary";
}
export function Badge({ status, children }: { status?: string; children: React.ReactNode }) {
  return <span className={cn(badge({ variant: statusVariant(status) }))}>{children}</span>;
}
