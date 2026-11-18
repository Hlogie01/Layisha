import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireMembership } from "@/lib/dal";
import { formatRand } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import type { Driver, OrderRow } from "@/lib/types";
import { DatePicker } from "./date-picker";
import { OrderCard } from "./order-card";

export const metadata: Metadata = { title: "Dispatch" };

function todayInSa() {
  // en-CA gives YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(new Date());
}

async function Board({ searchParams }: { searchParams: PageProps<"/dashboard">["searchParams"] }) {
  const { company } = await requireMembership();
  const params = await searchParams;
  const rawDate = typeof params.date === "string" ? params.date : undefined;
  const date = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : todayInSa();

  const supabase = await createClient();
  const [ordersRes, driversRes] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, reference, items, amount_due, payment_type, status, delivery_date, notes, driver_id, customer:customers(id, name, whatsapp, address_text, location_confirmed_at)",
      )
      .eq("company_id", company.id)
      .eq("delivery_date", date)
      .order("created_at", { ascending: true }),
    supabase
      .from("drivers")
      .select("id, company_id, name, phone, vehicle, active")
      .eq("company_id", company.id)
      .eq("active", true)
      .order("name"),
  ]);

  if (ordersRes.error) throw new Error(ordersRes.error.message);
  if (driversRes.error) throw new Error(driversRes.error.message);

  const orders = (ordersRes.data ?? []).map((o) => ({
    ...o,
    customer: Array.isArray(o.customer) ? (o.customer[0] ?? null) : o.customer,
  })) as OrderRow[];
  const drivers = (driversRes.data ?? []) as Driver[];

  const delivered = orders.filter((o) => o.status === "delivered");
  const failed = orders.filter((o) => o.status === "failed");
  const toCollect = orders
    .filter((o) => o.payment_type !== "prepaid" && o.status !== "cancelled")
    .reduce((sum, o) => sum + Number(o.amount_due), 0);

  const groups: { key: string; title: string; subtitle?: string; orders: OrderRow[] }[] = [
    {
      key: "unassigned",
      title: "Unassigned",
      orders: orders.filter((o) => !o.driver_id),
    },
    ...drivers.map((d) => ({
      key: d.id,
      title: d.name,
      subtitle: d.vehicle ?? undefined,
      orders: orders.filter((o) => o.driver_id === d.id),
    })),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dispatch</h1>
          <p className="text-sm text-stone-500">Orders for the selected day, grouped by driver.</p>
        </div>
        <DatePicker value={date} />
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Orders", value: String(orders.length) },
          { label: "Delivered", value: String(delivered.length) },
          { label: "Failed", value: String(failed.length) },
          { label: "To collect", value: formatRand(toCollect) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-stone-200 bg-white p-4">
            <dt className="text-xs font-medium text-stone-500">{s.label}</dt>
            <dd className="mt-1 text-xl font-bold">{s.value}</dd>
          </div>
        ))}
      </dl>

      {orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-300 bg-white p-10 text-center">
          <p className="font-semibold">No orders for this day yet</p>
          <p className="mt-1 text-sm text-stone-500">
            {drivers.length === 0
              ? "Start by adding your drivers, then create your first order."
              : "Create an order to get started."}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            {drivers.length === 0 ? (
              <Link
                href="/dashboard/drivers"
                className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold hover:bg-stone-100"
              >
                Add drivers
              </Link>
            ) : null}
            <Link
              href="/dashboard/orders/new"
              className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800"
            >
              New order
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {groups
            .filter((g) => g.key === "unassigned" || g.orders.length > 0 || drivers.length <= 6)
            .map((g) => (
              <section key={g.key} className="space-y-3">
                <header className="flex items-baseline justify-between">
                  <h2 className="font-semibold">
                    {g.title}{" "}
                    <span className="text-sm font-normal text-stone-500">({g.orders.length})</span>
                  </h2>
                  {g.subtitle ? <span className="text-xs text-stone-500">{g.subtitle}</span> : null}
                </header>
                {g.orders.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-stone-300 p-4 text-sm text-stone-500">
                    No orders
                  </p>
                ) : (
                  g.orders.map((o) => <OrderCard key={o.id} order={o} drivers={drivers} />)
                )}
              </section>
            ))}
        </div>
      )}
    </div>
  );
}

export default function DispatchPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <Suspense fallback={<p className="text-sm text-stone-500">Loading orders…</p>}>
      <Board searchParams={searchParams} />
    </Suspense>
  );
}
