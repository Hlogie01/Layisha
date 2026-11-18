"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button, Field, FormMessage, Input } from "@/components/ui";
import { addDriver, type FormState } from "../actions";

export function DriverForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(addDriver, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <Field label="Driver name" htmlFor="name">
        <Input id="name" name="name" placeholder="e.g. Sipho Dlamini" required />
      </Field>
      <Field label="Phone number" htmlFor="phone">
        <Input id="phone" name="phone" type="tel" inputMode="tel" placeholder="082 123 4567" required />
      </Field>
      <Field label="Vehicle" htmlFor="vehicle" hint="Optional, e.g. Toyota Hilux, GP 123-456">
        <Input id="vehicle" name="vehicle" />
      </Field>
      <FormMessage message={state.error} />
      {state.ok ? (
        <p role="status" className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">
          {state.ok}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Adding…" : "Add driver"}
      </Button>
    </form>
  );
}
