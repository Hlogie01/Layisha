import { NextResponse } from "next/server";
import { driverDb, driverTokenFromCookie, todayInSa, whoami } from "@/lib/driver-session";

/** The signed-in driver's stops for today (or ?date=YYYY-MM-DD). */
export async function GET(request: Request) {
  const token = await driverTokenFromCookie();
  if (!token) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  const me = await whoami(token);
  if (!me) return NextResponse.json({ error: "link_revoked" }, { status: 401 });

  const url = new URL(request.url);
  const rawDate = url.searchParams.get("date");
  const date = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : todayInSa();

  const { data, error } = await driverDb().rpc("driver_run", { p_token: token, p_date: date });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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
