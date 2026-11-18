import type { Metadata } from "next";
import { Suspense } from "react";
import { Card } from "@/components/ui";
import { requireMembership } from "@/lib/dal";
import { formatSaPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import type { Driver } from "@/lib/types";
import { revokeDriverLinks, setDriverActive } from "../actions";
import { DriverLinkButton } from "./driver-link-button";
import { DriverForm } from "./driver-form";

export const metadata: Metadata = { title: "Drivers" };

async function DriverList() {
  const { company } = await requireMembership();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("drivers")
    .select("id, company_id, name, phone, vehicle, active")
    .eq("company_id", company.id)
    .order("active", { ascending: false })
    .order("name");
  if (error) throw new Error(error.message);
  const drivers = (data ?? []) as Driver[];

  const { data: tokens, error: tokenError } = await supabase
    .from("driver_access_tokens")
    .select("driver_id, last_used_at")
    .eq("company_id", company.id)
    .is("revoked_at", null);
  if (tokenError) throw new Error(tokenError.message);
  const links = new Map((tokens ?? []).map((t) => [t.driver_id as string, t.last_used_at as string | null]));

  if (drivers.length === 0) {
    return <p className="text-sm text-stone-500">No drivers yet. Add your first one.</p>;
  }

  return (
    <ul className="divide-y divide-stone-200">
      {drivers.map((d) => (
        <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className={d.active ? "font-semibold" : "font-semibold text-stone-400"}>
              {d.name}
              {!d.active ? <span className="ml-2 text-xs font-normal">(inactive)</span> : null}
            </p>
            <p className="text-sm text-stone-500">
              {formatSaPhone(d.phone)}
              {d.vehicle ? ` · ${d.vehicle}` : ""}
            </p>
            <p className="text-xs text-stone-500">
              {!links.has(d.id)
                ? "No app link yet"
                : links.get(d.id)
                  ? "Driver app connected"
                  : "App link sent, not opened yet"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
          {d.active ? <DriverLinkButton driverId={d.id} hasLink={links.has(d.id)} /> : null}
          {links.has(d.id) ? (
            <form action={revokeDriverLinks}>
              <input type="hidden" name="driver_id" value={d.id} />
              <button className="text-sm font-medium text-stone-500 hover:text-stone-800">
                Switch off app
              </button>
            </form>
          ) : null}
          <form action={setDriverActive}>
            <input type="hidden" name="driver_id" value={d.id} />
            <input type="hidden" name="active" value={d.active ? "false" : "true"} />
            <button className="text-sm font-medium text-stone-500 hover:text-stone-800">
              {d.active ? "Deactivate" : "Reactivate"}
            </button>
          </form>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function DriversPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Drivers</h1>
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <Card>
          <Suspense fallback={<p className="text-sm text-stone-500">Loading drivers…</p>}>
            <DriverList />
          </Suspense>
        </Card>
        <Card className="h-fit">
          <h2 className="mb-4 font-semibold">Add a driver</h2>
          <DriverForm />
        </Card>
      </div>
    </div>
  );
}
