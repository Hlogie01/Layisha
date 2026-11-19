import { NextResponse } from "next/server";
import { logisticsForApi } from "@/lib/dispatch-api";
import { createClient } from "@/lib/supabase/server";

export interface ChatSummary {
  topic: string | null;
  totalUnread: number;
  drivers: {
    id: string;
    name: string;
    active: boolean;
    unread: number;
    last: { body: string; sender_type: string; created_at: string } | null;
  }[];
}

/** Driver list for the chat screen: unread counts and last message, plus the live topic. */
export async function GET() {
  const membership = await logisticsForApi();
  if (!membership) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  const companyId = membership.company.id;
  const supabase = await createClient();

  const [drivers, unread, recent, topic] = await Promise.all([
    supabase.from("drivers").select("id, name, active").eq("company_id", companyId).order("name"),
    supabase
      .from("chat_messages")
      .select("driver_id")
      .eq("company_id", companyId)
      .eq("sender_type", "driver")
      .is("read_by_dispatch_at", null)
      .limit(2000),
    supabase
      .from("chat_messages")
      .select("driver_id, body, sender_type, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.rpc("dispatch_chat_topic", { p_company_id: companyId }),
  ]);

  if (drivers.error || unread.error || recent.error) {
    console.error("[dispatch-chat] summary", drivers.error ?? unread.error ?? recent.error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  const unreadBy = new Map<string, number>();
  for (const r of unread.data ?? []) unreadBy.set(r.driver_id, (unreadBy.get(r.driver_id) ?? 0) + 1);
  const lastBy = new Map<string, { body: string; sender_type: string; created_at: string }>();
  for (const r of recent.data ?? []) if (!lastBy.has(r.driver_id)) lastBy.set(r.driver_id, r);

  const list = (drivers.data ?? [])
    .map((d) => ({
      id: d.id as string,
      name: d.name as string,
      active: d.active as boolean,
      unread: unreadBy.get(d.id) ?? 0,
      last: lastBy.get(d.id) ?? null,
    }))
    .filter((d) => d.active || d.last)
    .sort((a, b) => {
      if (a.unread !== b.unread) return b.unread - a.unread;
      return (b.last?.created_at ?? "").localeCompare(a.last?.created_at ?? "");
    });

  const body: ChatSummary = {
    topic: (topic.data as string | null) ?? null,
    totalUnread: [...unreadBy.values()].reduce((a, b) => a + b, 0),
    drivers: list,
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
