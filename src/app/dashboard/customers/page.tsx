import type { Metadata } from "next";
import { Suspense } from "react";
import { Card } from "@/components/ui";
import { requireLogistics } from "@/lib/dal";
import { formatSaPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { ForgetCustomerButton } from "./forget-button";

export const metadata: Metadata = { title: "Customers" };

interface CustomerRow {
  id: string;
  name: string;
  whatsapp: string;
  address_text: string | null;
  location_confirmed_at: string | null;
  created_at: string;
}

async function CustomerList() {
  const { company, role } = await requireLogistics();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, whatsapp, address_text, location_confirmed_at, created_at")
    .eq("company_id", company.id)
    .order("name")
    .limit(500);
  if (error) throw new Error("Could not load customers");
  const customers = (data ?? []) as CustomerRow[];

  if (customers.length === 0) {
    return <p className="text-sm text-kerb">Customers appear here once you create orders.</p>;
  }

  return (
    <ul className="divide-y divide-line">
      {customers.map((c) => {
        const removed = c.whatsapp.startsWith("removed-");
        return (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className={removed ? "font-semibold text-kerb" : "font-semibold"}>{c.name}</p>
              {!removed ? (
                <p className="text-sm text-kerb">
                  {formatSaPhone(c.whatsapp)}
                  {c.address_text ? ` · ${c.address_text}` : ""}
                </p>
              ) : null}
              {!removed ? (
                <p className="text-xs text-kerb">
                  {c.location_confirmed_at ? "Location confirmed" : "No confirmed location"}
                </p>
              ) : null}
            </div>
            {role === "owner" && !removed ? (
              <ForgetCustomerButton customerId={c.id} name={c.name} />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export default function CustomersPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Customers</h1>
        <p className="text-sm text-kerb">
          If a customer asks you to delete their information (their right under POPIA), use
          &quot;Remove personal details&quot;. Their orders stay for your records, without their
          name, number, location or delivery photos.
        </p>
      </div>
      <Card>
        <Suspense fallback={<p className="text-sm text-kerb">Loading customers…</p>}>
          <CustomerList />
        </Suspense>
      </Card>
    </div>
  );
}
