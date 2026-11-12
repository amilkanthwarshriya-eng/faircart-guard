import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../../lib/utils";
export const inputClass = "block w-full max-w-md min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-base aria-[invalid=true]:border-red-700";
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(inputClass, className)} {...p} />
));
Input.displayName = "Input";
