import type { Metadata } from "next";
import { Suspense } from "react";
import { Card } from "@/components/ui";
import { requireLogistics } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import type { Driver } from "@/lib/types";
import { OrderForm } from "./order-form";

export const metadata: Metadata = { title: "New order" };

async function NewOrder() {
  const { company } = await requireLogistics();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("drivers")
    .select("id, company_id, name, phone, vehicle, active")
    .eq("company_id", company.id)
    .eq("active", true)
    .order("name");
  if (error) throw new Error(error.message);

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(
    new Date(),
  );
  return <OrderForm drivers={(data ?? []) as Driver[]} today={today} />;
}

export default function NewOrderPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">New order</h1>
      <Card>
        <Suspense fallback={<p className="text-sm text-kerb">Loading…</p>}>
          <NewOrder />
        </Suspense>
      </Card>
    </div>
  );
}
