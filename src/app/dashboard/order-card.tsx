"use client";

import { useTransition } from "react";
import { cx } from "@/components/ui";
import { formatRand, formatSaPhone } from "@/lib/phone";
import { ORDER_STATUSES, type Driver, type OrderRow, type OrderStatus } from "@/lib/types";
import { assignDriver, updateOrderStatus } from "./actions";

const statusStyles: Record<OrderStatus, string> = {
  new: "bg-stone-100 text-stone-700",
  confirmed: "bg-sky-100 text-sky-800",
  out_for_delivery: "bg-amber-100 text-amber-800",
  delivered: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-800",
  cancelled: "bg-stone-200 text-stone-500",
};

const paymentLabel = {
  prepaid: "Paid",
  cash: "Cash",
  eft: "EFT",
  card: "Card",
} as const;

export function OrderCard({ order, drivers }: { order: OrderRow; drivers: Driver[] }) {
  const [pending, startTransition] = useTransition();

  function submit(action: (fd: FormData) => Promise<void>, field: string, value: string) {
    const fd = new FormData();
    fd.set("order_id", order.id);
    fd.set(field, value);
    startTransition(() => action(fd));
  }

  const status = ORDER_STATUSES.find((s) => s.value === order.status);

  return (
    <article
      className={cx(
        "rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition",
        pending && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-stone-500">{order.reference}</p>
          <h3 className="truncate font-semibold">{order.customer?.name ?? "Unknown customer"}</h3>
          {order.customer ? (
            <a
              href={`https://wa.me/${order.customer.whatsapp.replace("+", "")}`}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-brand-700 hover:underline"
            >
              {formatSaPhone(order.customer.whatsapp)}
            </a>
          ) : null}
        </div>
        <span
          className={cx(
            "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
            statusStyles[order.status],
          )}
        >
          {status?.label}
        </span>
      </div>

      <p className="mt-3 text-sm text-stone-700">{order.items}</p>
      {order.customer?.address_text ? (
        <p className="mt-1 text-sm text-stone-500">{order.customer.address_text}</p>
      ) : null}
      {!order.customer?.location_confirmed_at ? (
        <p className="mt-2 text-xs font-medium text-amber-700">Location not confirmed yet</p>
      ) : null}

      <p className="mt-3 text-sm">
        <span className="font-semibold">{formatRand(Number(order.amount_due))}</span>{" "}
        <span className="text-stone-500">· {paymentLabel[order.payment_type]}</span>
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <label className="text-xs font-medium text-stone-500">
          Driver
          <select
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2 py-2 text-sm text-stone-900"
            value={order.driver_id ?? ""}
            disabled={pending}
            onChange={(e) => submit(assignDriver, "driver_id", e.target.value)}
          >
            <option value="">Unassigned</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-stone-500">
          Status
          <select
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2 py-2 text-sm text-stone-900"
            value={order.status}
            disabled={pending}
            onChange={(e) => submit(updateOrderStatus, "status", e.target.value)}
          >
            {ORDER_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </article>
  );
}
