import { useForm } from "react-hook-form";
import { Button } from "../components/ui/button";
import { zodResolver } from "@hookform/resolvers/zod";
import { manualQuoteSchema, type ManualQuoteForm as F } from "../lib/schemas";
import { Field } from "../components/common/Field";

export default function ManualQuoteForm({ busy, onAdd }: { busy: boolean; onAdd: (body: Record<string, unknown>) => void }) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<F>({
    resolver: zodResolver(manualQuoteSchema),
    defaultValues: { vendor: "", description: "", quantity: "", unitPrice: "", lineTotal: "", currency: "INR", deliveryDays: "" },
  });
  const submit = handleSubmit((v) => {
    onAdd({ vendor: { name: v.vendor }, currency: v.currency.toUpperCase(), deliveryDays: v.deliveryDays ? Number(v.deliveryDays) : undefined,
      lineItems: [{ description: v.description, quantity: Number(v.quantity), unitPrice: v.unitPrice, lineTotal: v.lineTotal }] });
    reset();
  });
  return (
    <form onSubmit={submit} noValidate><h3>Enter a quotation manually</h3>
      <Field label="Vendor" reg={register("vendor")} error={errors.vendor} />
      <Field label="Item" reg={register("description")} error={errors.description} />
      <Field label="Quantity" reg={register("quantity")} error={errors.quantity} inputMode="numeric" />
      <Field label="Unit price" reg={register("unitPrice")} error={errors.unitPrice} inputMode="decimal" />
      <Field label="Line total" reg={register("lineTotal")} error={errors.lineTotal} inputMode="decimal" />
      <Field label="Currency" reg={register("currency")} error={errors.currency} maxLength={3} />
      <Field label="Delivery days" reg={register("deliveryDays")} error={errors.deliveryDays} inputMode="numeric" />
      <Button disabled={busy}>Add quotation</Button>
    </form>
  );
}
