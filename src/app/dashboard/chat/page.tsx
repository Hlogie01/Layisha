import type { Metadata } from "next";
import { Suspense } from "react";
import { requireLogistics } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { ChatScreen, type OrderOption } from "./chat-screen";

export const metadata: Metadata = { title: "Chat" };

/** YYYY-MM-DD, `days` days ago. */
function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function Chat({ searchParams }: { searchParams: PageProps<"/dashboard/chat">["searchParams"] }) {
  const { company } = await requireLogistics();
  const params = await searchParams;
  const uuid = /^[0-9a-f-]{36}$/i;
  const driver = typeof params.driver === "string" && uuid.test(params.driver) ? params.driver : null;
  const order = typeof params.order === "string" && uuid.test(params.order) ? params.order : null;

  // Open orders from the last few days, so dispatchers can tag a message with one.
  const since = daysAgo(3);
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("id, reference, driver_id, customer:customers(name)")
    .eq("company_id", company.id)
    .gte("delivery_date", since)
    .not("status", "in", "(delivered,cancelled)")
    .order("created_at", { ascending: false })
    .limit(300);

  const orders: OrderOption[] = (data ?? []).map((o) => {
    const c = Array.isArray(o.customer) ? o.customer[0] : o.customer;
    return {
      id: o.id,
      reference: o.reference,
      driver_id: o.driver_id,
      customer: (c as { name?: string } | null)?.name ?? "",
    };
  });

  return <ChatScreen initialDriverId={driver} initialOrderId={order} orders={orders} />;
}

export default function ChatPage({ searchParams }: PageProps<"/dashboard/chat">) {
  return (
    <Suspense fallback={<p className="text-sm text-kerb">Loading chat…</p>}>
      <Chat searchParams={searchParams} />
    </Suspense>
  );
}
