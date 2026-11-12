import { useState } from "react";
import { Button } from "../components/ui/button";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "../lib/api-client";
import { friendlyError } from "../lib/errors";
import { createRequestSchema, type CreateRequestForm } from "../lib/schemas";
import { Field } from "../components/common/Field";

export default function CreateRequest() {
  const nav = useNavigate();
  const [err, setErr] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<CreateRequestForm>({
    resolver: zodResolver(createRequestSchema),
    defaultValues: { title: "", description: "", quantity: "", budget: "", currency: "INR", deadline: "", specs: "", qualityPreferences: "" },
  });
  const onSubmit = handleSubmit(async (v) => {
    setErr(null);
    try {
      const r = await api.createRequest({ title: v.title, description: v.description, quantity: Number(v.quantity), budget: v.budget,
        currency: v.currency.toUpperCase(), deadline: v.deadline, requiredSpecs: v.specs.split("\n").map((s) => s.trim()).filter(Boolean) });
      nav(`/requests/${r.id}`);
    } catch (x) { setErr(friendlyError(x)); }
  });
  return (
    <main><h1>New purchase request</h1>
      <form onSubmit={onSubmit} noValidate>
        <Field label="Title" reg={register("title")} error={errors.title} />
        <Field label="Description" reg={register("description")} textarea />
        <Field label="Quantity" reg={register("quantity")} error={errors.quantity} inputMode="numeric" />
        <Field label="Budget" reg={register("budget")} error={errors.budget} inputMode="decimal" placeholder="20000.00" />
        <Field label="Currency" reg={register("currency")} error={errors.currency} maxLength={3} />
        <Field label="Deadline" reg={register("deadline")} error={errors.deadline} type="date" />
        <Field label="Required specifications (one per line)" reg={register("specs")} textarea />
        <Field label="Quality preferences" reg={register("qualityPreferences")} />
        <Button disabled={isSubmitting}>{isSubmitting ? "Creating…" : "Create request"}</Button>
        {err && <p role="alert">{err}</p>}
      </form></main>
  );
}