"use client";

import { useTransition } from "react";
import { forgetCustomer } from "../actions";

export function ForgetCustomerButton({ customerId, name }: { customerId: string; name: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (
          !confirm(
            `Remove ${name}'s personal details? Their name, number, location and delivery photos will be deleted. This can't be undone.`,
          )
        ) {
          return;
        }
        const fd = new FormData();
        fd.set("customer_id", customerId);
        startTransition(() => forgetCustomer(fd));
      }}
      className="text-sm font-medium text-signal hover:underline disabled:opacity-60"
    >
      {pending ? "Removing…" : "Remove personal details"}
    </button>
  );
}
