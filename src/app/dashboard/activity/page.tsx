import type { Metadata } from "next";
import { Suspense } from "react";
import { Card } from "@/components/ui";
import { requireLogistics } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Activity" };

interface Entry {
  id: number;
  action: string;
  details: Record<string, unknown>;
  actor_user_id: string | null;
  actor_driver_id: string | null;
  at: string;
}

const LABELS: Record<string, string> = {
  "order.created": "Order created",
  "order.deleted": "Order deleted",
  "order.status": "Order status changed",
  "order.driver": "Driver changed on order",
  "order.pin_reset": "New delivery PIN created",
  "order.pin_locked": "Delivery PIN locked (5 wrong tries)",
  "driver.added": "Driver added",
  "driver.deactivated": "Driver deactivated",
  "driver.reactivated": "Driver reactivated",
  "driver.link_created": "Driver app link sent",
  "driver.link_revoked": "Driver app switched off",
  "company.roles": "Account type changed",
  "customer.forgotten": "Customer details removed (POPIA)",
};

function describe(e: Entry) {
  const d = e.details;
  const parts: string[] = [];
  if (typeof d.reference === "string") parts.push(d.reference);
  if (typeof d.name === "string") parts.push(d.name);
  if (typeof d.from === "string" && typeof d.to === "string" && e.action === "order.status") {
    parts.push(`${d.from.replaceAll("_", " ")} → ${d.to.replaceAll("_", " ")}`);
  }
  return parts.join(" · ");
}

async function ActivityList() {
  const { company, role } = await requireLogistics();
  if (role !== "owner") {
    return <p className="text-sm text-kerb">Only the account owner can see the activity log.</p>;
  }
  const supabase = await createClient();
  const [{ data, error }, { data: drivers }] = await Promise.all([
    supabase
      .from("audit_log")
      .select("id, action, details, actor_user_id, actor_driver_id, at")
      .eq("company_id", company.id)
      .order("at", { ascending: false })
      .limit(200),
    supabase.from("drivers").select("id, name").eq("company_id", company.id),
  ]);
  if (error) throw new Error("Could not load activity");
  const driverNames = new Map((drivers ?? []).map((d) => [d.id as string, d.name as string]));
  const entries = (data ?? []) as Entry[];

  if (entries.length === 0) return <p className="text-sm text-kerb">No activity yet.</p>;

  const fmt = new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Johannesburg",
  });

  return (
    <ul className="divide-y divide-line">
      {entries.map((e) => (
        <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-sm">
          <div className="min-w-0">
            <p className="font-semibold">{LABELS[e.action] ?? e.action}</p>
            <p className="text-kerb">
              {describe(e)}
              {e.actor_driver_id
                ? ` · by driver ${driverNames.get(e.actor_driver_id) ?? ""}`
                : e.actor_user_id
                  ? " · by your team"
                  : " · by customer or system"}
            </p>
          </div>
          <time className="shrink-0 text-xs text-kerb" dateTime={e.at}>
            {fmt.format(new Date(e.at))}
          </time>
        </li>
      ))}
    </ul>
  );
}

export default function ActivityPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Activity</h1>
        <p className="text-sm text-kerb">
          A permanent record of important changes. Entries can&apos;t be edited or deleted.
        </p>
      </div>
      <Card>
        <Suspense fallback={<p className="text-sm text-kerb">Loading…</p>}>
          <ActivityList />
        </Suspense>
      </Card>
    </div>
  );
}
