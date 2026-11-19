import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_MESSAGE_LENGTH } from "@/lib/chat";
import { driverDb, driverTokenFromCookie } from "@/lib/driver-session";
import { allow } from "@/lib/rate-limit";

function keyFor(token: string) {
  return createHash("sha256").update(token).digest("hex").slice(0, 24);
}

/** The driver's chat with dispatch (?since=ISO for only what changed). */
export async function GET(request: Request) {
  const token = await driverTokenFromCookie();
  if (!token) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  if (!(await allow(`driver-chat-read:${keyFor(token)}`, 300, 600))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const since = new URL(request.url).searchParams.get("since");
  const sinceOk = since && !Number.isNaN(Date.parse(since)) ? since : null;

  const { data, error } = await driverDb().rpc("driver_chat_fetch", { p_token: token, p_since: sinceOk });
  if (error) {
    console.error("[driver-chat] fetch", error.message);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "link_revoked" }, { status: 401 });
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}

const sendSchema = z.object({
  id: z.string().uuid(),
  body: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
  order_id: z.string().uuid().nullish(),
  quick_reply: z.string().max(40).nullish(),
  client_sent_at: z.string().datetime().nullish(),
});

/** Send a message as the driver. Safe to resend (offline retries). */
export async function POST(request: Request) {
  const token = await driverTokenFromCookie();
  if (!token) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  if (!(await allow(`driver-chat-send:${keyFor(token)}`, 40, 600))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const parsed = sendSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Message is empty or too long" }, { status: 400 });
  const m = parsed.data;

  const { error } = await driverDb().rpc("driver_chat_send", {
    p_token: token,
    p_id: m.id,
    p_body: m.body,
    p_order_id: m.order_id ?? null,
    p_quick_reply: m.quick_reply ?? null,
    p_client_sent_at: m.client_sent_at ?? null,
  });
  if (error) {
    if (error.code === "28000") return NextResponse.json({ error: "link_revoked" }, { status: 401 });
    const message = error.code === "P0001" ? error.message : "Could not send, try again";
    if (error.code !== "P0001") console.error("[driver-chat] send", error.message);
    return NextResponse.json({ error: message }, { status: error.code === "P0001" ? 422 : 500 });
  }
  return NextResponse.json({ ok: true });
}
