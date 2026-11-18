import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { driverDb, driverTokenFromCookie, todayInSa, whoami } from "@/lib/driver-session";
import { allow } from "@/lib/rate-limit";

/** The signed-in driver's stops for today (or ?date=YYYY-MM-DD). */
export async function GET(request: Request) {
  const token = await driverTokenFromCookie();
  if (!token) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  const tokenKey = createHash("sha256").update(token).digest("hex").slice(0, 24);
  if (!(await allow(`driver-run:${tokenKey}`, 120, 600))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const me = await whoami(token);
  if (!me) return NextResponse.json({ error: "link_revoked" }, { status: 401 });

  const url = new URL(request.url);
  const rawDate = url.searchParams.get("date");
  const date = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : todayInSa();

  const { data, error } = await driverDb().rpc("driver_run", { p_token: token, p_date: date });
  if (error) {
    console.error("[driver-run]", error.message);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  return NextResponse.json(
    {
      driver: { name: me.driver_name, company: me.company_name },
      date,
      stops: data ?? [],
      fetchedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
