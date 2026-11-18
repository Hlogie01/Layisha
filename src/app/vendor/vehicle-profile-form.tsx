"use client";

import { useActionState } from "react";
import { Button, Field, FormMessage, Input } from "@/components/ui";
import { VEHICLE_TYPES } from "@/lib/types";
import type { VendorState } from "./actions";

export function VehicleProfileForm({
  action: serverAction,
  submitLabel,
  defaults,
}: {
  action: (prev: VendorState, formData: FormData) => Promise<VendorState>;
  submitLabel: string;
  defaults?: { vehicle_types: string[]; fleet_size: number | null; service_area: string | null };
}) {
  const [state, action, pending] = useActionState<VendorState, FormData>(serverAction, {});

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium text-stone-700">Which vehicles do you rent out?</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {VEHICLE_TYPES.map((t) => (
            <label key={t} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="vehicle_types"
                value={t}
                defaultChecked={defaults?.vehicle_types.includes(t)}
                className="accent-brand-700"
              />
              {t}
            </label>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="How many vehicles?" htmlFor="fleet_size">
          <Input
            id="fleet_size"
            name="fleet_size"
            type="number"
            inputMode="numeric"
            min="1"
            defaultValue={defaults?.fleet_size ?? 1}
          />
        </Field>
        <Field label="Areas you serve" htmlFor="service_area">
          <Input id="service_area" name="service_area" defaultValue={defaults?.service_area ?? ""} />
        </Field>
      </div>
      <FormMessage message={state.error} />
      {state.ok ? (
        <p role="status" className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">
          {state.ok}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
