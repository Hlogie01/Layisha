import { NextResponse } from "next/server";
import { driverDb, driverTokenFromCookie } from "@/lib/driver-session";

/** Marks dispatch's messages as read by the driver (blue ticks). */
export async function POST() {
  const token = await driverTokenFromCookie();
  if (!token) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  const { error } = await driverDb().rpc("driver_chat_mark_read", { p_token: token });
  if (error) {
    console.error("[driver-chat] read", error.message);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
