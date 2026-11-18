"use client";

import { useActionState, useState } from "react";
import { Button, cx, Field, FormMessage, Input } from "@/components/ui";
import { VEHICLE_TYPES } from "@/lib/types";
import { createCompany, type OnboardingState } from "./actions";

type Account = "logistics" | "vendor" | "both";

const CHOICES: { value: Account; title: string; body: string }[] = [
  {
    value: "logistics",
    title: "I deliver goods",
    body: "Manage orders, drivers and proof of delivery.",
  },
  {
    value: "vendor",
    title: "I rent out vehicles",
    body: "List bakkies, vans or trucks for delivery companies to rent monthly.",
  },
  {
    value: "both",
    title: "Both",
    body: "I run deliveries and also have vehicles to rent out.",
  },
];

export function CompanyForm() {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(createCompany, {});
  const [account, setAccount] = useState<Account | null>(null);
  const isVendor = account === "vendor" || account === "both";

  return (
    <form action={action} className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium text-stone-700">
          What will you use Layisha for?
        </legend>
        {CHOICES.map((c) => (
          <label
            key={c.value}
            className={cx(
              "flex cursor-pointer gap-3 rounded-lg border p-3 transition",
              account === c.value
                ? "border-brand-600 bg-brand-50 ring-2 ring-brand-100"
                : "border-stone-300 hover:bg-stone-50",
            )}
          >
            <input
              type="radio"
              name="account"
              value={c.value}
              checked={account === c.value}
              onChange={() => setAccount(c.value)}
              className="mt-1 accent-brand-700"
            />
            <span>
              <span className="block font-semibold">{c.title}</span>
              <span className="block text-sm text-stone-600">{c.body}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {account ? (
        <>
          <Field label={account === "vendor" ? "Your name or business name" : "Business name"} htmlFor="name">
            <Input
              id="name"
              name="name"
              placeholder={account === "vendor" ? "e.g. Thabo's Truck Hire" : "e.g. Mokoena Gas & Water"}
              required
            />
          </Field>
          <Field label="Phone number" htmlFor="phone" hint={isVendor ? "Companies will contact you on this number" : "Optional"}>
            <Input id="phone" name="phone" type="tel" inputMode="tel" placeholder="082 123 4567" required={isVendor} />
          </Field>
          <Field label="Town or city" htmlFor="city" hint="Optional">
            <Input id="city" name="city" placeholder="e.g. Tembisa" />
          </Field>

          {isVendor ? (
            <fieldset className="space-y-4 rounded-lg border border-stone-200 p-4">
              <legend className="px-1 text-sm font-semibold text-stone-700">Your vehicles</legend>
              <div className="space-y-2">
                <p className="text-sm font-medium text-stone-700">Which vehicles do you rent out?</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {VEHICLE_TYPES.map((t) => (
                    <label key={t} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="vehicle_types" value={t} className="accent-brand-700" />
                      {t}
                    </label>
                  ))}
                </div>
              </div>
              <Field label="How many vehicles?" htmlFor="fleet_size">
                <Input id="fleet_size" name="fleet_size" type="number" inputMode="numeric" min="1" defaultValue="1" />
              </Field>
              <Field label="Areas you serve" htmlFor="service_area" hint="e.g. Ekurhuleni and Johannesburg">
                <Input id="service_area" name="service_area" />
              </Field>
            </fieldset>
          ) : null}

          <FormMessage message={state.error} />
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Setting up…" : "Continue"}
          </Button>
        </>
      ) : null}
    </form>
  );
}
