import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

export const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 max-sm:mt-2 max-sm:w-full",
  { variants: { variant: { default: "bg-blue-600 text-white hover:bg-blue-700", outline: "border border-slate-300 bg-white text-slate-900 hover:bg-slate-50" } }, defaultVariants: { variant: "default" } }
);
// No default `type`, so a Button inside a <form> submits exactly like a plain <button>.
export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>>(
  ({ className, variant, ...p }, ref) => <button ref={ref} className={cn(buttonVariants({ variant }), className)} {...p} />
);
Button.displayName = "Button";
