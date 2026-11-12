import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "../../lib/utils";
export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...p }, ref) => (
  <div ref={ref} className={cn("rounded-lg border border-slate-200 bg-white p-4 shadow-sm", className)} {...p} />
));
Card.displayName = "Card";
