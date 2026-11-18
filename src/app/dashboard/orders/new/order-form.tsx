"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button, Field, FormMessage, Input, Select, Textarea } from "@/components/ui";
import { PAYMENT_TYPES, type Driver } from "@/lib/types";
import { createOrder, type FormState } from "../../actions";

export function OrderForm({ drivers, today }: { drivers: Driver[]; today: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createOrder, {});
  const formRef = useRef<HTMLFormElement>(null);

  // After "Save and add another", clear the customer and item fields.
  useEffect(() => {
    if (state.ok && formRef.current) {
      const form = formRef.current;
      for (const name of ["customer_name", "customer_whatsapp", "address_text", "items", "amount_due", "notes"]) {
        const el = form.elements.namedItem(name) as HTMLInputElement | null;
        if (el) el.value = "";
      }
      (form.elements.namedItem("customer_name") as HTMLInputElement | null)?.focus();
    }
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-6">
      <fieldset className="space-y-4">
        <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-kerb">
          Customer
        </legend>
        <Field label="Name" htmlFor="customer_name">
          <Input id="customer_name" name="customer_name" placeholder="e.g. Thandi's Spaza" required />
        </Field>
        <Field
          label="WhatsApp number"
          htmlFor="customer_whatsapp"
          hint="We'll use this to confirm their location and send updates."
        >
          <Input
            id="customer_whatsapp"
            name="customer_whatsapp"
            type="tel"
            inputMode="tel"
            placeholder="082 123 4567"
            required
          />
        </Field>
        <Field label="Address or directions" htmlFor="address_text" hint="Optional. Landmarks help.">
          <Textarea
            id="address_text"
            name="address_text"
            placeholder="e.g. 1234 Mthembu St, Tembisa, blue gate next to the church"
          />
        </Field>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-kerb">
          Order
        </legend>
        <Field label="Items" htmlFor="items">
          <Textarea id="items" name="items" placeholder="e.g. 2x 9kg gas, 1x regulator" required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount due (R)" htmlFor="amount_due">
            <Input
              id="amount_due"
              name="amount_due"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="0.00"
            />
          </Field>
          <Field label="Payment" htmlFor="payment_type">
            <Select id="payment_type" name="payment_type" defaultValue="cash">
              {PAYMENT_TYPES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Delivery date" htmlFor="delivery_date">
            <Input id="delivery_date" name="delivery_date" type="date" defaultValue={today} required />
          </Field>
          <Field label="Driver" htmlFor="driver_id" hint={drivers.length ? undefined : "Add drivers first to assign them."}>
            <Select id="driver_id" name="driver_id" defaultValue="">
              <option value="">Assign later</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Notes for the driver" htmlFor="notes" hint="Optional">
          <Textarea id="notes" name="notes" placeholder="e.g. Call before arriving" />
        </Field>
      </fieldset>

      <FormMessage message={state.error} />
      {state.ok ? (
        <p role="status" className="rounded-lg bg-depot-soft px-3 py-2 text-sm text-depot-dark">
          {state.ok}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" name="next" value="done" disabled={pending}>
          {pending ? "Saving…" : "Save order"}
        </Button>
        <Button type="submit" name="next" value="another" variant="secondary" disabled={pending}>
          Save and add another
        </Button>
      </div>
    </form>
  );
}
