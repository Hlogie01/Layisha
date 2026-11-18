"use client";

import { useState, useTransition } from "react";
import { cx } from "@/components/ui";
import { formatRand, formatSaPhone } from "@/lib/phone";
import { ORDER_STATUSES, type Driver, type OrderRow, type OrderStatus } from "@/lib/types";
import {
  assignDriver,
  requestCustomerLocation,
  updateOrderStatus,
  type LocationRequestResult,
} from "./actions";

function ProofSummary({ order }: { order: OrderRow }) {
  const p = order.pod!;
  const time = new Intl.DateTimeFormat("en-ZA", { hour: "2-digit", minute: "2-digit" }).format(
    new Date(p.captured_at),
  );
  return (
    <div
      className={cx(
        "mt-3 space-y-2 rounded-lg px-3 py-2 text-sm",
        p.outcome === "delivered" ? "bg-depot-soft text-depot-dark" : "bg-signal-soft text-signal",
      )}
    >
      <p className="font-semibold">
        {p.outcome === "delivered" ? `Delivered at ${time}` : `Failed at ${time}: ${p.failure_reason ?? ""}`}
      </p>
      {p.outcome === "delivered" ? (
        <p>
          {p.otp_verified ? "PIN checked ✓" : `No PIN: ${p.no_otp_reason ?? "not given"}`}
          {p.recipient_name ? ` · Received by ${p.recipient_name}` : ""}
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        {p.photo_url ? (
          <a href={p.photo_url} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.photo_url} alt="Proof of delivery" className="h-16 w-16 rounded-md object-cover" />
          </a>
        ) : null}
        {p.lat != null && p.lng != null ? (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`}
            target="_blank"
            rel="noreferrer"
            className="font-semibold underline"
          >
            Where it was recorded
          </a>
        ) : null}
      </div>
    </div>
  );
}

function LocationStatus({ order }: { order: OrderRow }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<LocationRequestResult | null>(null);
  const c = order.customer;
  if (!c) return null;

  if (c.location_confirmed_at && c.lat != null && c.lng != null) {
    return (
      <div className="mt-2 rounded-lg bg-depot-soft px-3 py-2 text-sm">
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-depot-dark hover:underline"
        >
          📍 Location confirmed · Open map
        </a>
        {c.landmark_note ? <p className="mt-0.5 text-depot-dark">{c.landmark_note}</p> : null}
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-1.5">
      <p className="text-xs font-medium text-hivis-ink">Location not confirmed yet</p>
      {result?.kind === "link" ? (
        <div className="space-y-1">
          {result.note ? <p className="text-xs text-signal">{result.note}</p> : null}
          <a
            href={result.waUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex rounded-lg bg-[#25D366] px-3 py-1.5 text-sm font-semibold text-ink hover:opacity-90"
          >
            Open WhatsApp to send
          </a>
        </div>
      ) : result?.kind === "sent" ? (
        <p className="text-sm font-medium text-depot-dark">Sent on WhatsApp ✓</p>
      ) : (
        <>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => setResult(await requestCustomerLocation(order.id)))
            }
            className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-ink hover:bg-chalk disabled:opacity-60"
          >
            {pending ? "Creating link…" : "Ask for location"}
          </button>
          {result?.kind === "error" ? <p className="text-xs text-signal">{result.error}</p> : null}
        </>
      )}
    </div>
  );
}

const statusStyles: Record<OrderStatus, string> = {
  new: "bg-line text-ink",
  confirmed: "bg-hivis-soft text-ink",
  out_for_delivery: "bg-ink text-chalk",
  delivered: "bg-depot text-white",
  failed: "bg-signal text-white",
  cancelled: "bg-line text-kerb",
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
        "rounded-xl border border-line bg-white p-4 shadow-sm transition",
        pending && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-kerb">{order.reference}</p>
          <h3 className="truncate font-semibold">{order.customer?.name ?? "Unknown customer"}</h3>
          {order.customer ? (
            <a
              href={`https://wa.me/${order.customer.whatsapp.replace("+", "")}`}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-ink underline decoration-hivis decoration-2 underline-offset-4 hover:underline"
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

      <p className="mt-3 text-sm text-ink">{order.items}</p>
      {order.customer?.address_text ? (
        <p className="mt-1 text-sm text-kerb">{order.customer.address_text}</p>
      ) : null}
      {order.pod ? <ProofSummary order={order} /> : <LocationStatus order={order} />}

      <p className="mt-3 text-sm">
        <span className="font-semibold">{formatRand(Number(order.amount_due))}</span>{" "}
        <span className="text-kerb">· {paymentLabel[order.payment_type]}</span>
      </p>

      {order.customer && order.otp_code && order.status !== "delivered" && order.status !== "cancelled" ? (
        <a
          href={`https://wa.me/${order.customer.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(
            `Hi ${order.customer.name.split(" ")[0]}, your delivery PIN for order ${order.reference} is ${order.otp_code}. ` +
              "Give it to the driver only when you have received your order.",
          )}`}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex text-sm font-semibold text-ink underline decoration-hivis decoration-2 underline-offset-4 hover:underline"
        >
          Send delivery PIN on WhatsApp
        </a>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <label className="text-xs font-medium text-kerb">
          Driver
          <select
            className="mt-1 w-full rounded-lg border border-line bg-white px-2 py-2 text-sm text-ink"
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
        <label className="text-xs font-medium text-kerb">
          Status
          <select
            className="mt-1 w-full rounded-lg border border-line bg-white px-2 py-2 text-sm text-ink"
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
