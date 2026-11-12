import type { FieldError, UseFormRegisterReturn } from "react-hook-form";
import { Input, inputClass } from "../ui/input";
export function Field({ label, reg, error, textarea, ...rest }: { label: string; reg: UseFormRegisterReturn; error?: FieldError; textarea?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  const common = { ...reg, "aria-invalid": !!error, "aria-describedby": error ? `${reg.name}-err` : undefined };
  return (
    <label className="block my-3 text-sm font-medium">{label}
      {textarea ? <textarea {...common} className={inputClass} rows={3} /> : <Input {...common} {...rest} />}
      {error && <span id={`${reg.name}-err`} role="alert" className="field-err">{error.message}</span>}
    </label>
  );
}
