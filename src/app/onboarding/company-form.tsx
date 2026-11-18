"use client";

import { useActionState } from "react";
import { Button, Field, FormMessage, Input } from "@/components/ui";
import { createCompany, type OnboardingState } from "./actions";

export function CompanyForm() {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(createCompany, {});

  return (
    <form action={action} className="space-y-4">
      <Field label="Business name" htmlFor="name">
        <Input id="name" name="name" placeholder="e.g. Mokoena Gas & Water" required />
      </Field>
      <Field label="Business phone" htmlFor="phone" hint="Optional">
        <Input id="phone" name="phone" type="tel" inputMode="tel" placeholder="082 123 4567" />
      </Field>
      <Field label="Town or city" htmlFor="city" hint="Optional">
        <Input id="city" name="city" placeholder="e.g. Tembisa" />
      </Field>
      <FormMessage message={state.error} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Setting up…" : "Continue"}
      </Button>
    </form>
  );
}
