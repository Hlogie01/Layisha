import { NextResponse } from "next/server";
import { z } from "zod";
import type { ChatMessage } from "@/lib/chat";
import { logisticsForApi } from "@/lib/dispatch-api";
import { createClient } from "@/lib/supabase/server";

/** One driver's conversation (?driver=uuid, optional ?since=ISO). */
export async function GET(request: Request) {
  const membership = await logisticsForApi();
  if (!membership) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  const url = new URL(request.url);
  const driver = z.string().uuid().safeParse(url.searchParams.get("driver"));
  if (!driver.success) return NextResponse.json({ error: "Choose a driver" }, { status: 400 });
  const since = url.searchParams.get("since");
  const sinceOk = since && !Number.isNaN(Date.parse(since)) ? since : null;

  const supabase = await createClient();
  let query = supabase
    .from("chat_messages")
    .select(
      "id, order_id, sender_type, body, quick_reply, broadcast_id, created_at, read_by_driver_at, read_by_dispatch_at, order:orders(reference)",
    )
    .eq("company_id", membership.company.id)
    .eq("driver_id", driver.data)
    .order("created_at", { ascending: false })
    .limit(200);
  if (sinceOk) {
    query = query.or(
      // Quoted: ISO timestamps contain characters PostgREST treats as separators.
      `created_at.gt."${sinceOk}",read_by_driver_at.gt."${sinceOk}",read_by_dispatch_at.gt."${sinceOk}"`,
    );
  }
  const { data, error } = await query;
  if (error) {
    console.error("[dispatch-chat] fetch", error.message);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  const messages: ChatMessage[] = (data ?? [])
    .map((m) => {
      const order = Array.isArray(m.order) ? m.order[0] : m.order;
      return {
        id: m.id,
        order_id: m.order_id,
        order_reference: (order as { reference?: string } | null)?.reference ?? null,
        sender_type: m.sender_type,
        body: m.body,
        quick_reply: m.quick_reply,
        is_broadcast: m.broadcast_id != null,
        created_at: m.created_at,
        read_by_driver_at: m.read_by_driver_at,
        read_by_dispatch_at: m.read_by_dispatch_at,
      } as ChatMessage;
    })
    .reverse();

  return NextResponse.json({ messages }, { headers: { "Cache-Control": "no-store" } });
}
